"""Pull every Jira/Confluence Cloud app with categories, installs, rating and first release date. Writes cloud_scan.json."""
import json,urllib.request,time,sys
from concurrent.futures import ThreadPoolExecutor
B="https://marketplace.atlassian.com/rest/2/addons"
def get(u):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(u,timeout=30))
        except Exception: time.sleep(2**i)
    return None
apps={}
for app in ["jira","confluence"]:
    off=0
    while True:
        d=get(f"{B}?application={app}&hosting=cloud&limit=50&offset={off}&sort=popularity")
        items=d["_embedded"].get("addons",[])
        for a in items:
            e=a["_embedded"]; k=a["key"]
            r=apps.setdefault(k,dict(key=k,name=a["name"],vendor=(e.get("vendor") or {}).get("name"),apps=[],
                cats=sorted({c["name"] for c in e.get("categories",[])}),installs=(e.get("distribution") or {}).get("totalInstalls") or 0,
                rating=(e.get("reviews") or {}).get("averageStars"),reviews=(e.get("reviews") or {}).get("count") or 0))
            r["apps"].append(app)
        off+=50
        if len(items)<50: break
print(len(apps),"apps",file=sys.stderr)
def first(k):
    d=get(f"{B}/{k}/versions?limit=1")
    n=(d or {}).get("count",0)
    if not n: return k,None
    v=get(f"{B}/{k}/versions?limit=1&offset={n-1}")
    try: return k,v["_embedded"]["versions"][0]["release"]["date"][:10]
    except Exception: return k,None
with ThreadPoolExecutor(12) as ex:
    for k,dt in ex.map(first,list(apps)): apps[k]["first"]=dt
json.dump(list(apps.values()),open("cloud_scan.json","w"))
print("done",file=sys.stderr)
