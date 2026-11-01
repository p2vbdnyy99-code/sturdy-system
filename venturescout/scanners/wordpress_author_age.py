"""For new WordPress.org plugins above an install threshold, find each author's earliest plugin (independence check).

Usage: python3 wordpress_author_age.py wp_new.json min_installs out.json
"""
import json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
rows = [r for r in json.load(open(sys.argv[1])) if (r["installs"] or 0) >= int(sys.argv[2])]
U = "https://api.wordpress.org/plugins/info/1.2/?action=query_plugins&request[author]={}&request[per_page]=250"
def first(author):
    for i in range(4):
        try:
            d = json.load(urllib.request.urlopen(U.format(author), timeout=60))
            return author, min((p.get("added") or "9999") for p in d["plugins"]), len(d["plugins"])
        except Exception:
            time.sleep(2 ** i)
    return author, None, None
authors = sorted({r["author"].rstrip("/").split("/")[-1] for r in rows if r["author"]})
with ThreadPoolExecutor(8) as ex:
    res = {a: (f, n) for a, f, n in ex.map(first, authors)}
for r in rows:
    a = (r["author"] or "").rstrip("/").split("/")[-1]
    r["author_first"], r["author_plugins"] = res.get(a, (None, None))
json.dump(rows, open(sys.argv[3], "w")); print(len(rows), "plugins,", len(authors), "authors", file=sys.stderr)
