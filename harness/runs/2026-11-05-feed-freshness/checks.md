# Checks: feed freshness and monitoring

| step | requirement | verdict | evidence |
|---|---|---|---|
| 1 | Status rules for fresh, delayed, stale, unavailable (switched off, never succeeded, failing) and missing timestamps; the last failed attempt is never shown as the last update | pass | freshness.test.js: thresholds at each edge, switched off, never read, bad or missing timestamps; failed attempt kept separate (lastFailureAt, lastError) |
| 2 | Fresh-page success and failure are recorded; recovery clears the error; GeM's failure is recorded during an outage; other lists unaffected | pass | feed.test.js new collector test: successes from fresh and sweep pages; only state failing leaves central/GeM clean; total outage records GeM too (fails without the sweep fix); recovery clears errors |
| 3 | Monitor warns once per worsening, logs recovery once, no repeats while unchanged | pass | freshness.test.js: feedChanges sequence + startFeedMonitor with stub DB/logger: 1 warn for repeated failure, recovery logged, switched-off lists info only |
| 4 | Landing HTML and markdown and the search markdown say "right now" only when fresh, otherwise give the last update date plus a notice; public facets carry no error text | pass | freshness.test.js (HTML and .md, fresh/stale/unknown); local curl: landing HTML notice + "in our last update (23 October 2026)"; landing .md and search .md the same; public facets show status + lastSuccessAt only |
| 5 | Frontend shows a freshness line (fresh) or notice (stale/unavailable) at 390 and 1366 px; count wording; the existing list browser check still passes; no new layout shift on landing pages | pass | freshness.test.ts 5/5; freshness-browser-check.cjs stale 26/26 and fresh 19/19 at 390 and 1366 px (layout shift 0.0000, no horizontal scroll, filters work, no errors/CSP); delayed 1/1; Phase 1 list-browser-check 40/40 |
| 6 | Founder dashboard shows each source's status, last success, last failure and last error | pass | browser: insights card shows Unavailable, Last success 23 Oct, Last failure + "CPPP answered 404" (stale); all Fresh (fresh); screenshots insights-feed-*.png |
| 7 | Nightly JSON carries the feed; the email shows it; the subject alerts only on a worsening vs the previous night; recovery noted; old JSON without a feed still renders | pass | test_nightly.py +7 (statuses, quiet when fresh, alert once, worse again, recovery, old JSON, bad timestamps); real production data rendered locally: night 1 subject "Tender feed alert (Central, State, GeM) · …", night 2 no alert |
| 7 | insights-summary.mjs runs against production as it is deployed now (read-only) | pass | run read-only on tenderlytic-api (v54) on 5 Nov 03:00 UTC: feed present, no @, last success 23 Oct 15:29 UTC for all three lists |
| all | No schema change, migration, production configuration change, commit, push or deploy | pass | git diff: no db/schema, migrations, fly.toml, config values or secrets changed; nothing committed, pushed or deployed |
| backend tests: database + CSRF secret | all backend tests pass | pass | pass 752, fail 0, skipped 1 |
| backend tests: database only | all backend tests pass | pass | pass 466, fail 0, skipped 34 |
| backend tests: no database | all backend tests pass | pass | pass 373, fail 0, skipped 50 |
| frontend build | type check and build succeed | pass | built in 277ms |
| frontend lint | lint exits 0 | pass | 18 warnings, 0 errors |
| frontend unit tests | all pass | pass | pass 83, fail 0, skipped 0 |
| secret scan | no secrets in the change | pass | secret-scan: clean (--changes) |
