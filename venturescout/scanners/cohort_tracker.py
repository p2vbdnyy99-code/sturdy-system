"""Re-measure installs for a fixed cohort of recently launched Marketplace apps and append a dated snapshot.

This is the validation experiment for the Jira reports lane: do brand-new report apps from independent
vendors gain installs through Marketplace discovery? See reports/2026-10-21-jira-reports-deep-dive.md §6.

Usage: python3 cohort_tracker.py data/2026-10-21/jira_report_cohort.json data/cohort_snapshots.csv
"""
import csv, datetime, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

cohort_path, out_csv = sys.argv[1:3]
cohort = json.load(open(cohort_path))
today = datetime.date.today().isoformat()


def installs(key):
    for i in range(4):
        try:
            # Use the dedicated /distribution endpoint: on 2026-10-22 the app-detail embed started returning 0 for
            # every app (see data/cohort_snapshots_INVALID_2026-10-22.csv), while /distribution matched the listing.
            d = json.load(urllib.request.urlopen(f"https://marketplace.atlassian.com/rest/2/addons/{key}/distribution", timeout=30))
            return key, d.get("totalInstalls", 0)  # key is absent at 0 installs
        except Exception:
            time.sleep(2 ** i)
    return key, None


with ThreadPoolExecutor(8) as ex:
    now = dict(ex.map(installs, [c["key"] for c in cohort]))

new_file = not os.path.exists(out_csv)
with open(out_csv, "a", newline="") as f:
    w = csv.writer(f)
    if new_file:
        w.writerow(["date", "key", "vendor", "first", "indep", "installs"])
    for c in cohort:
        w.writerow([today, c["key"], c["vendor"], c["first"], c["indep"], now[c["key"]]])

indep = [now[c["key"]] for c in cohort if c["indep"] and now[c["key"]] is not None]
indep.sort()
print(f"{today}: {len(indep)} independent-vendor cohort apps; median installs {indep[len(indep) // 2]}; "
      f">=10: {sum(i >= 10 for i in indep)}  >=50: {sum(i >= 50 for i in indep)}  >=100: {sum(i >= 100 for i in indep)}")
