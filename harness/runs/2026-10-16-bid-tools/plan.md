# Plan: EMD and bank-guarantee tracking, saved-search alerts, annexure drafts (16 Oct 2026)

**Task:** after the Tender247 research, the founder asked for the three
features it has that TenderTez doesn't: alerts for saved searches, annexure
drafting from the company profile, and EMD and bank-guarantee tracking in the
bid tracker.

**Decisions (the founder, by AskUserQuestion):**
- **Alerts:** in the app now (a badge and a "New for your searches" list).
  Email later, once an email service is connected; the design leaves room for
  it.
- **Annexures:** a Word (.docx) file per annexure. Each is the tender's own
  format, filled from the company or client profile. Anything the profile
  lacks is a marked blank, never a guess, and each draft cites its pages.
- **Letterhead details** (registered address, PAN, authorised signatory and
  designation, phone, email): an optional section on company and client
  profiles. It doesn't count towards a complete profile, so no existing
  company is blocked.

**Rules that apply:**
- Company isolation on every query.
- No invented facts.
  - A draft's text comes only from the tender's pages.
  - Its values come only from the profile, and the server fills them in; the
    AI never writes a value.
- No Bid/No-Bid verdict.
- AI concurrency stays bounded (`withAnalysisSlot`), and drafts count against
  a daily limit.
- Strict CSP: plain CSS classes only.
- Signed-in pages use `Panel` + `.card`, with `useShellData().reload()` after
  changes.
- The privacy policy changes in the same change (new profile fields, drafts
  sent to OpenAI), with `LAST_UPDATED` set to the go-live day.
- A new table means updating `connection.test.js` and `truncateAll` (lesson
  10).
- Users may have no email, so nothing assumes `users.email`.

**Allowed changes:**
- Backend:
  - schema;
  - migration 0011 (additive only);
  - repos, routes and analysis for the three features;
  - discovery (a hook after the collector stores rows);
  - tests.
- Frontend:
  - the tender page (BidPanel, a new Annexures tab);
  - the dashboard (an EMD/BG panel);
  - the Feed page and TenderBrowser (save search, "new" list);
  - the AppShell rail badge, ShellData and the profile page;
  - API clients and CSS.
- Text:
  - Privacy, Features and FAQ;
  - docs and this run folder.

Nothing in production changes until the founder says "commit and deploy";
the migration runs only after the deploy.

**Run limit:** three attempts per failing check, then report.

## Steps

| # | step | files | output | check |
|---|---|---|---|---|
| 0 | Schema and migration 0011 | `db/schema/workflow.js` (securities, annexure drafts), new `db/schema/alerts.js`, `companyProfile.js` (letterhead columns in `profileColumns`), `drizzle/0011_*.sql` | 4 new tables and 6 nullable profile columns on both profile tables; nothing dropped or rewritten | SQL read: only CREATE TABLE, ADD COLUMN and CREATE INDEX; `connection.test.js` count 35; `truncateAll` lists the new tables |
| 1 | EMD and bank-guarantee tracking | `repo/securities.js`, routes in `routes/tenders.js`, `GET /dashboard/securities`, `BidPanel` card, Dashboard panel, `api/tenders.ts` | per tender: EMD or performance security (fields below); dashboard money held and expiring BGs; the EMD from the document shown as a hint | `securities.test.js`: create, edit and delete; validation; another company gets 403/404; amounts are numbers; the dashboard sums only money still held; expiry within 30 days listed |
| 2 | Saved searches and in-app alerts | `repo/savedSearches.js`, `routes/feed.js` (CRUD, `/feed/new`, mark seen), matcher run after each collector store and at start-up, Feed page, TenderBrowser "Save this search", rail badge via ShellData | up to 10 saved searches per company; tenders first seen after the save become matches; unseen count on the rail; a "New for your searches" list | `saved-searches.test.js`: the filters are the same as the search (kind, state, organisation, words); only tenders first seen after the save match; no duplicates; a closed tender doesn't alert; another company sees nothing; mark seen clears the count; the 10 limit |
| 3 | Letterhead details | `routes/companies.js` whitelist, `profileFields.ts` (separate `LETTERHEAD_FIELDS`), profile page section, `api/companies.ts` | an optional section on company and client profiles | `profile-completeness` unchanged (completeness ignores letterhead); `profile-fields-sync` still passes; PATCH saves and reads back; PAN format checked |
| 4 | Annexure drafts | `analysis/annexures.js` (find format pages, prompt, validate), `repo/annexures.js`, `annexureDocx.js`, routes (`GET formats`, `POST draft`, `GET .docx`), Annexures tab | the tender's annexure/form pages listed; Draft makes one AI call per format and stores the structure; the .docx is built from the stored structure plus the current profile values | `annexures.test.js` with a fake AI: format pages found in fixture text; a placeholder for an unknown field becomes a blank; a value written by the AI is never used; a paragraph not on the tender's pages is dropped; a client tender uses the client's profile; usage limit gives 429; another company 403/404; the .docx opens (jszip) and holds the profile values and "[to fill: …]" blanks |
| 5 | Text | Privacy, Features, FAQ, the SEO description if needed | the privacy policy lists the new profile fields and drafts sent to OpenAI | read-through against the code |
| 6 | Verify | `verify.sh`, `bid-tools-verify.mjs` on the harness | checks.md | all suites pass; browser: add an EMD and a BG, dashboard panel; save a search, a new matching tender shows a badge, opening it clears; letterhead section saves; Annexures tab lists formats, Draft (stand-in AI) gives a .docx with the values; phone width; no CSP errors |
| 7 | Docs | `BIDPILOT_ARCHITECTURE.md`, `OPERATIONS.md` (migration 0011), `CLAUDE.md` rule, `progress.md` | sections written | read-through |

**Field details:**
- **tender_securities:**
  - `kind`: EMD or PERFORMANCE;
  - `mode`: ONLINE, DD, BG, FDR, EXEMPTED or NOT_REQUIRED;
  - `amount`: numeric(14,2);
  - `reference`, `bank`, `issued_on`, `valid_until`, `claim_until`;
  - `status`: TO_ARRANGE, SUBMITTED, RETURNED or FORFEITED;
  - `notes`.
- **saved_searches:** `company_id`, `created_by`, `name`, `filters` jsonb
  (kind, state, organisation, search), `created_at`.
- **saved_search_matches:** `saved_search_id`, `public_tender_id` (unique
  pair), `company_id`, `created_at`, `seen_at`.
- **tender_annexure_drafts:**
  - `tender_id`, `company_id`, `client_id`;
  - `format_key` (start page), `title`, `pages`;
  - `blocks` jsonb (paragraphs with `{{field}}` and `{{blank:label}}`
    placeholders);
  - `created_at`.
- **Letterhead columns:** `registered_address`, `pan`, `signatory_name`,
  `signatory_designation`, `contact_phone`, `contact_email`.
