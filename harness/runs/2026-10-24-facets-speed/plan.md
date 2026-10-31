# Fast tender-search counts (facets), 24 Oct 2026

Founder: "fix the facets query". Production (read-only EXPLAIN ANALYZE, 24 Oct):
the uncached counts took ~35 s: open per list 28.2 s (index-only scan with
94,723 heap fetches, 48k blocks read from disk), per state 4.7 s, per
organisation 3.7 s. Table: 171,888 rows, 108 MB; Postgres shared_buffers
is 25 MB, so almost every read is from disk. One pass with GROUPING SETS:
1.9–3.7 s. Two separate caches (search API, landing pages) each ran it
every 5 minutes, and a visitor waited for each refresh. The daily post
task timed out on it (30 s) on 24 Oct.

| Step | Files | Output | Check |
|---|---|---|---|
| 1 One query | `repo/publicTenders.js` feedFacets | GROUPING SETS (kind), (kind,state), (kind,organisation); same result shape | existing facets tests + geo Kerala test unchanged |
| 2 One cache, never blocking | `repo/publicTenders.js` cachedFacets | Module-wide cache shared by every caller; a stale value is served at once while one refresh runs; a failed refresh keeps the old value | new unit test with a fake loader |
| 3 Warm at start | `server.js` | counts loaded once when the server starts | log line; landing test |
| 4 Verify | verify.sh; production timing after deploy | — | all pass; live facets < 1 s after warm-up |

## Added after the founder's bar: under 2 s uncached (24 Oct)

| Step | Files | Output | Check |
|---|---|---|---|
| 5 Stop no-op rewrites | `discovery/collector.js` storeRows | update only when details changed | collector-store.test.js (xmin unchanged) |
| 6 Index + autovacuum | schema, migration 0013 | `public_tenders_facets_idx`, autovacuum at 2% | bench: cold page reads ≤ 1,316 after a realistic day (vs 12,317) |
| 7 After deploy | production | migrate 0013, VACUUM (ANALYZE), time uncached counts | < 2 s, counts identical to the old queries |
