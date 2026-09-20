# BidPilot — Database Foundation (Milestone 1)

BidPilot is a new product (AI tender intelligence for contractors) built on
top of the same engine as Papyr, the WhatsApp document assistant. This
document covers **Milestone 1 only**: the persistence and tenant/auth
foundation. No tender processing, AI extraction, eligibility engine, web
frontend, Telegram, or billing exists yet — those are later milestones.

Papyr's WhatsApp path is **completely unaffected** by any of this. It has no
database today and still has none after this milestone; nothing in
`router.js`, `whatsapp.js`, or the extraction engine imports anything under
`src/db/` or `src/bidpilot/`.

## ORM decision: Drizzle (not Prisma)

Both were evaluated against this specific repository, not in the abstract.

| | Drizzle (chosen) | Prisma |
|---|---|---|
| Fit with a plain-JS (no TypeScript) codebase | Its main advantage (compile-time type inference) is muted here, same as Prisma's — a wash | Same |
| Render deploy | Pure npm packages (`drizzle-orm`, `pg`) — no separate binary, no `generate` step that fetches a platform-specific engine at build time | Ships a native query-engine binary; needs `prisma generate` + correct `binaryTargets` for Render's build image, or deploys can fail with "engine not found for this platform" |
| Consistency with this repo's existing choices | This project already deliberately avoids native/system-binary dependencies on Render (`@napi-rs/canvas` was picked specifically as a pure-npm rasterizer to avoid a poppler system binary — see brand/BRAND.md history). Drizzle continues that precedent | Would introduce exactly the class of platform-binary risk this repo has previously chosen to avoid |
| Migrations | `drizzle-kit generate` emits plain, readable `.sql` files in `drizzle/` — reviewable in a PR diff before they ever touch a database | Prisma Migrate's migration files are also SQL, but generated via a more opaque engine-driven diff process |
| Query style | SQL-like query builder, close to what you'd write by hand | Its own DSL query API, one layer further from SQL |

**Decision: Drizzle + `pg` (node-postgres) + `drizzle-kit`.** The deciding
factors were Render deploy simplicity (no native binary to fetch/match) and
migration reviewability (plain SQL you can read before applying), both of
which matter more here than Drizzle's type-safety edge, which is largely
neutralized by this being a plain-JS project.

### Connection pooling
Render runs this service as one long-lived Node process (not serverless), so a
small fixed `pg.Pool` (default max 10, `DATABASE_POOL_MAX`) is sufficient — no
external pooler (pgBouncer, Prisma Accelerate, etc.) is needed at this scale.
If BidPilot later runs multiple instances or background workers, the **sum**
of every instance's pool must stay under Postgres's `max_connections` — a
concern for a later milestone, not this one.

### Coexistence with Papyr
Same backend package (`whatsapp-doc-assistant/backend/`), same `package.json`,
same test runner, same Render service — but a completely separate module tree
(`src/db/`, `src/bidpilot/`) that Papyr's code never imports. This was a
deliberate choice for Milestone 1: introducing a second deployable
service/repo now would be new infrastructure before there's BidPilot business
logic to justify it. Revisit if/when BidPilot grows enough to warrant its own
deploy lifecycle.

## Schema overview

18 tables, all in `src/db/schema/*.js` (single import surface:
`src/db/schema/index.js`):

**Identity & tenancy** — `users`, `companies`, `company_members` (join table,
one addition beyond the requested list — see below), `company_profiles`.

**Tender core** — `tenders`, `tender_pages`, `tender_documents`.

**Requirements & evidence** — `tender_requirements`,
`tender_requirement_evidence`, `tender_boq_items`, `compliance_items`.

**Activity** — `tender_questions`, `tender_events`.

**Billing/usage (schema only, no logic yet)** — `subscriptions`,
`usage_records`.

**Integration & platform** — `telegram_users`, `notifications`, `audit_logs`.

### One addition beyond the requested table list: `company_members`
The instructions listed a fixed set of tables but not this join table. Added
because "Team accounts" is an explicitly planned feature (product spec item
19), and a `users.company_id` single-FK design would need a hard migration
later to support one user belonging to multiple companies. `company_members`
(user_id, company_id, role, unique on the pair) gets this right from the
start — exactly the kind of decision the audit flagged as expensive to fix
eight milestones from now.

### Key design decisions

- **Business status vs. processing status are separate columns** on `tenders`
  (`status`: NEW…CLOSED lifecycle; `processingStatus`: UPLOADED…FAILED
  pipeline state). A SUBMITTED tender whose re-uploaded addendum is still
  EXTRACTING must not have either status lie about the other.
- **Evidence-first is enforced in code, not just documented.** There is no
  exported function to create a bare `tender_requirements` row.
  `src/bidpilot/repo/requirements.js`'s `createRequirementWithEvidence()` is
  the only path, requires a non-empty evidence array, and writes the
  requirement + evidence in one transaction. See
  `test/db/requirements-evidence.test.js`.
- **Eligibility/compliance status is a 3-value enum** (`MEETS` / `UNKNOWN` /
  `DOES_NOT_APPEAR_TO_MEET`) — deliberately never a numeric score or
  "probability of winning." This mirrors the product spec's explicit
  prohibition on that (PHASE 9).
- **List-shaped company-profile facts are `jsonb`, not normalized tables**
  (certifications, licenses, equipment, OEM relationships, past project
  experience). None of these are independently queried today (the eligibility
  engine reads the whole profile per tender); promoting one to its own table
  later is a small, isolated migration if that ever changes.
- **`tenders.companyId` uses `ON DELETE RESTRICT`**, not cascade — deleting a
  company that has tenders is blocked at the database level, preventing silent
  bulk data loss. Most tender-child tables (`tender_pages`,
  `tender_requirements`, etc.) cascade from `tenders`, since they have no
  independent existence once their tender is gone.
- **`audit_logs.entityId` is a plain uuid, not a foreign key** — an audit row
  must survive the entity it describes being deleted later; that's the point
  of an audit trail.
- **`users.email` uniqueness is case-insensitive**, via a unique index on
  `lower(email)` (a plain `UNIQUE` constraint can't express that in Postgres).

## Tenant isolation

Enforced at the repository layer, not left to callers to remember, via
`src/bidpilot/repo/tenants.js`:

```js
const scope = await requireCompanyAccess(db, { userId, companyId });
const tender = await scope.getOwned(tenders, tenders.id, tenders.companyId, tenderId);
```

- `requireCompanyAccess()` checks `company_members` and throws
  `TenantAccessError` if the user isn't a member — there is no way to obtain a
  `CompanyScope` without passing this check.
- Every `CompanyScope` method (`getOwned`, `listOwned`, `insertOwned`,
  `updateOwned`) bakes the `company_id` predicate into the query itself — a
  caller cannot express "give me this row regardless of owner."
- A cross-tenant lookup returns `undefined`, identical to "not found" — never
  a distinguishable 403, which would leak that the id is valid.
- Resources that don't carry their own `company_id` (requirements, evidence,
  documents, pages — all children of `tenders`) are protected by first
  confirming the parent tender is owned by the caller's scope, then trusting
  its id. `createRequirementWithEvidence()` is the reference implementation of
  this pattern.

