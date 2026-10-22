# Checks: growth sprint (16 Oct 2026)

| step | requirement | verdict | evidence |
|---|---|---|---|
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 638, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 400, fail 0, skipped 25 |
| backend tests: no database | all backend tests pass | pass | pass 324, fail 0, skipped 40 |
| frontend build | type check and build succeed | pass | built in 564ms |
| frontend lint | lint exits 0 | pass | 19 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 52, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
| 1 | the redirect has a proven cause | pass | 3 test Gmail drafts read back as raw MIME: every link was `google.com/url?q=…&ust=…`, including plain text and a bare domain; drafts deleted. Site: `https://tendertez.in/…` answers 200 with no redirect |
| 2 | wrapped, shortened, non-canonical and non-standard links are refused | pass | `marketing/automation` unittest 35/35 (`-W error::ResourceWarning`); before the fix, the old calendar's `utm_source=linkedin.emd_exemption` passed lint, and now it fails |
| 3 | the daily post builds from live data with policy-checked links | pass | `ttm daily-post` live run, 17 Oct: Tripura, 194 open and 32 closing; every link passes `check_text(require_link=True)` |
| 4 | outreach links open directly | pass | every link in the outreach pack answered HTTP 200 with no redirect; the Doc read back with links unwrapped |
| 5 | prospects are verified, with no duplicates or second first messages | pass | 8 saved through `prospect-add` (duplicate and contacted-before checks). One candidate (Eternity, Jaipur) was excluded: its published email was already in the founder's sent mail. Contacts read from each firm's own page; 3 award-only firms saved with no contact |
| 6 | the 4-week plan is sourced, linted and linked | pass | 28 posts (12 LinkedIn, 16 X): `content.lint` ok; every tendertez.in link 200; rules read in the GFR OM of 25 Jul 2017, the DoE OM of 12 Nov 2020, the MSME FAQ and the DPIIT order of 19 Jul 2024; 7 drafts corrected. 3 government source PDFs refuse the HEAD check (403 / connection reset) but download with GET |
| 7 | the state page counts its own list; the example date is never past | pass | `check-fix.mjs` against a local build with the live public API: Maharashtra 1,272 = list 1,272; all-India 98,831; example deadline 13 days ahead |
| 8 | standard links are counted as source.campaign | pass | `src/api/visits.test.ts` 3/3 |
| 9 | no prospect names in committed marketing docs | pass | grep of the CRM company names over `marketing/**/*.md,csv` outside `data/`: only the existing public competitor list |
