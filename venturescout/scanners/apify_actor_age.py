"""Add createdAt to each actor in an apify_store_scan.py output (public actor endpoint). Writes in place.

Usage: python3 apify_actor_age.py store.json
"""
import json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
path = sys.argv[1]; rows = json.load(open(path))
def age(r):
    for i in range(4):
        try:
            d = json.load(urllib.request.urlopen("https://api.apify.com/v2/acts/" + r["id"].replace("/", "~"), timeout=30))["data"]
            return r["id"], d.get("createdAt", "")[:10]
        except Exception:
            time.sleep(2 ** i)
    return r["id"], None
with ThreadPoolExecutor(8) as ex:
    created = dict(ex.map(age, rows))
for r in rows: r["created"] = created[r["id"]]
json.dump(rows, open(path, "w")); print(sum(1 for r in rows if r["created"]), "dated", file=sys.stderr)