**Proven in `test/db/tenant-isolation.test.js`** against a real Postgres, all
five scenarios the milestone specified: Company A cannot read, list, or modify
Company B's tenders; cannot access Company B's documents; cannot access
Company B's requirements or compliance data — including an explicit "guessed
id" attack attempt.

## Migration commands

```bash
# Generate SQL from schema changes (review the output before committing!)
npm run db:generate

# Apply pending migrations to whatever DATABASE_URL points at
npm run db:migrate

# Browse the database visually (dev only)
npm run db:studio
```

Generated migrations land in `drizzle/*.sql` — plain, readable SQL, committed
to the repo. **Read every generated migration before applying it.** (This
milestone's own first draft had a real bug caught this way — a case-insensitive
email uniqueness constraint that drizzle-kit generated as `UNIQUE("")` because
of an incorrect builder choice. Fixed before ever touching a database — see
git history for `src/db/schema/identity.js`.)

## Local development setup

Needs a local/dev Postgres — **never point local development at the
production database.**

```bash
# One-time: create a dev database (adjust for your own Postgres setup)
createdb bidpilot_dev
psql -d bidpilot_dev -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'

# In .env:
DATABASE_URL=postgres://<user>:<password>@localhost:5432/bidpilot_dev

npm run db:migrate
npm test    # runs Papyr's suite + BidPilot's DB suite (test/db/*.test.js)
```

If `DATABASE_URL` is unset, every `test/db/*.test.js` file skips cleanly with
a clear message — the rest of the suite (Papyr) is entirely unaffected either
way.

## Render production setup

1. Render dashboard → **New → PostgreSQL** (a separate managed instance, not
   bundled into the web service).
2. Copy its **Internal Database URL**.
3. Web service → **Environment** → set `DATABASE_URL` to that value directly
   in the Render dashboard. **Never** commit a real connection string —
   `.env.example` documents variable names only.
4. Run `npm run db:migrate` **once**, from a shell with that `DATABASE_URL`
   (Render's dashboard Shell tab, or a local machine pointed at the prod URL
   deliberately, as a one-off, reviewed action — not part of the normal
   deploy). Automating this into the deploy pipeline is worth doing once
   BidPilot has a stable migration cadence; for Milestone 1, applying it by
   hand keeps a human in the loop for the very first production migration.
5. No Docker, no separate worker dyno — this milestone needs neither.

## Security considerations

- **No secrets committed.** `.env.example` lists `DATABASE_URL` as a name
  only, with a `localhost` placeholder.
- **Tenant isolation is enforced in code** (`CompanyScope`), not left to
  frontend filtering or convention — see above.
- **`audit_logs` cannot silently contain a secret.** `recordAuditLog()`
  (`src/bidpilot/repo/audit.js`) rejects `metadata` containing `password`,
  `token`, `apiKey`, `secret`, `authorization` (case-insensitive) — proven in
  `test/db/audit.test.js`.
- **Telegram identity cannot spoof company access.** `telegram_users` has no
  `companyId` column at all; company access is only ever derived through a
  verified `userId` → `company_members` link, never accepted from anything
  Telegram supplies directly (see `src/db/schema/telegram.js`'s docblock —
  relevant once Telegram linking is actually built, later).
- **No auth (login/session/JWT) is implemented in this milestone.** `users`
  has a `passwordHash` column so a later milestone doesn't need another
  migration to add it, but there is no signup/login endpoint yet — building
  one was out of scope for "database foundation" and is a clear next step.

## Existing in-memory mechanisms — left untouched

Per the milestone instructions, none of these were removed or migrated:

| Mechanism | File | Future path |
|---|---|---|
| WhatsApp sessions | `src/sessions.js` | Would move to a `whatsapp_sessions`-style table (or Redis) once Papyr itself needs multi-instance/restart-durable state — no evidence it does yet |
| Webhook dedup | `src/dedupe.js` | Redis (as its own comment already says) if Papyr ever runs >1 instance |
| Rate limiting | `src/ratelimit.js` | Same — in-memory is fine for one instance |
| AI spend budget | `src/budget.js` | BidPilot's equivalent (multi-tenant, persistent) would live in `usage_records` — Papyr's stays in-memory; they are unrelated systems |

None of this migration is needed for Milestone 1 and doing it now would be
unrequested scope expansion on a system (Papyr) that already works.

## Known vulnerabilities (dependency audit)

`npm audit` reports 4 moderate-severity findings, all in `drizzle-kit`'s
dev-time `esbuild`/`@esbuild-kit` toolchain — a CLI used only to generate
migrations, never imported by the running server. Not forced-fixed this
milestone since the available fix is a breaking `drizzle-kit` downgrade with
no production exposure to justify it; worth revisiting on `drizzle-kit`'s next
stable release.

## Unresolved decisions (deliberately left for later milestones)

- **Auth implementation** (password hashing algorithm, session vs. JWT,
  signup/login endpoints) — schema is ready (`passwordHash` column), nothing
  else built.
- **Whether BidPilot ever becomes a separate deployable service** — currently
  shares Papyr's backend package; revisit once there's enough BidPilot logic
  to justify the split.
- **Automating `db:migrate` into the deploy pipeline** — currently a manual,
  reviewed step; worth revisiting once the migration cadence stabilizes.
- **Data retention / deletion policies** (product spec PHASE 23) — schema
  allows hard deletes via cascade where appropriate, but no retention job or
  soft-delete convention exists yet.

## Tests

`test/db/*.test.js` (33 tests, run against a real Postgres):

- `connection.test.js` — migration applied, all 18 tables exist,
  `gen_random_uuid()` works.
- `tenant-isolation.test.js` — the five named scenarios (read/list/modify a
  foreign tender, foreign documents, foreign requirements/compliance) plus a
  guessed-id attack attempt and the base membership check.
- `requirements-evidence.test.js` — the evidence-first invariant.
- `constraints.test.js` — case-insensitive email uniqueness, one profile per
  company (upsert), unique page numbers per tender, unique Telegram id,
  status/processingStatus defaults and independence, `RESTRICT` on company
  deletion.
- `audit.test.js` — the metadata redaction denylist, and that audit rows
  outlive the entities they describe.

Plus Papyr's full existing suite (131 tests) run unmodified — **all still
green**, both with and without `DATABASE_URL` set.

## Suggested next milestone

