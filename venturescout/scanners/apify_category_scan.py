"""Apify Store category scan: top-N actors per search term with users, creation date, developer and per-event price.

Usage: python3 apify_category_scan.py terms.txt out.json [top_n=10]
Pricing: the primary pay-per-event charge at the FREE and BRONZE tiers (USD per event), plus the event title.
"""
import json, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

terms = [t.strip() for t in open(sys.argv[1]) if t.strip() and not t.startswith("#")]
out_path = sys.argv[2]
top_n = int(sys.argv[3]) if len(sys.argv) > 3 else 10


def get(u):
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(u, timeout=60))
        except Exception:
            time.sleep(2 ** i)
    return None


def primary_price(p):
    ev = ((p or {}).get("pricingPerEvent") or {}).get("actorChargeEvents") or {}
    for name, e in ev.items():
        if e.get("isPrimaryEvent") or len(ev) == 1:
            tiers = e.get("eventTieredPricingUsd") or {}
            flat = e.get("eventPriceUsd")
            return dict(event=e.get("eventTitle"), free=(tiers.get("FREE") or {}).get("tieredEventPriceUsd", flat),
                        bronze=(tiers.get("BRONZE") or {}).get("tieredEventPriceUsd", flat))
    return None


def search(term):
    d = get(f"https://api.apify.com/v2/store?limit={top_n}&search={urllib.parse.quote(term)}") or {}
    rows = []
    for a in (d.get("data") or {}).get("items", []):
        s = a.get("stats") or {}
        rows.append(dict(id=f'{a["username"]}/{a["name"]}', title=a["title"], u30=s.get("totalUsers30Days"),
                         u7=s.get("totalUsers7Days"), runs30=(s.get("publicActorRunStats30Days") or {}).get("TOTAL"),
                         rating=s.get("actorReviewRating"), reviews=s.get("actorReviewCount"),
                         model=(a.get("currentPricingInfo") or {}).get("pricingModel"),
                         price=primary_price(a.get("currentPricingInfo"))))
    return term, rows


def created(aid):
    d = get("https://api.apify.com/v2/acts/" + aid.replace("/", "~")) or {}
    return aid, ((d.get("data") or {}).get("createdAt") or "")[:10]


with ThreadPoolExecutor(6) as ex:
    res = dict(ex.map(search, terms))
    ids = sorted({r["id"] for rows in res.values() for r in rows})
    dates = dict(ex.map(created, ids))
out = [dict(term=t, actors=[dict(r, created=dates.get(r["id"])) for r in res[t]]) for t in terms]
json.dump(out, open(out_path, "w"), indent=1)
print(f"{len(terms)} terms, {len(ids)} actors -> {out_path}", file=sys.stderr)
