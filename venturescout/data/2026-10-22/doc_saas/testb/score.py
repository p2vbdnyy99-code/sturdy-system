"""Score outputs/Sxx.json against truth/Sxx.json using the metrics fixed in PROTOCOL.md. Writes results.json.

Usage: python3 score.py [outputs_dir=outputs] [--only-present]
Accepts the compact form {"opening","closing","tx":[[date,desc,amount,balance],...]} or the PROTOCOL form
{"opening_balance","closing_balance","transactions":[{...}]} (e.g. pasted from a consumer AI tool).
--only-present scores just the documents that have an output file (for the 5-document free-tool replication).
"""
import json, os, re, sys, difflib
OUT = next((a for a in sys.argv[1:] if not a.startswith("--")), "outputs")
ONLY = "--only-present" in sys.argv
def norm(s): return re.sub(r"\s+", " ", (s or "").upper()).strip()
def desc_ok(t, e):
    t, e = norm(t), norm(e)
    return t == e or (t.startswith(e) and len(e) >= 50)   # rendered description truncated at 60 chars by the layout
docs, agg = [], dict(truth_rows=0, out_rows=0, matched=0, exact=0, date=0, amount=0, sign=0, balance=0, balance_n=0,
                     desc=0, omitted=0, extra=0, docs=0, processed=0, open_ok=0, close_ok=0, recon_ok=0, crit_docs=0)
for f in sorted(os.listdir("truth")):
    T = json.load(open(f"truth/{f}")); o = f"{OUT}/{f}"
    if ONLY and not os.path.exists(o): continue
    agg["docs"] += 1
    if not os.path.exists(o): docs.append(dict(doc=T["doc"], processed=False)); continue
    E = json.load(open(o)); agg["processed"] += 1
    if "transactions" in E:  # PROTOCOL form
        E = dict(opening=E.get("opening_balance"), closing=E.get("closing_balance"),
                 tx=[[r.get("date"), r.get("description"), r.get("amount"), r.get("balance")] for r in E["transactions"]])
    tt = T["transactions"]; et = [dict(date=r[0], description=r[1], amount=r[2], balance=r[3]) for r in E["tx"]]
    sm = difflib.SequenceMatcher(None, [round(abs(x["amount"]), 2) for x in tt], [round(abs(x["amount"]), 2) for x in et], autojunk=False)
    pairs = [(i, j) for b in sm.get_matching_blocks() for i, j in zip(range(b.a, b.a + b.size), range(b.b, b.b + b.size))]
    d = dict(doc=T["doc"], family=T["family"], scanned=T["scanned"], truth_rows=len(tt), out_rows=len(et), matched=len(pairs),
             omitted=len(tt) - len(pairs), extra=len(et) - len(pairs), errors=[])
    for i, j in pairs:
        t, e = tt[i], et[j]
        ok_date = t["date"] == e["date"]; ok_amt = abs(t["amount"] - e["amount"]) < 0.005
        ok_sign = (t["amount"] > 0) == (e["amount"] > 0); ok_desc = desc_ok(t["description"], e["description"])
        ok_bal = True
        if t["balance"] is not None:
            agg["balance_n"] += 1; ok_bal = e["balance"] is not None and abs(t["balance"] - e["balance"]) < 0.005; agg["balance"] += ok_bal
        agg["date"] += ok_date; agg["amount"] += ok_amt; agg["sign"] += ok_sign; agg["desc"] += ok_desc
        if ok_date and ok_amt and ok_desc and ok_bal: agg["exact"] += 1
        else: d["errors"].append(dict(row=i, truth=t, out=e, date=ok_date, amount=ok_amt, desc=ok_desc, balance=ok_bal))
    d["open_ok"] = abs(T["opening_balance"] - E["opening"]) < 0.005
    d["close_ok"] = abs(T["closing_balance"] - E["closing"]) < 0.005
    d["recon_ok"] = abs(E["opening"] + sum(x["amount"] for x in et) - E["closing"]) < 0.005
    d["critical"] = d["omitted"] + d["extra"] + sum(1 for x in d["errors"] if not (x["date"] and x["amount"]) or not x["balance"])
    for k in ("truth_rows", "out_rows", "matched", "omitted", "extra"): agg[k] += d[k]
    agg["open_ok"] += d["open_ok"]; agg["close_ok"] += d["close_ok"]; agg["recon_ok"] += d["recon_ok"]; agg["crit_docs"] += d["critical"] > 0
    docs.append(d)
json.dump(dict(aggregate=agg, docs=docs), open("results.json" if OUT == "outputs" else f"{OUT}/results.json", "w"), indent=1)
a = agg; pct = lambda n, dnm: f"{n}/{dnm} = {100 * n / dnm:.2f}%"
print("documents processed:", pct(a["processed"], a["docs"]))
print("exact transaction rows (vs truth rows):", pct(a["exact"], a["truth_rows"]))
print("omitted rows:", a["omitted"], "| extra rows:", a["extra"], "| matched:", a["matched"])
for k in ("date", "amount", "sign", "desc"): print(f"{k} accuracy (matched rows):", pct(a[k], a["matched"]))
print("balance accuracy:", pct(a["balance"], a["balance_n"]))
print("opening correct:", pct(a["open_ok"], a["processed"]), "| closing correct:", pct(a["close_ok"], a["processed"]),
      "| reconciles:", pct(a["recon_ok"], a["processed"]))
print("documents with >=1 critical error:", pct(a["crit_docs"], a["processed"]))
for d in docs:
    if d.get("errors") or d.get("omitted") or d.get("extra") or not d.get("open_ok", True):
        print(" ", d["doc"], "fam", d["family"], "scanned" if d["scanned"] else "", "omit", d["omitted"], "extra", d["extra"],
              "open_ok", d["open_ok"], "errors:", [(x["row"], "date" if not x["date"] else "", "amt" if not x["amount"] else "",
              "desc" if not x["desc"] else "", "bal" if not x["balance"] else "") for x in d["errors"]][:6])