**Milestone 3 (Tender Ingestion)** over Milestone 2 as literally numbered —
the company-profile *shape* already exists from this milestone
(`company_profiles`), so the highest-value next step is proving the schema
against a real upload: `POST /tenders/upload` → validate → store → page-aware
extraction (reusing `pdf.js`/OCR as-is) → populate `tender_pages` →
async processing states. That exercises the schema under real data before any
more tables get added on top of it, and is where the "don't blindly process a
300-page PDF in one request" architecture (already built for Papyr's OCR/
extraction isolation) gets reused for BidPilot, not rebuilt.

---

# Milestone 2 — Tender Ingestion (vertical slice)

Proves: **PDF upload → secure validation → durable Tender record → page-aware
extraction/OCR → TenderPage records → durable processing status →
completion/failure.** Nothing beyond this — no structured AI extraction,
eligibility, compliance, BOQ intelligence, RAG, web UI, Telegram, or billing.
Papyr's WhatsApp path remains completely untouched.

## Storage decision

**The database stores metadata and a reference key, never the PDF bytes.**
Tender documents are commercially sensitive, so all access goes through a
short-lived signed URL — never a public path or a raw filesystem read.

A small interface (`putObject`, `getSignedDownloadUrl`, `deleteObject`,
`newKey`) with two backends:

| | `LocalDiskStorage` | `S3Storage` |
|---|---|---|
| Use | Dev/testing only | **Production** |
| Dependencies | None (real local disk) | Any S3-compatible provider — AWS S3, Cloudflare R2, Backblaze B2, Supabase Storage |
| "Signed URL" | HMAC-signed, time-limited token verified by our own `routes/download.js` — same *shape* of guarantee (expires, unforgeable, unguessable) as a real presigned URL, with zero external service | A real S3 presigned URL — goes straight to the storage provider, never touches this app |
| **Viable on Render?** | **No.** Render's standard web service disk is ephemeral and is wiped on every redeploy. A tender uploaded today must still be retrievable next month; local disk cannot promise that. | **Yes — this is the only viable production answer**, not a "nice to have later." |

This is a firmer conclusion than "avoid local filesystem dependence" as a
preference — it's a hard constraint of Render's hosting model. Any real
BidPilot deployment needs `BIDPILOT_STORAGE_DRIVER=s3` from day one.

**Recommended default provider: Cloudflare R2** — S3-compatible (same code
path), zero egress fees (relevant for a bootstrapped beta where documents get
downloaded repeatedly), simple setup. Not hardcoded: `BIDPILOT_S3_ENDPOINT`
makes any S3-compatible provider a config change, not a code change.

**Testing honesty:** this sandbox has no real cloud credentials.
`LocalDiskStorage` is tested fully, for real (`test/bidpilot/storage-local.test.js`,
7 tests against real local disk + real HMAC verification, plus the full
upload/download round-trip in `upload.test.js`). `S3Storage`
(`test/bidpilot/storage-s3.test.js`) is tested against a **mocked** `S3Client` —
it verifies the exact commands and parameters sent (`PutObjectCommand`,
`DeleteObjectCommand`, key construction, `forcePathStyle` logic), not live
wire behavior against a real bucket. **Smoke-test `S3Storage` against a real
bucket before the first production upload** — see "unresolved decisions."

Storage keys are **always server-generated** (`crypto.randomUUID()`), never
derived from the uploaded filename — this eliminates path traversal by
construction, not validation. Proven in `upload.test.js` ("a path-traversal
filename never affects the storage key or leaves the storage dir") and
directly in `validate.test.js`'s `sanitizeFilename` tests (bypassing any HTTP
client's own filename normalization, which made an earlier manual check of
this inconclusive).

## API endpoints

Mounted at `/bidpilot` in `server.js`, entirely separate from Papyr's
`/webhook` — no shared routes, middleware, or state. If `DATABASE_URL` isn't
configured, `/bidpilot/*` returns `503` cleanly rather than the server failing
to boot; a Papyr-only deployment is unaffected either way.

- `POST /bidpilot/tenders/upload` — multipart (`companyId` field + `file`).
  Returns `{ tenderId, status, processingStatus, duplicate }` immediately;
  extraction runs after the response is sent.
- `GET /bidpilot/tenders/:id?companyId=` — status + page count.
- `GET /bidpilot/tenders/:id/document-url?companyId=` — a signed download URL
  for the original PDF (5 min expiry).
- `GET /bidpilot/files/:key` — serves `LocalDiskStorage`-backed downloads;
  meaningless (never reached) under the `s3` driver, since S3 presigned URLs
  point directly at the provider.

## ⚠️ Placeholder identity — explicitly not authentication

Every `/tenders/*` route requires an `x-bidpilot-user-id` header naming a real
`users.id`. **This is not authentication** — no password, no signature, no
session, no expiry. It exists only so this milestone's tenant-scope
enforcement (`CompanyScope`) has a real identity to test against, without
pretending a login system exists. See `src/bidpilot/routes/auth.js`'s
docblock. **Do not expose these routes to real traffic** until a real auth
milestone (password/session/JWT — `users.passwordHash` is already there for
this) replaces it.

The download route (`/bidpilot/files/:key`) deliberately requires **no**
identity header at all — a signed URL is meant to be self-authorizing. Getting
this right required a real fix: an earlier draft mounted the identity
middleware unscoped (`router.use(requireIdentity())`), which — because both
routers share the `/bidpilot` prefix — silently intercepted download requests
too. Fixed by scoping it explicitly (`router.use('/tenders', requireIdentity())`);
caught via a manual end-to-end smoke test before it reached the automated
suite.

## Processing state machine

`tenders.status` (business lifecycle) and `tenders.processingStatus`
(pipeline state) stay independent, per Milestone 1's design. This milestone
drives `processingStatus` through:

```
UPLOADED → PROCESSING → EXTRACTING → COMPLETED
                                   ↘ FAILED (processingError set, capped at 500 chars)
```

`ANALYZING` is defined in the schema (Milestone 1) but unused until the
structured-AI milestone.

## Extraction flow (100% reused, nothing rewritten)

`src/bidpilot/ingestion/pipeline.js` calls `extractStructured()` from
`src/pdf.js` completely unmodified — the same isolated, heap-capped,
page-aware, per-page-OCR-fallback engine Papyr already uses. This file's only
job is mapping that output onto `tender_pages` rows (`pageNumber`, `rawText`
via `spansToText()`, `ocrUsed`). No new extraction code was written.

The buffer is validated and stored once at upload time; the async extraction
step reuses that SAME in-memory buffer (passed directly into the
`setImmediate` closure) rather than reading it back from storage — this keeps
the storage interface small (no generic "read bytes" method that `S3Storage`
would otherwise need to expose for no other reason).

## Security controls

