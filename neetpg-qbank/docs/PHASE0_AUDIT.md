# Phase 0 audit: NEET-PG QBank

Date: 27 Oct 2026. Scope: `neetpg-qbank/` in `p2vbdnyy99-code/sturdy-system`, branch `claude/ai-copilot-prototype-setup-pfgau3`, commit `7000f42`. The repository's other folders (`ai-copilot-prototype`, `self-learning-agent`, `venturescout`) are unrelated projects and are out of scope.

No implementation has been done for the new specification. This document is the Phase 0 deliverable only.

---

## 1. Architecture summary

| Layer | What exists | Notes |
|---|---|---|
| Frontend | One file, `index.html`: ~1,190 lines of vanilla JS, ~230 lines of CSS, no framework, no bundler | Hash routing (`#home`, `#s-<sid>`, `#t-<sid>-<ti>-<si>`, `#practice`, `#run`, `#result`, `#test`, `#plan`, `#pyq`, `#revise`, `#library`, `#stats`, `#more`) |
| Static data | `data/*.json` (taxonomy, 2 seed question files, 3 explanation files, PYQ insights) and 4 images in `img/` | Packed into `index.html` by `build.py` (731 KB total), because the Claude iOS viewer blocks fetching sibling files |
| Hosting | claude.ai Artifact (private to the owner): https://claude.ai/artifact/FLkbYe3Y35gMH1usZaPGtr | No server, no domain, no deployment pipeline |
| Backend | None. Runtime capabilities from the artifact platform stand in for one | See below |
| Database | Artifact `db` capability: a per-artifact JSON document store. Each viewer's data lives under `data/users/<uid>/` and is private, even from the owner | Limits: 25,000 documents per artifact, 256 KiB per document, queries scan without indexes, `limit` ≤ 1,000, no cursor pagination, no transactions |
| Auth | The viewer's claude.ai sign-in. `user.id()` gives an opaque per-viewer id | No roles beyond owner/editor/viewer sharing levels; no separate admin role |
| AI | `sample` capability: calls Claude on the **viewer's own Claude plan**. No API key, no per-token billing | Consent prompt on first use; rate-limited; 256 KiB input cap; platform guidance is one call per explicit user action, never loops or timers |
| File uploads | `pdf.js` 3.11.174 (cdnjs) extracts text in the browser; `assets` capability stores images (20 MiB/file) | No OCR; scanned PDFs are rejected with a message |
| Exports | `downloads` capability saves a JSON backup | |
| Fallback | `localStorage` when the page runs outside claude.ai | Browser-only, not synced |

**Network:** the page's CSP blocks all outbound requests except script CDNs. The app cannot fetch external sources (NBEMS, Commons, journals) at runtime. Any source collection has to happen outside the page.

## 2. Existing feature inventory

Working and browser-tested (Chromium, phone and tablet widths, light and dark):

- **Topic tree:** 19 subjects → 126 topics → 344 subtopics. Concept level not yet modelled.
- **Question bank:** 156 questions (152 text, 4 image), each with stem, 4 options, key, short explanation, pearl, high-yield grade.
- **Explanation layers on all 156:** reasons per option, mind map (structured JSON rendered as HTML), steps (animated walkthrough), mnemonic (40), comparison table (22), reference tag, PYQ-concept flag (118).
- **Practice:** tutor mode with option shuffling, bookmarks, flag, remove/restore, "Ask Claude a follow-up", YouTube *search* link.
- **Tests:** custom modules (20/30/50/100/any; filters by subject, topic, unattempted, incorrect, due, bookmarked, flagged, high-yield, PYQ concept, image), plus grand test (180), mini mock (72), section drill (36) and subject test (50). Tests follow the NEET-PG 2026 bulletin pattern: 5 × 36, 42 min per section, sections lock, +4/−1. Results show section and subject tables and a review.
- **Spaced review:** a wrong answer returns after 1 day, a right one after 21 days. Fixed rule, not adaptive.
- **Planner:** exam date + hours/day → Cover (55%) / Revise (30%) / Final (15%) blocks weighted by blueprint, a Today card, and "Ask Claude to review my plan".
- **PYQ insights page:** pattern facts, trend notes, two weightage estimates, 163 hot topics, study and skip advice, image types, sources list.
- **Bank building:** Claude generates questions by subtopic (optional PYQ focus), from uploaded PDF/TXT/MD notes (12k-character sections), from pasted notes, or from uploaded images. An independent second Claude pass checks the key, and full explanations can be generated on demand.
- **Progress:** subject table, weakest subtopics, test history. JSON import of own questions; backup export and restore.

