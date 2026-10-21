"""Keyword-level niche scan for Jira Cloud apps on the Atlassian Marketplace.

For each search term: the top N results by Marketplace relevance, with installs, rating, first release date,
vendor's first-ever release (to separate genuinely new vendors from established brands), live Cloud pricing
(10-user monthly tier and 100-user annual tier), and recent 1-3 star review text.

Usage: python3 jira_niche_scan.py cloud_scan.json terms.txt out.json [top_n=10] [reviews_since=2024-10-21]
cloud_scan.json comes from atlassian_entrant_scan.py (supplies first-release dates).
"""
import json, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

B = "https://marketplace.atlassian.com/rest/2/addons"
scan_path, terms_path, out_path = sys.argv[1:4]
top_n = int(sys.argv[4]) if len(sys.argv) > 4 else 10
rev_since = sys.argv[5] if len(sys.argv) > 5 else "2024-10-21"


def get(u):
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(u, timeout=30))
        except Exception:
            time.sleep(2 ** i)
    return None


scan = {a["key"]: a for a in json.load(open(scan_path))}
vendor_first = {}
for a in scan.values():
    if a.get("first"):
        v = a["vendor"]
        vendor_first[v] = min(vendor_first.get(v, "9999"), a["first"])

terms = [t.strip() for t in open(terms_path) if t.strip() and not t.startswith("#")]


def search(term):
    d = get(f"{B}?application=jira&hosting=cloud&limit={top_n}&text={urllib.parse.quote(term)}")
    return term, [a["key"] for a in (d or {}).get("_embedded", {}).get("addons", [])]


def detail(key):
    p = get(f"{B}/{key}/pricing/cloud/live") or {}
    tiers = {(i.get("unitCount"), i.get("monthsValid")): i.get("amount") for i in p.get("items", [])}
    r = get(f"{B}/{key}/reviews?limit=50&sort=recent") or {}
    neg = [dict(stars=x.get("stars"), date=(x.get("date") or "")[:10], text=(x.get("review") or "")[:300])
           for x in r.get("_embedded", {}).get("reviews", [])
           if (x.get("stars") or 5) <= 3 and (x.get("date") or "") >= rev_since and x.get("review")]
    return key, dict(paid=bool(p.get("items")), m10=tiers.get((10, 1)), y100=tiers.get((100, 12)), neg=neg)


with ThreadPoolExecutor(8) as ex:
    results = dict(ex.map(search, terms))
    keys = sorted({k for ks in results.values() for k in ks})
    details = dict(ex.map(detail, keys))

out = []
for term in terms:
    rows = []
    for k in results[term]:
        a = scan.get(k, {})
        rows.append(dict(key=k, name=a.get("name"), vendor=a.get("vendor"), installs=a.get("installs"),
                         rating=a.get("rating"), reviews=a.get("reviews"), first=a.get("first"),
                         vendor_first=vendor_first.get(a.get("vendor")), **details[k]))
    out.append(dict(term=term, apps=rows))
json.dump(out, open(out_path, "w"), indent=1)
print(f"{len(terms)} terms, {len(keys)} distinct apps -> {out_path}", file=sys.stderr)
