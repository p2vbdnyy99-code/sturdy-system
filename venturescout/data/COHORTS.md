# Cohort registry

Snapshots are **appended, never overwritten**. Product age = observation date − launch date.

## Tracked cohorts (re-measured over time)

| ID | Cohort | Launch window | Size | Metric | Snapshot file | Observations (date → product age) |
|---|---|---|---|---|---|---|
| ATL-JIRA-RPT | Jira Cloud report/dashboard-type apps (keyword + category filter) | 2026-07-23 → 2026-10-21 | 152 apps (133 from vendors whose first app is ≥ 2024-10-21) | Marketplace `totalInstalls` (active installs, includes free ≤10-user sites and evaluations) | `cohort_snapshots.csv` | 2026-10-21 → 0–90 days · 2026-10-22 → 1–91 days (re-measured via `/distribution`) |
| APIFY-NEW-17D | Every 10th actor from the newest-first Store listing | 2026-10-04 → 2026-10-21 | 1,309 sampled from 13,084 retrieved (of ~15,000 positions; ~13% of pages failed) | `totalUsers30Days` (includes free-credit users and possibly the creator) | `apify_cohort_snapshots.csv` | 2026-10-21 → 0–17 days · 2026-10-22 → 1–18 days |

**Quarantined data:** `cohort_snapshots_INVALID_2026-10-22.csv`. On 2026-10-22 the Atlassian app-detail endpoint returned
`totalInstalls=0` for apps whose listing showed hundreds of installs. These rows are kept for audit only. The tracker now uses
`/rest/2/addons/{key}/distribution`, which matched the listing (e.g. clockify-v2: 1,136 vs listing 1,125).

**Day-1 changes, observed:**
- ATL-JIRA-RPT: 0 of 152 changed. Atlassian appears to refresh install counts weekly (2015 Atlassian staff answer; not re-confirmed), so daily deltas carry no information.
- APIFY-NEW-17D: 15 up, 4 down, 2 removed, 1,275 unchanged. One day is far too short to interpret.

**Next observations:**

| Day | Date | Cohorts |
|---|---|---|
| 30 | 2026-11-20 | ATL-JIRA-RPT, APIFY-NEW-17D |
| 60 | 2026-12-20 | ATL-JIRA-RPT, APIFY-NEW-17D |
| 90 | 2027-01-19 | ATL-JIRA-RPT |

Commands are in `../README.md`.

## Cross-sections (single observations, not tracked)

| File | Observed | What it is | Main limitation |
|---|---|---|---|
| `2026-10-21/cloud_scan.json` | 2026-10-21 | All 6,632 Jira/Confluence Cloud apps with first-release dates | Delisted apps absent (survivor bias); re-listings look "new" |
| `2026-10-21/wp_new.json` | 2026-10-21 | All 22,572 WordPress.org plugins added 2025-04-21 → 2026-10-21 | Closed plugins absent; installs bucketed |
| `2026-10-21/wp_new_100plus.json` | 2026-10-21 | Author first-plugin dates for the 1,075 with ≥100 installs | New accounts of established companies count as "new" |
| `2026-10-21/apify_store_dated.json` | 2026-10-21 | Top 3,972 Apify actors by popularity, with creation dates | **No denominator:** survivor sample, not a cohort |
| `2026-10-21/apify_newest.json` | 2026-10-21 | 13,084 newest actors | API caps offset at ~15k (≈17 days) |
| `2026-10-21/jira_niches.json` | 2026-10-21 | Top-10 results for 40 Jira report search terms | Search relevance is loose |
| `2026-10-22/apify_lawful_categories.json` | 2026-10-22 | Top-10 actors for 36 lawful-utility search terms, with prices | Top-10 by relevance only |
| `2026-10-22/serp_domain_ages.csv` | 2026-10-22 | RDAP registration dates of domains ranking for 6 document-conversion queries | Search engine is not Google; registration ≠ launch date |