## 3. Integrity problems in the current app (fix before anything else)

These conflict with the new non-negotiable rules. All are my own earlier choices.

| # | Problem | Rule | Fix |
|---|---|---|---|
| I-1 | The 156 starter questions and all their explanation layers were **written by Claude (AI) in this session**. The app labels them "written for this app" and marks them `src:"seed"`, which reads as human-authored. No human medical review has happened. | 6, 9, 14 | Relabel as `AI_GENERATED`, `verification: UNREVIEWED`. Show the label on every question. |
| I-2 | 118 questions carry `pyq:1` ("PYQ concept"). I set these from general knowledge and two coaching blogs, **with no per-question evidence record**. | 4, 7 | Demote to `concept_tag_unverified` with no "PYQ" wording until an evidence record links the concept to a documented session. |
| I-3 | `pyq.json` lists 163 "repeatedly tested topics". Some come from the cited blogs (PrepLadder, MedExamsPrep, Fornix); others are my own general knowledge. Items are not individually attributed. | 5, 7 | Split into "source-attributed" (with source id per item) and "unattributed suggestion". Hide frequency language for the latter. |
| I-4 | `ref` tags (e.g. "Robbins & Cotran") are model-suggested book titles. Nobody has checked that the book supports each claim. | 8, 9 | Rename to "suggested reference (not verified)". Only show "Reference" after review. |
| I-5 | Badge "2-PASS CHECKED" on generated questions means a second Claude call agreed. That is AI screening, not verification. | 9 | Rename to "AI cross-check agreed", with an explanation tooltip. |
| I-6 | Mock-test subject mix (`MOCK_W`) uses the old NBE 300-question blueprint scaled to 180. The split inside the Medicine and Surgery groups is my estimate. | 5 | Label it on the Tests page (partly done) and in data. |
| I-7 | The planner defaults to 8 h/day; the spec says 3–4 h for a working candidate. | spec P10 | Default to 3.5 h. |
| I-8 | Image licences live only in a free-text `credit` string (CDC public domain; CC0; CC BY 2.0 not used; CC BY-SA 3.0/4.0). CC BY-SA carries share-alike terms if the app is ever distributed. | 11, 16 | Store structured media records (licence, URL, author, retrieval date, modifications). |
| I-9 | Each subject's progress document keeps only the **latest** attempt per question (`[pick, ok, timestamp]`). No history, no time per question, no confidence, no error type. | spec P11 | Add an append-only attempt log (see migration plan). |
| I-10 | All seed answers are stored as option 0; the app shuffles at display. Harmless at runtime, but any export or import that skips shuffling leaks the key. | data integrity | Shuffle the stored order once in the v2 migration, keeping question IDs stable. |

## 4. Missing-feature inventory (against the 16-phase spec)

