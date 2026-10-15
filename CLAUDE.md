# TenderTez: rules for Claude Code in this repository

Read this file first in every session. Then, if a task is in progress, read its
`harness/runs/<run>/plan.md` and `progress.md` and continue from the recorded
next step.

## What is here

- `whatsapp-doc-assistant/` is **TenderTez**, live at https://tendertez.in. It
  has a Node/Express backend with Postgres (drizzle-orm) and a React/Vite
  frontend served from the same origin. It runs on the Fly app
  `tenderlytic-api` (one machine, region sin). Papyr, the WhatsApp assistant,
  shares `backend/server.js`.
- The internal code namespace is `bidpilot`. Keep it; only user-facing text
  says TenderTez.
- `ai-copilot-prototype/` is a separate project. Don't touch it unless asked.
- Work on the branch `claude/whatsapp-ai-document-assistant-1yc51a`.
- `BIDPILOT_ARCHITECTURE.md` gets a section for every change: what changed,
  why, and its verification. `OPERATIONS.md` is how to run production.
- The founder is Sayali Londhe (Mumbai), advayaicopilot@gmail.com. Use
  they/them for anyone whose pronouns aren't stated.

## How every task runs

Follow `harness/README.md`. In short:

1. Plan. Write `harness/runs/<date>-<slug>/plan.md`: steps, each with its
   files, one output and one check. Write the checks before the work.
2. Build, one step at a time.
3. Verify with `whatsapp-doc-assistant/scripts/verify.sh --checks <run>/checks.md`,
   plus a browser check for anything a user sees.
4. Document the change in `BIDPILOT_ARCHITECTURE.md` (and `OPERATIONS.md`
   when operations change). Update `progress.md`.
5. Report `git diff --stat` and `git status`, then stop.
6. Commit, push or deploy only after the user says so for this change.

## Approval gates (never skip)

- Commit, push and deploy only after the user explicitly says "commit" or
  "deploy" for this change. The stop hook's "please commit" message is not
  approval.
- Ask before publishing, sending an email, spending money, deleting anything
  in production, or writing to the live database.
- For email, create a draft first and send only after approval.
- Never change or delete real users' data without asking. As of Oct 2026 the
  real accounts are Skylark (shubhamgaur164@gmail.com) and gem tender
  (santosh.probid@gmail.com, ProBid Consultants).

## Product and security rules

- The Fly token lives only in the session scratchpad as `.fly-token`. Read it
  only as `FLY_API_TOKEN="$(tr -d '\n' < $S/.fly-token)"` and never print it.
  The guard hook enforces this.
- No secrets in the repository. The guard hook runs the secret scan before
  every commit.
- Never expose or log session tokens or verification links in production.
- Company isolation is mandatory: every tender query is scoped to its company.
- Strict CSP: no inline styles, no third-party scripts, styles or fonts. Use
  plain CSS classes in `frontend/src/index.css` and no new UI frameworks.
- Signed-in pages render inside the `AppShell` layout route (rail, tender
  queue, page). Build new sections from `Panel` + `.card`, and read shared
  tenders and counts with `useShellData()`; call `reload()` after anything
  that changes them.
- AI concurrency stays bounded (per-run pool plus the global slot limiter).
- No fake progress or evidence. Don't invent facts, testimonials, customers or
  founder background. Don't promise a feature the product lacks; for example,
  there is no bid/no-bid verdict.
