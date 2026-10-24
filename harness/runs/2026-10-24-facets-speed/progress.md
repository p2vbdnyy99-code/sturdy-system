# Progress

- 24 Oct, steps 1–3: one GROUPING SETS query; one shared, non-blocking
  cache; warmed at start. Production comparison (read-only, same instant):
  identical lists, states and organisations; old 52 s, new 9 s under load.
- Founder's bar: uncached < 2 s. Steps 5–6 added after a read-only
  diagnosis: 731,697 updates for 171,888 rows; 36% of pages all-visible;
  50,391 rows rewritten in a day against 3,855 new. storeRows now skips
  unchanged rows; migration 0013 adds the facets index and autovacuum at 2%.
- Bench (production-shaped, 25 MB shared_buffers, cold): 12,317 → 1,316
  page reads after a realistic day; about 210 after a vacuum; a stale table
  falls back to the seq scan (no worse). Estimated ≤ 1.7 s at production's
  slowest measured 1.26 ms per read.
- verify.sh: all pass (backend 662/416/336, frontend build, lint 0 errors,
  57 unit tests, secret scan).
- Next, on "deploy": deploy; migrate 0013; VACUUM (ANALYZE) public_tenders;
  time the uncached counts in production 3 times (< 2 s) and compare with
  the old queries; check /bidpilot/public/tenders/facets live.
- Crawler baseline: the 13 GPTBot rows of 24 Oct are kept and recorded here
  and in OPERATIONS.md as the deploy check's own traffic.
