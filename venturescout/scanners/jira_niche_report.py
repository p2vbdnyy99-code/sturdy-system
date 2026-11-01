"""Summarise jira_niche_scan.py output per search term.

Usage: python3 jira_niche_report.py jira_niches.json [new_since=2025-04-21] [new_vendor_since=2024-10-21]
new app = first released on/after new_since; independent new vendor = vendor's first-ever app on/after new_vendor_since.
"""
import json, sys, statistics
data = json.load(open(sys.argv[1]))
since = sys.argv[2] if len(sys.argv) > 2 else "2025-04-21"
vsince = sys.argv[3] if len(sys.argv) > 3 else "2024-10-21"
print(f"{'term':30} lead  top10sum paid free10 med$100u/yr new new>=100 indep>=100 neg24m")
for t in data:
    a = [x for x in t["apps"] if x["installs"] is not None]
    paid = [x for x in a if x["paid"]]
    prices = [x["y100"] for x in paid if x["y100"]]
    new = [x for x in a if (x["first"] or "") >= since]
    win = [x for x in new if x["installs"] >= 100]
    indep = [x for x in win if (x["vendor_first"] or "") >= vsince]
    print(f"{t['term'][:30]:30} {max([x['installs'] for x in a] or [0]):5} {sum(x['installs'] for x in a):8} "
          f"{len(paid):4} {sum(1 for x in paid if x['m10'] == 0):6} {int(statistics.median(prices)) if prices else '-':>9} "
          f"{len(new):3} {len(win):8} {len(indep):10} {sum(len(x['neg']) for x in a):6}")