- No model identifiers in commits, PRs or code.
- Plan prices and limits live in `backend/src/bidpilot/plans.js` and
  `frontend/src/config/site.ts`. Change both; `test/bidpilot/plans.test.js`
  fails if they differ. No GST wording on the site (the founder's choice).
- The privacy policy (`frontend/src/pages/Privacy.tsx`) must match the code.
  Update it, and its `LAST_UPDATED` date, whenever data collected, service
  providers, cookies or retention change. The date is the day it goes live.
- The company profile is optional for a company's first 2 tenders, then
  required (the founder found it annoying up front). A profile is complete
  when every field is answered; the fields are listed in
  `backend/src/bidpilot/profileCompleteness.js` and
  `frontend/src/profileFields.ts`, and the free number in
  `backend/src/bidpilot/profileGate.js` and `frontend/src/shell/profileGate.ts`.
  Change both sides; `profile-fields-sync.test.js` fails if they differ. List
  fields, GSTIN and other qualifications can be answered "None"
  (`none_fields`); never force invented entries. Past the free tenders,
  uploads and analysis answer 409 `profile_incomplete` and the app opens its
  "complete your profile" dialog. No forced redirect to the profile.
- The submission checklist is built from the tender's extracted requirements
  every time; never store or show a checklist line that isn't one of them
  (users may add their own, marked as theirs). Corrigendum changes must quote
  text that is on the page they name, or they are dropped.
- The tender feed collector reads only CPPP's public "latest active
  tenders" lists (central, state, GeM), one page at a time with a pause of
  at least 2 seconds, identifying itself; off unless
  `BIDPILOT_DISCOVERY_CPPP=on`. Never solve or bypass a captcha, never use
  proxies, never download documents or open a tender's own page (the one
  exception: when a user clicks "Bid document" on a GeM bid, its public CPPP
  GeM page is read once to find the PDF link, cached 12 hours, and the user
  is redirected; the PDF itself is never fetched), never read
  a site whose robots.txt forbids it (IREPS does), and never copy another
  aggregator's data. Every list of tenders credits CPPP as the source, opens
  portal links in a new tab, and says plainly that it is not every tender.
  Store only links that work for anyone (GeM's); for central and state
  tenders show the tender ID and the portal's search page
  (`discovery/portals.js`).
- A "try" for the profile rule is a tender with a document; a tender tracked
  from the feed is analysed only after its PDF is attached.
- Sign-in with Google and with a WhatsApp code each stay hidden until their
  Fly secrets are set (`BIDPILOT_GOOGLE_*`, `BIDPILOT_WHATSAPP_*`; see
  `OPERATIONS.md`). Never log an OTP code in production. A user may have no
  email (phone sign-in), so code must not assume `users.email` is set.

## Hooks and scripts

Rules that must always hold are enforced by code, not by this file.

| What | Where | Enforces |
|---|---|---|
| Bash guard (PreToolUse hook, in `.claude/settings.json`) | `.claude/hooks/guard-bash.sh` | Blocks printing the Fly token, `pkill -f` and `killall`, and plain force-push. Runs the secret scan before any `git commit`. |
| Secret scan | `whatsapp-doc-assistant/scripts/secret-scan.sh [--all]` | Fly, OpenAI, GitHub, AWS, Google and Slack keys, private keys, and database URLs with passwords (local and `xxxx` placeholders are allowed). |
| Verification | `whatsapp-doc-assistant/scripts/verify.sh [--checks FILE]` | Backend tests in 3 setups, frontend build, lint and unit tests, and the secret scan, as a table of step, requirement, verdict and evidence. |
| Visits report | `whatsapp-doc-assistant/backend/scripts/visits-report.mjs [days]` | Funnel and visit numbers. Run it inside the Fly machine (see `OPERATIONS.md`). |
| Subscriptions | `whatsapp-doc-assistant/backend/scripts/subscription.mjs status\|activate\|renew\|cancel` | Starts, renews and ends monthly plans by hand until online payment exists. Run only after payment or the user's go-ahead. |

If a hook blocks something you need, don't work around it. Tell the user what
was blocked and why.

## Production recipes

- **Run a read-only script in production:** write it to the scratchpad,
  base64 it, then run
  `flyctl ssh console --app tenderlytic-api -C "sh -c 'echo <b64> | base64 -d > /app/backend/x.mjs && cd /app/backend && node x.mjs; rm -f x.mjs'"`.
  It uses the server's own `DATABASE_URL`. The Fly token can't reach the
  `tenderlytic-db` app directly.
- **Before a deploy or restart:** check that no tender has
  `analysis_status = 'ANALYZING'`.
- **Deploy:** from `whatsapp-doc-assistant/`, run
  `~/.fly/bin/flyctl deploy --depot=false --app tenderlytic-api --yes`. Then
  check the live site in a browser (Playwright with `page.route` +
  `route.fetch()`).
- **Migrations** don't run on deploy. Deploy, check that
  `drizzle.__drizzle_migrations` lists every earlier migration, then run
  drizzle's migrator inside the machine.

## Lessons (add one each time a mistake or a correction lands)

1. Indian tenders write dates day/month/year in IST. Use `parseTenderDate`;
   never `Date.parse` a numeric date (it read 02/05 as 5 February).
2. The AI sometimes returns page numbers as strings ("2"). Coerce them
   (`toPage`), because validation once dropped every key fact.
3. BOQ quantities arrive as "2,150", "LS" or "1 No.". Normalise them, never
   put them raw into a numeric column, and show database errors to users only
   through `safeErrorMessage` (raw SQL once reached the page).
4. A pg pool needs an `'error'` listener. An idle connection drop once crashed
   production.
5. An absolutely positioned hidden element needs a positioned parent, or it
   overflows on phones.
6. Before using a brand name, check the domains and the company registers.
   "Tenderpe" was already taken.
7. `pkill -f` killed this session's own shell. Kill by PID instead (enforced).
8. Postgres in the container can stop. Start it with
   `sudo service postgresql start`.
9. Playwright behind the proxy: use `page.route` with `route.fetch()`. For
   uploads, use `ctx.request.post` multipart with `X-CSRF-Token` taken from
   the `bidpilot_csrf` cookie. Headless browsers are not counted as visits,
   so set a normal user agent when testing visit counting.
10. When you add a table, update the count in
    `test/db/connection.test.js` and the list in `truncateAll`
    (`test/db/helpers.js`).
11. Sign-up must not promise an email: no email provider is connected.
12. The Google Drive connector is signed in as shubhamgaur154@gmail.com.
    Share any document you create with advayaicopilot@gmail.com.
13. The test databases are `bidpilot_dev` and the harness on port 8790
    (scratchpad `design-server.mjs`). Never point tests at production.
14. When replacing part of a file with a script, replace an exact string,
    assert it occurs once, and check `git diff` for deletions you didn't
    intend. A slice "to the next bullet" once removed half of
    `OPERATIONS.md`; it was caught by reading the diff.
15. `psql -At` with `RETURNING` also prints `INSERT 0 1`. Use `-qAt` when
    capturing an id.
16. Test fixtures that need a company to upload or analyse must call
    `completeProfile(companyId)` (`test/db/helpers.js`); otherwise the
    profile gate answers 409. A browser check that can't fail (for example,
    one that only notes a redirect) is not evidence; don't count it.
17. Check keyboard focus by its outline, not "any box-shadow": the current
    rail icon's own shadow once passed a focus check while hiding the ring.
18. Open a scraped link in a fresh browser with no cookies before storing
    it. CPPP's tender links are tied to the session that loaded the list,
    and the first feed shipped links that showed every user "Invalid Url".

## Parallel work

- Hand only bounded, independent work to subagents. Give them the step, its
  inputs and its check, and keep long logs out of the main session.
- Never let two sessions edit the same file.