- **Untrusted input, checked at multiple layers**: magic-byte check
  (`%PDF-` header, not just the declared MIME type — a renamed non-PDF is
  caught), size cap (`BIDPILOT_MAX_UPLOAD_MB`, both multer's own limit and an
  independent check in `validateUpload`), filename sanitization for display
  only (storage keys are never derived from it).
- **No path traversal possible by construction** — storage keys are always
  `crypto.randomUUID()`-generated; `LocalDiskStorage._resolve()` additionally
  verifies the resolved path stays inside the storage directory as defense in
  depth, even though the key is never attacker-controlled.
- **Tenant isolation** reuses Milestone 1's `CompanyScope` unmodified — every
  route calls `requireCompanyAccess()` before touching a resource. A user
  naming a `companyId` they don't belong to gets `403`; a user who legitimately
  belongs to company A but names a tender that belongs to company B gets
  `404` — deliberately indistinguishable from "doesn't exist," never a
  distinguishable 403 that would leak the id's validity. (An early draft of
  this milestone's own test suite asserted the wrong status here — 403 instead
  of 404 — which is itself evidence the design is intentional and specific,
  not accidental.)
- **No internals leaked in responses** — every route funnels errors through
  a single `handleError()` that returns a generic message; `ValidationError`
  gets its own safe message, everything else is `500` with no stack trace,
  path, or credential ever serialized to the client. Proven in
  `upload.test.js`'s malformed-file test, which asserts the response body
  contains no `node_modules`/stack-frame patterns.
- **Extraction failures never leak document content** — `processingError` is
  the caught error's `message` only, capped at 500 characters, matching the
  existing "safe generic message" discipline `pdf.js` already uses elsewhere.

## Duplicate strategy

