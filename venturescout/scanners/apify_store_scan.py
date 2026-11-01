"""Apify Store actors by popularity: 30-day users, runs, rating, pricing model. Writes store.json."""
import json,urllib.request,time
rows=[]
for off in range(0,5000,100):
    url=f"https://api.apify.com/v2/store?limit=100&offset={off}&sortBy=popularity"
    d=json.load(urllib.request.urlopen(url,timeout=60))["data"]["items"]
    for a in d:
        s=a.get("stats",{}); p=a.get("currentPricingInfo") or {}
        rows.append(dict(id=f'{a["username"]}/{a["name"]}',title=a["title"],cats=a.get("categories"),u30=s.get("totalUsers30Days"),u7=s.get("totalUsers7Days"),runs30=(s.get("publicActorRunStats30Days") or {}).get("TOTAL"),rating=s.get("actorReviewRating"),rc=s.get("actorReviewCount"),model=p.get("pricingModel"),desc=(a.get("description") or "")[:200]))
    if len(d)<50: break
rows=list({r["id"]:r for r in rows}.values())  # paging overlaps; dedupe by actor id
json.dump(rows,open("store.json","w")); print(len(rows))