| Spec area | Status |
|---|---|
| P1 source registry, rights report | Missing. A 5-item informal sources list exists in `pyq.json`. |
| P2 ingestion pipeline (DOCX, CSV, OCR, page numbers, stem/option detection, dedup, review queue, report) | Missing. Only in-browser PDF/TXT text extraction feeding Claude generation. |
| P3 provenance categories, versions, reviewer, rights, change history, duplicate groups | Missing (see I-1 to I-5). |
| P4 trend analysis per exam/session | Missing. **There is no session-level dataset yet**, so no trend can be computed honestly. |
| P5 three separate rankings with inspectable score components | Missing. Current "priority" is a single hand-set 1–3. |
| P6 image taxonomy and analytics | Missing. Images have no modality, finding or diagnostic-target fields. |
| P7 video framework | Missing. Only a YouTube search link. Also, 2026 candidate reports say **no video questions** were asked. |
| P8 generation fields: learning objective, misconception, difficulty, related concept | Partly missing. Generation exists; these fields don't. |
| P8 quality checks (ambiguity, duplicates, outdated guidelines, reference support) | Only a key cross-check. |
| P9 flowcharts; core concept, trap, takeaway, revision interval sections | Flowcharts missing; others partly covered. |
| P10 adaptive planner, missed-session recovery, weekly plan, completion tracker | Static schedule only. |
| P11 time per question, error classification, confidence calibration | Missing (I-9). |
| P12 topic explorer below subtopic, video section, admin review UI, source/verification view | Missing. |
| P13 relational schema with constraints | Not possible on the current platform as specified; see §6. |
| P14 provider-independent AI interface, spending limits, no-paid-API mode | No paid API is used today, which is good. No abstraction layer or usage caps exist. |
| P15 automated tests | **None in the repository.** Only ad-hoc Playwright scripts run from a scratch folder, which is lost when the session ends. |

## 5. Key constraints and an architecture decision needed

The artifact platform shapes everything else:

1. **No server-side jobs.** Ingestion, OCR, deduplication and trend statistics cannot run in the page at scale. They need to run offline.
2. **Claude calls in the page** use the viewer's plan, need consent, are rate-limited and must not loop. Bulk generation of thousands of questions in-app is impractical.
3. **The page bundle ceiling is 16 MB.** At about 2.5 KB per fully explained question, a bundled curated dataset tops out around **5,000–6,000 questions**. Beyond that we need sharded loading, but the iOS viewer blocked fetching sibling files, so sharding through `assets` URLs is an **untested dependency**.
4. **The `db` store** is per-user and private, capped at 25,000 documents, with scan-only queries. It suits one learner's personal data. It does not suit a shared, reviewed question database.
5. **No roles.** An "admin reviewer" can only be the owner.

Two options:

**Option A (recommended for a single learner, $0 infrastructure).** Keep the artifact as the client. Add a **repository-side pipeline** (Python scripts run in Claude Code sessions or locally) that owns the source registry, ingestion, review queue, deduplication and trend statistics. It writes versioned, reviewed JSON datasets into git, and git history becomes the audit log. `build.py` packs the reviewed data into the app. Personal data (attempts, plans, notes, personal imports) stays in the artifact `db`. The weak point is the bundle size ceiling (constraint 3).

**Option B (needed for multiple users, commercial use or real admin roles).** A hosted web app with a relational database (e.g. Postgres) and a server-side Claude API key. This brings hosting cost, API billing, and authentication, privacy and rights obligations that rise sharply with commercial use. It is a rewrite of the client, so it would only be justified if those needs are real.

Both options share the same data model and pipeline, so starting with A does not block a later move to B.

## 6. Proposed data model (Option A)

The spec's 20 tables map onto **repo dataset files** (shared, reviewed, versioned in git) and **per-user documents** (in `db`).

**Repo dataset (`data/v2/`), validated by JSON Schema in CI:**
- `sources.json`: the source registry; one record per source, with every Phase 1 field (rights, licence, automated-access permission, checksum, confidence, notes).
- `documents.json`: the source documents.
- `sessions.json`: exam sessions (exam family, year, session, structure, completeness).
- `taxonomy.json` plus `concepts.json`: subject → topic → subtopic → concept, plus a mapping table from each source's original label to the canonical concept.
- `questions/<subject>.json`: questions. Each has a stable id, stem, options, key, explanation, taxonomy ids, type, difficulty, `source_category` (the 7 categories in P3), `provenance` (source/document/session ids, page), author or generator, reviewer, `verification_status`, `rights_status`, `last_reviewed`, `version`, `duplicate_group`, confidence, and the explanation layers.
- `references.json`: medical references. Only the human reviewer can mark one as verified.
- `media.json`: images and media (modality, finding, diagnostic target, licence, provenance, illustration-or-real flag).
- `evidence.json`: concept ↔ session observations. Each observation links to a source record. Trend statistics are computed only from these.
- `stats/*.json`: generated trend outputs, carrying completeness and confidence. Never hand-edited.
- Review queue: `review/*.json`, with PR-style review records. Change history comes from git plus a `history` array per question.

