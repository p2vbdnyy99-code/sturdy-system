"""Apify Store actors in newest-first order (unbiased newcomer base rate), with creation dates sampled per page.

Usage: python3 apify_newest_scan.py max_actors out.json
"""
import json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
N, out = int(sys.argv[1]), sys.argv[2]
def get(u):
    for i in range(5):
        try: return json.load(urllib.request.urlopen(u, timeout=60))
        except Exception: time.sleep(2 ** i)
def page(off):
    d = get(f"https://api.apify.com/v2/store?limit=100&offset={off}&sortBy=newest") or {"data": {"items": []}}
    items = d["data"]["items"]
    rows = [dict(id=f'{a["username"]}/{a["name"]}', title=a["title"], cats=a.get("categories"), pos=off + i,
                 u30=(a.get("stats") or {}).get("totalUsers30Days"), model=(a.get("currentPricingInfo") or {}).get("pricingModel"))
            for i, a in enumerate(items)]
    if rows:  # date marker: creation date of the first actor on the page
        det = get("https://api.apify.com/v2/acts/" + rows[0]["id"].replace("/", "~"))
        rows[0]["created"] = ((det or {}).get("data") or {}).get("createdAt", "")[:10]
    return rows
with ThreadPoolExecutor(8) as ex:
    rows = [r for p in ex.map(page, range(0, N, 100)) for r in p]
json.dump(rows, open(out, "w")); print(len(rows), "actors", file=sys.stderr)