Keyed on **sha256 content hash**, scoped **per company** (the same file
uploaded by two different companies is two separate tenders — see the schema
doc's dedupe note). Rule: if the company already has a document with this
hash attached to a tender that is **not** `FAILED`, the upload is treated as
that same tender (`200`, `duplicate: true`, nothing new written, no
reprocessing). If the only match is on a `FAILED` tender, a fresh attempt is
allowed — retrying after a failure is exactly what should happen.

**Concurrency**: a naive "check for a duplicate, then insert" has a real
TOCTOU race under truly simultaneous uploads (two requests can both miss each
other's not-yet-committed rows). Closed with a small in-process lock
(`src/bidpilot/ingestion/uploadLock.js`) serializing ingestion per
`(companyId, contentHash)` — a **new**, narrowly-scoped implementation, not a
reuse of `src/dedupe.js` (that module drops old WhatsApp message ids on a
TTL; this needs two concurrent callers to resolve to the *same* outcome,
a different shape of problem). Proven with a genuine `Promise.all()` of three
simultaneous identical uploads in `upload.test.js` — exactly one creates the
tender, the other two see it as a duplicate.

Tender + TenderDocument creation is wrapped in a single DB transaction — if
the document insert failed after the tender committed, the tender would be an
orphan stuck at `UPLOADED` forever (nothing would ever trigger its
processing). A transaction failing instead leaves an orphaned blob in storage,
the better failure mode: invisible to users, cheap to garbage-collect later,
versus a phantom business record.

## Large-document test results

A synthetic 40-page PDF (`upload.test.js`, "large-document handling") ran the
full pipeline end-to-end in well under a second in this sandbox: uploaded,
extracted via the existing isolated child-process pipeline, all 40 pages
persisted with correct sequential page numbers. Confirms the page-aware,
process-isolated architecture (already proven for Papyr) carries over to
BidPilot's ingestion without modification — no whole-document AI prompt, no
uncontrolled single memory operation.

## Papyr regression results

Full existing suite (131 tests) plus Milestone 1's 33 DB tests: **unmodified,
all still passing**, both with and without `DATABASE_URL` set.

## Queue/scaling decision — and exactly when it stops being enough

**Not introduced this milestone**, per instruction. Extraction runs
**in-process**, fire-and-forget via `setImmediate` — the identical idiom
`server.js` already uses for the WhatsApp webhook ("acknowledge immediately,
do the real work off the request path"). This is honestly **not a durable
queue**: if the process restarts mid-extraction (a Render redeploy, a crash),
that tender is stuck in `PROCESSING`/`EXTRACTING` forever, with nothing to
detect or retry it. For a single Render instance at this milestone's traffic
level, that's an acceptable, explicit gap — not a silent one.

**Introduce a durable job queue (BullMQ + Redis, or a DB-polled job table) at
the point where any of these becomes true:**
1. **Horizontal scaling** — more than one server instance, requiring
   cross-instance job coordination (in-process `setImmediate` has no
   visibility across processes).
2. **Processing time regularly approaches a redeploy's likelihood** — long
   enough that a mid-flight crash/restart losing a job becomes a real user
   complaint, not a theoretical one.
3. **Stuck-job detection becomes a product requirement** — "why has my
   180-page tender been 'processing' for an hour" needs an answer, which
   requires a job system with visibility and retry, not silent in-process
   fire-and-forget.

None of these are true yet. Building BullMQ/Redis now would be exactly the
premature infrastructure this milestone was scoped to avoid.

## Unresolved decisions (deliberately left for later milestones)

- **`S3Storage` needs a live smoke test against a real bucket** before first
  production use — this sandbox has no cloud credentials, so its wire-level
  correctness is verified against a mocked client, not proven end-to-end.
- **Real authentication** — the placeholder identity header must be replaced
  before any public exposure (see above).
- **Stuck-job detection / retry** — no watchdog for a tender stuck in
  `PROCESSING`/`EXTRACTING` after a crash; see "queue/scaling decision."
- **Switching `BIDPILOT_STORAGE_DRIVER` after documents already exist under
  the old driver** requires a manual migration/backfill of existing rows'
  files — not automated.
- **Data retention / deletion** (product spec PHASE 23) — `deleteObject()`
  exists on the storage interface, but no retention job or "delete this
  tender's file" trigger is wired up yet.

## Tests

`test/bidpilot/*.test.js` (48 tests):
- `storage-local.test.js` (7) — real local disk: round-trip, signed-URL
  verify/tamper/expiry/wrong-key, delete, constructor validation.
- `storage-s3.test.js` (5) — mocked `S3Client`: correct commands/params,
  key format, `forcePathStyle` logic, constructor validation.
- `validate.test.js` (~19) — magic-byte/size/MIME checks, and `sanitizeFilename`
  tested directly against raw path-traversal strings (not filtered through an
  HTTP client's own filename handling).
- `upload.test.js` (17) — the full vertical slice over real HTTP (ephemeral
  port), real Postgres, real `LocalDiskStorage`, real extraction: the golden
  path, OCR fallback (genuinely scanned fixture), malformed/oversized
  rejection, tenant isolation (including a 404-vs-403 distinction proven
  deliberate), sequential AND concurrent duplicate handling, path-traversal
  filename safety, the full signed-URL round-trip (byte-exact, tamper
  rejected), and the 40-page large-document case.

Running the DB-backed suites (Milestone 1 + Milestone 2) together surfaced a
real test-infrastructure gap: Node's test runner parallelizes across files by
default, and every DB test file shares one physical dev database with no
isolation — one file's `truncateAll()` could wipe rows another file's test was
using mid-flight. Fixed with `--test-concurrency=1` in `npm test`; documented
here rather than left as a mysterious intermittent failure for later.

## Suggested next milestone

**Structured AI extraction** (the product spec's Milestone 4) — now that
`tender_pages` reliably holds real, page-numbered text for any uploaded
tender, the next value step is running it through a schema-validated
extraction pipeline (requirements, dates, EMD, eligibility criteria) using
the existing `ai/provider.js` transport, writing into
`tender_requirements` + `tender_requirement_evidence` via the
evidence-first `createRequirementWithEvidence()` already built in
Milestone 1. `ANALYZING` (defined, unused until now) becomes real.

---

# Milestone 3 — Authentication & Company Membership Authorization

Replaces Milestone 2's placeholder identity header **entirely** with real
authentication: registration, email/password login, server-side PostgreSQL
sessions, logout, email verification state, CSRF protection, and brute-force
rate limiting. Every BidPilot tender route is now gated by a real session,
not a header anyone could set. Papyr's WhatsApp path is untouched.

## Auth mechanism comparison — recap

Full comparison (email/password+session vs. magic link vs. JWT, evaluated
against this repo's actual architecture) was done and approved before any
code was written — see the conversation record. Chosen: **email/password +
server-side session via a secure HttpOnly cookie**, DB-backed in the same
Postgres already central to this design. Rejected JWT (real revocation needs
a server-side refresh-token table anyway, eroding its main advantage; wider
historical footgun surface) and magic-link-as-the-only-method (adds a
transactional-email dependency this product has never had, for a login
question — Axis A — that's orthogonal to the session-representation question
— Axis B — this milestone actually needed to answer).

## Repo-specific verification before implementing

- **`argon2` (node-argon2)** — installed and tested in this sandbox before
  committing to it: ships prebuilt native binaries for linux-x64/arm64 under
  **both glibc and musl** (covers Debian/Ubuntu- and Alpine-based Render
  images), installed in ~2 seconds with no compiler invoked, and verified
  functionally (hash/verify round-trip, wrong password correctly rejected).
  Same bar Drizzle was held to over Prisma in Milestone 1 — no native-binary
  build risk on Render.
- **`cookie`** — already present as Express's own internal dependency (used
  for `res.cookie()`); added as an explicit direct dependency for stability
  rather than pulling in the separate `cookie-parser` middleware package for
  what `cookie.parse()` already does in one line.
- **Express 5.2.1 confirmed**, and `server.js` did not set `trust proxy` —
  fixed (`app.set('trust proxy', 1)`), required for `Secure` cookies to
  behave correctly behind Render's TLS-terminating proxy.

## Schema additions

One migration, additive only:

- **`users`**: `status` enum (`PENDING_VERIFICATION` / `ACTIVE` /
  `SUSPENDED`, default `PENDING_VERIFICATION`), `emailVerifiedAt`,
  `verificationTokenHash`, `verificationTokenExpiresAt`. The verification
  token lives directly on `users` (not a separate table) — a user only ever
  has one live verification attempt at a time; a new request overwrites it.
- **`sessions`** (new table): `id`, `userId` (FK, cascade), `tokenHash`
  (unique), `createdAt`, `expiresAt` (absolute cap), `lastSeenAt` (throttled
  sliding idle indicator), `userAgent`. **No `companyId` column** — a session
  identifies a user, never a company (see "auth ≠ authorization" below). No
  IP address stored, to limit this table's PII footprint.

## Sessions hashed at rest

The raw session token **never touches the database**. `auth/tokens.js`
generates 256 bits of randomness (`crypto.randomBytes(32)`); only its
SHA-256 hash is stored (`sessions.tokenHash`). Verified directly against the
running database during manual testing: the raw cookie value does not appear
anywhere in the stored row. If the database were ever compromised, the
attacker gets unusable hashes, not replayable session credentials. (Plain
SHA-256, not HMAC — the input is already a uniformly random 256-bit CSPRNG
value, so a precompute/rainbow-table attack is infeasible regardless; the
entropy lives in the token, not a server secret. Contrast with password
hashing, where the input space is small/guessable and a slow salted KDF is
required instead.)

## Cookie configuration

`HttpOnly: true`, `SameSite: Lax`, `Path: /`, and `Secure` **auto-detected**
(true on Render / `NODE_ENV=production`, false otherwise — via the same
`RENDER_EXTERNAL_URL`-detection precedent `server.js` already used for its
keep-alive ping) so local HTTP development isn't silently broken by a Secure
cookie the browser would refuse to send back. `BIDPILOT_COOKIE_SECURE` is an
explicit override for an unusual deployment shape.

## Password hashing

Argon2id, library defaults (time cost 3, memory 64MB, parallelism 4) —
current OWASP guidance, used as-is rather than hand-tuned. Minimum 8
characters (NIST 800-63B: prioritize length over forced complexity rules; no
mandated uppercase/digit/symbol, no forced rotation), rejected if identical to
the email. Never plaintext, reversible encryption, bare SHA-256, or a custom
scheme.

## Authentication ≠ authorization — the actual chain

```
Browser --(HttpOnly session cookie)--> Session --> User
                                                     │
                                    resolved FRESH, every request
                                                     ▼
                                          company_members --> CompanyScope
                                                     │
                                                     ▼
                                       Tender / Documents / Requirements
```

`requireSession()` (`routes/auth.js`) answers ONLY "who is this" and sets
`req.bidpilotUserId` — it never resolves or caches a `companyId`. Every
tender route still calls `requireCompanyAccess()` (Milestone 1, unmodified)
against whatever `companyId` the request names. A session is never scoped to
a single company, so a user belonging to more than one company (the
explicit reason `company_members` was built as a join table in Milestone 1)
never needs to re-login to act on a different one. Milestone 2's
`CompanyScope`/tenant-isolation code required **zero changes** — it already
took a `userId` + `companyId` pair, never trusted an identity object to carry
authorization.

## CSRF protection

Signed double-submit cookie, **no server-side storage**: `csrfTokenFor(sessionTokenHash) = HMAC-SHA256(BIDPILOT_CSRF_SECRET, sessionTokenHash)`,
set in a cookie the frontend can read (the one cookie in the app that is
deliberately **not** HttpOnly) and echoed back as an `x-csrf-token` header on
state-changing requests. `requireCsrf()` is self-exempting for
GET/HEAD/OPTIONS, so it's mounted across the whole `/tenders` subtree rather
than per-route — only the upload endpoint is actually gated. `SameSite=Lax`
already blocks most cross-site vectors for this same-origin app; this is the
OWASP-recommended belt-and-suspenders layer on top. `csrfTokenFor()` throws
loudly if `BIDPILOT_CSRF_SECRET` is unset, rather than silently HMAC-ing with
an empty key.

## Brute-force protection

A **new**, narrowly-scoped limiter (`auth/loginRateLimit.js`) — not a reuse
of `src/ratelimit.js`, whose window is a hardcoded 60s constant tuned for
WhatsApp message throughput. Brute-force protection needs a longer,
configurable window (10 attempts / 15 minutes here), so reusing it directly
would mean either changing Papyr-shared code or silently getting the wrong
window. Same reasoning as `uploadLock.js` in Milestone 2: reuse the concept
(fixed-window in-memory counter), write a new implementation sized for the
actual problem. In-memory, single-instance — same scaling caveat as every
other in-memory mechanism in this codebase at this stage. Cleared on a
successful login so a user who mistyped their password a few times isn't
punished after getting it right.

## Email verification — deliberately no email provider

Registration generates a token; in dev/non-production the verification link
is **logged and returned directly in the API response**
(`devVerificationUrl`) rather than emailed — no transactional email provider
(Resend/Postmark/SES/etc.) was wired in, per instruction. `PENDING_VERIFICATION`
does **not** block login — an unverified user can use the product immediately;
`emailVerifiedAt`/`status` are the explicit state a later feature (or a
stricter gate) can act on. `SUSPENDED` **does** block login, and is checked on
**every** authenticated request via `requireSession()`, not only at login
time — proven directly: a test suspends a user mid-session (after their
cookie was already issued) and confirms their very next request is rejected.
No suspension *mechanism* exists yet (no admin endpoint) — only the state a
later one can transition into, matching the same "give the schema room to
grow" pattern used throughout this schema.

## Manual smoke test — clean on the first pass

Unlike Milestones 1 and 2 (which each surfaced a real bug during manual
testing), this milestone's end-to-end smoke test — register → verify → login
→ inspect Set-Cookie headers → `/me` → CSRF-protected upload (rejected
without the header, accepted with it) → tender status through the new real
session (Milestone 2's pipeline, completely unmodified) → logout → confirm
the old cookie is rejected → 11 rapid login attempts (10 allowed, 11th
`429`) → direct database inspection confirming the stored password hash is
real Argon2id and the stored session value is a hash, never the raw
cookie — passed cleanly on the first run. The extra repo-specific
verification done *before* writing code (argon2's binary distribution, the
`trust proxy` requirement, the auth‑vs‑authorization chain) is the most
likely reason; recorded here as the comparison point for future milestones,
not a guarantee it repeats.

## A real gap this milestone's own test suite required fixing

Updating `test/bidpilot/upload.test.js` (Milestone 2's suite) to use real
sessions instead of the removed placeholder header surfaced that its skip
condition only checked `DATABASE_URL`, not the newly-required
`BIDPILOT_CSRF_SECRET` — a `DATABASE_URL`-only environment (a realistic
misconfiguration: BidPilot's database is set up but the CSRF secret is
forgotten) caused 18 test failures, not clean skips. Fixed by extending both
`upload.test.js`'s and `auth.test.js`'s skip conditions to check for the CSRF
secret independently of database availability. All three realistic
configuration states — neither configured, DB only, both configured — are
now verified to produce zero failures (graceful skips or full runs, never a
crash).

## Tests

`test/bidpilot/auth.test.js` (40 tests): password hashing, token generation,
CSRF token derivation/tamper/cross-session rejection, brute-force limiting,
and — DB-backed — registration (weak password, duplicate email, hashing),
email verification (success, reuse-after-verify, wrong token, expired
token), session creation/lookup/expiry/destruction (with direct proof the
raw token is never stored), and a full HTTP integration pass: register →
verify → login → `/me`, case-insensitive email login, generic-error login
failures (wrong password and nonexistent user return byte-identical error
text), unverified-user-can-login, suspended-user-cannot (both at login and
mid-session), brute-force lockout, CSRF-gated logout, session destruction
actually taking effect, and forged/missing cookies rejected without a 500.

`test/bidpilot/upload.test.js` (Milestone 2's 17 tests, updated): now
authenticates via real minted sessions (`createSession()` directly, not the
HTTP `/login` endpoint — this file tests tender ingestion, not login) plus
real CSRF tokens on the upload route. All prior tenant-isolation, dedupe,
OCR, and large-document coverage is unchanged and still passing through the
new auth layer.

**251 pass, 0 fail** with both `DATABASE_URL` and `BIDPILOT_CSRF_SECRET`
configured (1 unrelated pre-existing skip). Verified clean (0 failures) in
all three realistic configuration states — see above.

## Environment variables added

`BIDPILOT_CSRF_SECRET` (required once BidPilot is used — a real random
secret, e.g. `openssl rand -hex 32`), `BIDPILOT_SESSION_TTL_DAYS` (default
30), `BIDPILOT_SESSION_TOUCH_MINUTES` (default 10), `BIDPILOT_VERIFICATION_TOKEN_TTL_HOURS`
(default 24), `BIDPILOT_COOKIE_SECURE` (optional override). `warnOnMissingConfig`
now warns loudly if `DATABASE_URL` is set but `BIDPILOT_CSRF_SECRET` isn't.

## Unresolved decisions (deliberately left for later milestones)

- **Production transactional email** — a deliberate, later decision (Resend/
  Postmark/SES/etc.), not quietly wired in now.
- **No "resend verification email" endpoint** — a small, natural follow-up if
  needed; skipped for narrowness this milestone.
- **No admin/suspension endpoint** — the `SUSPENDED` state and its enforcement
  exist; nothing can set it yet except a direct database write.
- **No "view/revoke my other active sessions" UI** — `sessions.userAgent` is
  stored specifically to make that easy to add later without another schema
  change; not built this milestone.
- **API/programmatic authentication** (for a future non-browser client) is
  still open — cookies don't travel well outside a browser context; likely a
  separate personal-access-token mechanism layered on later, not a reason to
  revisit the session choice made here.

## Suggested next milestone

Per the approved sequencing: **Structured Tender Intelligence** (product
spec Milestone 4) — now that both the ingestion pipeline (Milestone 2) and a
real, tested authorization boundary (this milestone) exist, the
evidence-first `createRequirementWithEvidence()` built in Milestone 1 can
finally be exercised by real extracted content instead of test fixtures.

---

# Milestone 4 — Structured Tender Intelligence

Builds the AI analysis layer on top of Milestone 2's extraction (unmodified)
and Milestone 3's real auth (unmodified): `POST /tenders/:id/analyze` reads
a tender's `tender_pages`, chunks them by character budget, runs each chunk
through structured AI extraction, validates the output against a strict
domain schema, and persists requirements, BOQ, dates, and red flags —
replacing any previous analysis wholesale. **No eligibility verdict, no
frontend, no RAG.** Papyr's WhatsApp path is untouched; the deterministic
PDF/OCR extraction engine was not modified at all.

## What the audit found already existed

Checked the real M1–M3 schema before proposing anything: most of the
"destination" schema for this milestone was already built in Milestone 1,
deliberately. `requirementCategory`'s enum already covered 10 of 12 needed
categories; `tender_requirement_evidence` already had `sourcePage`,
`evidenceText`, `extractedValue`, `confidence`; `tender_boq_items` existed
unused since M1; `tenders`' overview columns (`organization`, `tenderNumber`,
...) existed but were never populated (M2 only ever set `title` to the
filename). This milestone mostly *populates* existing structure rather than
inventing new destinations for data.

## Schema additions (two migrations, both additive)

- `SPECIAL_CONDITION` added to `requirementCategory` (a clause worth
  flagging, distinct from a bid-eligibility gate — not folded into `OTHER`).
- `tenderAnalysisStatus` enum (`NOT_STARTED → ANALYZING → COMPLETED/FAILED`)
  and three new `tenders` columns: `analysisStatus`, `analysisError`,
  `analyzedAt`. Deliberately **separate** from `processingStatus` (whose own
  `ANALYZING` value, defined in Milestone 1 anticipating this, is now
  explicitly superseded and must never be set again — left in the enum
  rather than removed, since Postgres enum values aren't cheaply
  droppable, but documented as dead). Same "business vs. processing status"
  separation principle Milestone 1 established for `tenders.status` vs.
  `tenders.processingStatus`, applied one level further.
- `tenders.overviewEvidence` (jsonb) — per-field source-page evidence for
  the scalar overview columns (`organization`, `location`, ...), since a
  plain scalar column has no natural evidence relationship the way a
  requirement does. A map, not 9 new `sourcePage`/`evidenceText` column
  pairs — same reasoning as `company_profiles`' jsonb fields (read as a
  whole, never independently queried).
- `tender_requirements.title` — a short label, distinct from `description`
  (fuller structured restatement) and `evidence.evidenceText` (verbatim
  quote). Three-way distinction, not redundant fields.
- Two new tables: **`tender_dates`** (`label`, `parsedDate` nullable,
  `rawText`, `sourcePage`, `evidenceText`) and **`tender_red_flags`**
  (`description`, `sourcePage`, `evidenceText`, deliberately no severity
  field for v1). Kept structurally separate from `tender_events` per the
  approved distinction: `tender_dates` is *document* data ("pre-bid
  meeting — 12 Oct 2026 — page 14"); `tender_events` is *application
  activity* ("tender re-analyzed") — this milestone writes to both, for
  different reasons.

## Pipeline architecture

```
tender_pages (Milestone 2, unmodified)
     │
     ▼
chunkPages() — character-budget grouping of CONSECUTIVE pages (not a fixed
page count — a dense clause page and a mostly-blank cover page are wildly
different workloads). Page identity is embedded IN the text via explicit
[PAGE N] markers, not just carried as a chunk-level range — so a fact from
the middle of a 5-page chunk still cites its real, exact page.
     │
     ▼
extractChunk() — one AI call per chunk via ai/index.js's EXISTING provider
transport (getProvider().complete()) — no new transport, new prompts only.
Reuses the same untrusted-content framing ai/index.js already uses for
Papyr's document operations (tender text is exactly as untrusted as a
WhatsApp-uploaded PDF).
     │
     ▼
validateChunkResult() — hand-rolled validator (no JSON-schema library — the
shape doesn't warrant the dependency), NOT "is this valid JSON" but "does
every fact carry REAL evidence". A requirement/date/BOQ-item/red-flag
missing a page citation, or citing a page not actually in this chunk (a
hallucinated citation), is DROPPED — never persisted with a blank or
invented source. This is the code-level enforcement of "if evidence cannot
be located, do not manufacture it," not just a prompt instruction.
     │
     ▼
aggregateResults() — deterministic merge, no extra AI call. Overview fields:
earliest chunk (= earliest pages, since chunks are in page order) to
provide a field wins. Requirements/BOQ/dates/red-flags: concatenated.
Chunks don't overlap, so cross-chunk duplicate extraction of the same fact
is expected to be rare — accepted as a known v1 limitation, not engineered
around with fuzzy matching.
     │
     ▼
replaceAnalysis() — one transaction: delete all prior AI-derived rows for
this tender, insert the new set, update tenders' overview columns +
overviewEvidence + analysisStatus, write one tender_events row. Either the
whole replacement lands or none of it does.
```

## Trigger: explicit, not automatic

`POST /tenders/:id/analyze` — analysis never runs automatically after
upload/extraction. A tender must reach `processingStatus: COMPLETED` first
(`409` otherwise). This keeps AI spend opt-in per action and gives a clean
future billing boundary, per the approved design.

**Idempotent start, race-safe**: `startAnalysis()` is a single atomic
`UPDATE ... WHERE analysis_status != 'ANALYZING' RETURNING *` — the row
itself is the compare-and-set. A second concurrent request simply gets zero
rows back and returns `409`, with no separate lock module needed. Proven
with a genuine `Promise.all()` of two concurrent analyze requests in the
test suite: exactly one gets `202`, the other `409`.

## Re-analysis: replace, not merge — and failure never destroys success

Approved design: re-running analysis **replaces** the tender's AI-derived
intelligence wholesale, never tries to reconcile old vs. new extraction.
`replaceAnalysis()`'s delete-then-insert only runs inside its own
transaction, invoked **only on a successful analysis run**. A **failed**
analysis (`markAnalysisFailed()`) touches nothing but `analysisStatus`/
`analysisError` — a re-analysis attempt that fails halfway leaves the
**previous successful analysis completely intact**. Proven directly: a test
runs a successful analysis, then a second run whose provider throws, then
asserts the original requirements are still all present.

No `analysisRun` history table — the approved "simple current-state model
plus `tender_events`" — what happened IS recorded (`analysis_completed` vs.
`analysis_replaced` event types), just not as a queryable history of past
extracted-data snapshots. Revisit if the UI demonstrates a need for one.

## Partial-success policy

One chunk failing to parse does not sink a whole analysis — a 150-page
tender shouldn't lose everything because one chunk's JSON was malformed.
Chunk failures are caught individually and logged; if **at least one**
chunk produced usable results, the analysis completes with whatever was
successfully extracted. Only if **every** chunk failed (or a page-listing
error prevented any chunk from running at all) is the whole analysis marked
`FAILED` — and even then, per above, any prior successful analysis is left
untouched.

## AI spend control — deliberately DB-backed, not in-memory

Two configurable caps (`config.bidpilot.analysis`, all env-driven, no
hardcoded numbers):

- **Per-tender chunk ceiling** (`BIDPILOT_ANALYSIS_MAX_CHUNKS_PER_TENDER`,
  default 60) — a tender that would need more AI calls than this is
  refused outright (`413`) before spending anything, rather than silently
  truncated.
- **Per-company rolling-window ceiling**
  (`BIDPILOT_ANALYSIS_MAX_CALLS_PER_COMPANY_PER_DAY`, default 200) —
  queried from `usage_records` (already scaffolded, unused, in Milestone 1)
  over the trailing 24h, not an in-memory counter.

This is the one deliberate departure from the in-memory-limiter pattern used
everywhere else in this codebase so far (`loginRateLimit.js`,
`uploadLock.js`): those protect against *abuse*, where a best-effort,
single-instance-only guard is an acceptable tradeoff. This protects **real
money** — it must stay accurate across a restart and, later, across
multiple instances, so it reads its own prior spend back from Postgres
before allowing more, rather than trusting an in-memory counter that resets
on every deploy.

Usage is recorded (`recordChunkUsage`) **after** each chunk call actually
succeeds, not upfront — a failed/skipped chunk never counts against the
company's budget.

## Security / prompt injection

Tender content is exactly as untrusted as a WhatsApp-uploaded document —
`extract.js`'s system prompt reuses `ai/index.js`'s existing injection-guard
wording verbatim (not a rewrite), and the untrusted text is wrapped in
explicit delimiters, mirroring the same pattern `test/security-prompts.test.js`
already proves for Papyr. A new test file
(`test/bidpilot/analysis-security.test.js`) proves the same properties for
the analysis prompt specifically, including that an embedded "ignore all
previous instructions" payload is passed through as **data** inside the
delimiters (never stripped — stripping would be its own kind of silent data
loss) while the system prompt's guard is what does the actual defensive
work.

## Tests

96 new tests across 7 files:
- `chunker.test.js` (9) — budget-based grouping, page-identity-in-text,
  an oversized single page never dropped, ordering, empty/null input.
- `analysis-schema.test.js` (23) — the evidence-first drop rule for every
  fact type (requirements, BOQ, dates, red flags, overview), hallucinated
  page-citation rejection, malformed input never throws.
- `aggregate.test.js` (6) — earliest-chunk-wins overview merge,
  concatenation, dropped-count summing.
- `analysis-budget.test.js` (7, DB-backed) — both caps, the exact boundary
  (at-the-cap allowed, one-over refused), per-company isolation, the 24h
  rolling window actually rolling.
- `analysis-security.test.js` (8) — prompt-injection framing, category
  whitelist, fabrication-forbidden instruction, tolerant JSON parsing.
- `analysis.test.js` (17, DB-backed + full HTTP) — persistence (replace not
  duplicate, failure preserves success, `tender_events` wording, an
  all-dropped chunk still completes cleanly), and the full route: golden
  path, `409` on incomplete extraction, concurrent-request race safety,
  re-analysis via HTTP, `413` on an oversized tender, tenant isolation,
  CSRF, session requirement.

No test ever calls a real OpenAI/Anthropic API — every test uses
`setProvider()` (the same existing test seam `ai/index.js` already
provides) to inject a mock, consistent with `test/security-prompts.test.js`'s
established pattern.

One real bug this milestone's own smoke test caught before automated tests
were even written: verifying nested-transaction support (`createRequirementWithEvidence()`'s
own internal transaction, called from inside `replaceAnalysis()`'s
transaction) — confirmed empirically to work correctly via drizzle-orm's pg
driver (savepoints) before relying on it, rather than assumed. One bug in
the test suite itself (not the implementation): the repo-level persistence
tests initially forgot to call `insertPages()`, so every analysis in that
block failed fast with "no pages to analyze" — caught immediately by the
first run, since a real fix (inserting pages) was needed before any
assertion could pass, not a change to loosen the assertion.

**All tests pass** across all three realistic configuration states (neither
configured, `DATABASE_URL` only, both configured) — Papyr's own suite is
unaffected throughout, matching every prior milestone.

## Environment variables added

`BIDPILOT_ANALYSIS_CHUNK_CHARS` (default 40000), `BIDPILOT_ANALYSIS_MAX_CHUNKS_PER_TENDER`
(default 60), `BIDPILOT_ANALYSIS_MAX_CALLS_PER_COMPANY_PER_DAY` (default 200)
— all configurable, none hardcoded, per instruction.

## Explicitly not built (per the approved boundary)

Eligibility matching against a company profile, "winning probability," a
frontend intelligence dashboard, Ask Tender/RAG, automatic tender
discovery, Telegram, billing UI, OAuth/MFA/SSO, automatic BOQ pricing, and
— structurally enforced, not just a policy — no code path can produce an
AI-invented fact without a real, in-chunk page citation.

## Unresolved decisions / deliberate v1 limitations

- **No cross-chunk fuzzy deduplication** — a fact extracted near a chunk
  boundary could in principle appear twice if it genuinely straddles two
  chunks' page ranges. Accepted for v1 since chunks don't overlap; revisit
  if it proves common with real tenders.
- **No `analysisRun` history table** — current-state model only, per the
  approved design; `tender_events` carries the activity trail, not a
  queryable snapshot history.
- **No partial-chunk-count truncation** — an over-budget tender is refused
  outright rather than analyzed partially up to the cap. Simpler and safer
  for v1; could be revisited if refusing a large legitimate tender proves
  too blunt in practice.
- **`overviewEvidence`'s per-field evidence is best-effort** — the AI can
  supply a value without a page citation for overview fields specifically
  (unlike requirements, where evidence is mandatory); this was a deliberate
  reading of "evidence-first" as applying most strictly to the
  compliance-relevant facts (requirements/BOQ/dates/red-flags), with
  overview metadata held to a slightly softer bar. Worth confirming this
  reading is correct.

## Suggested next milestone

Per the original product roadmap and this milestone's own explicit
boundary: **eligibility matching against the company profile** — now that
tenders reliably carry validated, evidence-backed requirements, the next
value step is comparing them against `company_profiles` (Milestone 1,
unused since) to populate `tender_requirements.companyStatus` (`MEETS` /
`UNKNOWN` / `DOES_NOT_APPEAR_TO_MEET` — never a numeric score, per the
schema's own standing prohibition). A frontend to actually see any of this
remains a separate, later milestone either way.