**Per-user `db` documents (under `data/users/<uid>/`):**
- Existing: `p-<sid>`, `settings`, `hist`, `plan`, `bank/<sid>/*`, `enr/<sid>/*`, `lib/docs/*`, `libtext/<doc>/*`.
- New: `att/<sid>-<yyyymm>/*`, an append-only attempt log `{qid, pick, ok, ms, ts, mode, confidence?, errType?}`. About 60 B per attempt keeps each monthly shard under 256 KiB.
- New: `srs/<sid>`, an adaptive revision state per question (interval, ease, due).
- New: `errors/<sid>`, the error notebook with error type.

## 7. Migration plan (non-destructive)

1. **Question IDs stay stable** (`s1-N`, `i1-N`, `g<batch>-N`), because user progress is keyed by them. v2 records carry `legacy_id`.
2. A `schema: 2` field goes into `settings`. On first load of the v2 app:
   - read the v1 `p-<sid>` docs and keep them (never delete them);
   - write one synthetic attempt per existing record into the new log, marked `migrated: true` with no time data;
   - from then on, write to both the v1 doc and the v2 log for one release, then v2 only.
3. A one-off script converts the seed data into v2 records with `source_category: AI_GENERATED`, `verification_status: UNREVIEWED`, PYQ flags demoted (I-2), and option order shuffled once (I-10).
4. User-generated batches in `db` get relabelled at read time: `src:"ai"` → `AI_GENERATED`, `src:"notes"` → `AI_GENERATED` with a note that they derive from the user's own material, `src:"import"` → `IMPORTED_UNVERIFIED`.
5. Rollback: the v1 app remains in git (`7000f42`), and v1 documents are untouched, so republishing v1 restores the old behaviour.

## 8. Phase 1 realities to verify (not yet researched in depth)

- NBEMS does not publish NEET-PG question papers (Fornix Academy, 31 Aug 2026; neetpgai.com). neetpgai.com attributes this to a 2025 Supreme Court directive, which **I have not verified**. FMGE and INI-CET release practices also need checking.
- Most "PYQs" online are **memory-based reconstructions by coaching companies**. These are their content, usually behind terms of use; reading them is not permission to copy, store or reuse them.
- **MedMCQA** (Pal et al., 2022) is a public dataset described as drawn from AIIMS and NEET-PG entrance material. **Its licence, and whether the questions are real exam items or mock items, must be verified** before any use.
- The user's own purchased recall books can be uploaded for **personal** analysis. Redistribution would need permission.
- Expect the honest outcome for several sessions to be "partial" or "unavailable". Dashboards will show empty states rather than estimates.

## 9. Estimated costs

**Current: $0 infrastructure, $0 API.** Hosting is the artifact. In-app Claude calls draw on the user's Claude plan limits, not per-token billing.

**If bulk generation moves to the Claude API** (Option B, or an offline script with a key). Per fully explained question, assume about 350 input and about 2,100 output tokens, thinking included, plus the cross-check. **The thinking-token share is my estimate; measure it on a pilot batch of about 100 before committing.**

| Model (list price per 1M tokens, in/out) | Per question | 35,000 questions | With Batch API (−50%) |
|---|---|---|---|
| Claude Opus 5.5 ($4 / $20) | ≈ $0.043 | ≈ $1,500 | ≈ $750 |
| Claude Sonnet 5.5 ($2 / $10) | ≈ $0.022 | ≈ $770 | ≈ $385 |
| Claude Haiku 5.5 ($0.10 / $0.50) | ≈ $0.0011 | ≈ $38 | ≈ $19 |

