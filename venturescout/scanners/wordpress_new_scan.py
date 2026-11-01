"""WordPress.org plugins added since a date: active installs, ratings, tags. Writes wp_new.json.

Usage: python3 wordpress_new_scan.py 2025-04-21 out.json
"""
import json, sys, time, urllib.request
since, out = sys.argv[1], sys.argv[2]
U = "https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[browse]=new&request[per_page]=250&request[page]={}"
rows, page = [], 1
while True:
    for i in range(4):
        try:
            d = json.load(urllib.request.urlopen(U.format(page), timeout=60)); break
        except Exception:
            time.sleep(2 ** i)
    ps = d["plugins"]
    for p in ps:
        rows.append(dict(slug=p["slug"], name=p["name"], author=p.get("author_profile"), added=p.get("added"),
                         installs=p.get("active_installs"), ratings=p.get("num_ratings"), rating=p.get("rating"),
                         tags=list((p.get("tags") or {}).keys()) if isinstance(p.get("tags"), dict) else p.get("tags"),
                         short=(p.get("short_description") or "")[:200]))
    if not ps or ps[-1].get("added", "") < since: break
    page += 1
rows = [r for r in rows if (r["added"] or "") >= since]
json.dump(rows, open(out, "w")); print(len(rows), "plugins added since", since, file=sys.stderr)
