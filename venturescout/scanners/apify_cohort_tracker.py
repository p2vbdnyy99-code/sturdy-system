"""Re-measure 30-day users for a fixed cohort of Apify actors and append a dated snapshot (newcomer persistence test).

Usage: python3 apify_cohort_tracker.py data/2026-10-21/apify_newest.json data/apify_cohort_snapshots.csv [sample_every=10]
Samples every Nth actor to keep request volume modest (13k cohort / 10 = ~1.3k requests).
"""
import csv, datetime, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
cohort = json.load(open(sys.argv[1]))
step = int(sys.argv[3]) if len(sys.argv) > 3 else 10
sample = sorted(cohort, key=lambda r: r["pos"])[::step]
today = datetime.date.today().isoformat()
def users(r):
    for i in range(4):
        try:
            d = json.load(urllib.request.urlopen("https://api.apify.com/v2/acts/" + r["id"].replace("/", "~"), timeout=30))["data"]
            return r["id"], d["stats"].get("totalUsers30Days", 0)
        except urllib.error.HTTPError as e:
            if e.code == 404: return r["id"], "removed"
            time.sleep(2 ** i)
        except Exception:
            time.sleep(2 ** i)
    return r["id"], None
with ThreadPoolExecutor(8) as ex:
    now = dict(ex.map(users, sample))
new_file = not os.path.exists(sys.argv[2])
with open(sys.argv[2], "a", newline="") as f:
    w = csv.writer(f)
    if new_file: w.writerow(["date", "id", "u30"])
    for r in sample: w.writerow([today, r["id"], now[r["id"]]])
live = [v for v in now.values() if isinstance(v, int)]
print(f"{today}: sample {len(sample)}; removed {sum(v == 'removed' for v in now.values())}; "
      f">10 users {sum(v > 10 for v in live)}; >100 users {sum(v > 100 for v in live)}")
