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
