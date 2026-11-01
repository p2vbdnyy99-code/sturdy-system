"""Summarise atlassian_entrant_scan.py output: where do *new* Cloud apps actually get installs?

Usage: python3 atlassian_entrant_report.py cloud_scan.json [since=YYYY-MM-DD] [min_installs=100]
"""
import json, sys, collections

path = sys.argv[1]
since = sys.argv[2] if len(sys.argv) > 2 else "2025-04-21"
hit = int(sys.argv[3]) if len(sys.argv) > 3 else 100
apps = [a for a in json.load(open(path)) if a.get("first")]
new = [a for a in apps if a["first"] >= since]

print(f"{len(apps)} Cloud apps with release history; {len(new)} first released on/after {since}")
print(f"new apps with >= {hit} installs: {sum(a['installs'] >= hit for a in new)}")
inst = sorted(a["installs"] for a in new)
if inst:
    print("new-app installs: median", inst[len(inst) // 2], "| p90", inst[int(len(inst) * .9)])

cat = collections.defaultdict(lambda: dict(all=0, new=0, wins=0, inst=0))
for a in apps:
    for c in a["cats"] or ["(none)"]:
        cat[c]["all"] += 1
        cat[c]["inst"] += a["installs"]
        if a["first"] >= since:
            cat[c]["new"] += 1
            cat[c]["wins"] += a["installs"] >= hit
print(f"\n{'category':32} apps  new  new>={hit}  win%   total_installs")
for c, v in sorted(cat.items(), key=lambda kv: -(kv[1]["wins"] / max(kv[1]["new"], 1))):
    if v["new"] >= 10:
        print(f"{c[:32]:32} {v['all']:5} {v['new']:4} {v['wins']:8} {100 * v['wins'] / v['new']:5.1f}  {v['inst']:>10}")

print(f"\nTop new entrants since {since} (non-Atlassian):")
for a in sorted(new, key=lambda a: -a["installs"])[:40]:
    if a["vendor"] != "Atlassian":
        print(f"{a['installs']:>6} {a['first']} {(a['rating'] or 0):.1f}/{a['reviews']:<3} "
              f"{a['name'][:55]} | {a['vendor'][:20]} | {','.join(a['cats'])[:40]}")