These figures exclude human medical review, which is the real bottleneck. At about 3 minutes per question, 35,000 questions is roughly 1,750 reviewer-hours.

Hosting for Option B depends on the provider; a small Postgres plus a static frontend is typically in free or low-cost tiers. **I have not checked current prices.**

## 10. Testing plan

- **Restructure first.** Move the JS and CSS out of `index.html` into `src/app.js` and `src/styles.css`; `build.py` assembles them. This lets pure functions be unit-tested.
- **`tests/e2e/`** (Playwright with the preinstalled Chromium): the flows already exercised manually (practice, explanation layers, modules, mocks, section lock and timer, planner, PYQ page), plus a test that blocks the `data/` and `img/` fetches (the iOS regression).
- **`tests/unit/`** (Node): scoring (+4/−1), section timing, mock mix, spaced-repetition schedule, `cleanGenerated`/`cleanRich` validation, migration v1→v2.
- **`tests/pipeline/`** (pytest): JSON Schema validation of every dataset file; provenance rules (no `OFFICIAL_RELEASED` without a source record of that type; no PYQ wording without evidence); dedup candidate detection; trend statistics on a small hand-verified benchmark, including partial papers and duplicated copies.
- A single command (`make test` or `python3 build.py --check`) runs all three. No CI exists yet; GitHub Actions can be added if wanted.
- Passing tests will **not** be reported as medical accuracy; medical review status is tracked separately.

## 11. Security and privacy

- No secrets in code; no API keys are used. ✓
- All dynamic text is HTML-escaped (`esc()`). ✓ Imported image URLs are rendered as `src`; the CSP blocks external loads, but v2 should allow only `/_blob/` and `data:` sources.
- User data is private per viewer by platform rule. Backups contain progress and the user's own generated questions, but no credentials. ✓
- Uploaded notes are stored as text in the user's private `db`. Retention and deletion controls exist only as "Remove" per file. v2 should add "delete all my uploads".
- Third-party scripts: pdf.js from cdnjs, pinned to a version, loaded only when a PDF is uploaded.

## 12. Reusable UI components

Question card with option shuffling; explanation panel (reasons per option, mind map, table, walkthrough, mnemonic, pearl); test runner with palette, timer and section lock; results tables; subject → topic → subtopic explorer; chips, filters, toasts; theme tokens (light/dark); responsive shell (sidebar ↔ tab bar).

## 13. Recommended implementation sequence

1. **Integrity fixes I-1 to I-8**, so no label overstates provenance. Small and self-contained.
2. **Restructure and test harness** (§10).
3. **v2 data model, schemas and migration** (§6, §7).
4. **Phase 1 research**: source registry and rights report. Desk research only, with no scraping of restricted sites.
5. **Ingestion pipeline and review queue** (repo-side), starting with formats from authorised sources.
6. **Evidence records and trend engine**, with honest empty or partial states; three separate rankings.
7. **Attempt log, error classification, adaptive spaced repetition and adaptive planner** (3.5 h default).
8. **Explanation engine v2**: flowcharts with a deterministic renderer, the extra explanation sections, label rules.
9. **Image taxonomy, media records and video framework**, including original animated explainers where licensed video doesn't exist.
10. **Admin review view** (owner-only on the artifact).

## 14. Risks and unresolved dependencies

- **Medical reviewer.** Nobody qualified has reviewed any content. Every question remains `UNREVIEWED` until a named reviewer signs off. The rules require this.
- **Lawful PYQ data may be thin.** Trend dashboards may stay largely partial; that is the honest outcome.
- **Bundle ceiling (~5–6k explained questions)** and the untested `assets`-based sharding on iOS.
- **Platform dependency.** `db`, `sample` and `assets` behaviour can change with the artifact runtime (contract 0.2.91 today).
- **2027 exam pattern** is not yet announced; tests assume the 2026 pattern.
- **Scope.** The spec targets a multi-role, potentially commercial platform. If that is the goal, Option B and a rights review are prerequisites, not later steps.
