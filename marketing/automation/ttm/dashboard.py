"""A one-file HTML dashboard of the marketing data, written locally (default
marketing/data/dashboard.html, git-ignored). It shows only recorded data and
says "not available" for anything missing. Open it in a browser; it loads
nothing from the network."""
import datetime as dt
import html
from collections import Counter

from . import report, store
from .prospects import STAGES, END_STAGES


def _e(x) -> str:
    return html.escape("" if x is None else str(x))


def _table(headers, rows) -> str:
    if not rows:
        return f"<p class=na>{report.NA}</p>"
    head = "".join(f"<th>{_e(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{_e(c)}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def build(today: dt.date | None = None) -> str:
    today = today or dt.date.today()
    r = report.weekly(today)
    prospects = store.load("prospects")
    content = store.load("content")
    stages = Counter(p["stage"] for p in prospects)
    by_source = Counter((p.get("channel_source") or "unknown") for p in prospects)
    replied_by_source = Counter((p.get("channel_source") or "unknown") for p in prospects
                                if p["stage"] in ("replied", "demo", "activated", "paid"))
    paid_by_source = Counter((p.get("channel_source") or "unknown") for p in prospects if p["stage"] == "paid")
    intent = [p for p in prospects if p.get("response_status") == "positive" or p["stage"] in ("demo", "activated", "paid")]
    due = [p for p in prospects if p.get("next_action_date") and p["next_action_date"] <= today.isoformat()
           and p["stage"] not in END_STAGES + ["paid"]]
    perf = sorted([c for c in content if c.get("metrics")],
                  key=lambda c: (c["metrics"].get("enquiries", 0), c["metrics"].get("clicks", 0)), reverse=True)
    funnel_rows = [(s, stages.get(s, 0)) for s in STAGES + END_STAGES]
    cards = [("Prospects", len(prospects)), ("Waiting for approval", r["awaiting_approval"]["outreach"] + r["awaiting_approval"]["content"]),
             ("Due today or overdue", len(due)), ("Paying customers", stages.get("paid", 0)),
             ("Revenue this week (INR)", r["revenue_inr"]), ("Contacted before (outside CRM)", len(store.load("prior_contacts")))]
    card_html = "".join(f"<div class=card><div class=n>{_e(v)}</div><div>{_e(k)}</div></div>" for k, v in cards)
    site = r["site_metrics"]
    site_html = (f"<p class=na>{report.NA}: record the week's numbers with <code>ttm site-metrics</code> "
                 "(from visits-report.mjs or GA4).</p>") if site == report.NA else _table(
        ["week ending", "source", "visits", "visitors", "sign-ups", "first analyses", "paid plans"],
        [(m["week_ending"], m["source"], m.get("visits"), m.get("visitors"), m.get("signups"), m.get("first_analyses"), m.get("paid_plans")) for m in site])
    return f"""<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>TenderTez marketing</title><style>
:root{{--bg:#f7f7f5;--fg:#1d2433;--muted:#5d6577;--line:#d9dce3;--card:#fff;--accent:#c46a12}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151821;--fg:#e8eaf0;--muted:#a3a9b8;--line:#30364a;--card:#1d2130;--accent:#f0a24b}}}}
body{{margin:0;padding:16px;font:15px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg)}}
main{{max-width:1100px;margin:auto}}h1{{font-size:22px}}h2{{font-size:17px;margin-top:28px;border-bottom:1px solid var(--line);padding-bottom:4px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px}}.n{{font-size:24px;font-weight:600;color:var(--accent)}}
table{{width:100%;border-collapse:collapse;background:var(--card);font-size:14px}}th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}}
.wrap{{overflow-x:auto}}.na,.muted{{color:var(--muted)}}code{{font-size:13px}}
</style></head><body><main>
<h1>TenderTez marketing</h1>
<p class=muted>Built {_e(today.isoformat())} from the local CRM, content queue and event log. Recorded data only; nothing is estimated.</p>
<div class=cards>{card_html}</div>
<h2>Funnel</h2><div class=wrap>{_table(["stage", "prospects"], funnel_rows)}</div>
<h2>Next actions due</h2><div class=wrap>{_table(["company", "stage", "next action", "due"], [(p["company"], p["stage"], p.get("next_action"), p.get("next_action_date")) for p in sorted(due, key=lambda p: p["next_action_date"])])}</div>
<h2>Buying intent</h2><div class=wrap>{_table(["company", "stage", "reply", "last contact"], [(p["company"], p["stage"], p.get("response_status"), p.get("last_contact_date")) for p in intent])}</div>
<h2>Where leads came from</h2><div class=wrap>{_table(["source", "prospects", "replied or further", "paid"], [(s, n, replied_by_source.get(s, 0), paid_by_source.get(s, 0)) for s, n in by_source.most_common()])}</div>
<h2>This week's activity</h2><div class=wrap>{_table(["measure", "count"], [("contacted", r["contacts_by_channel"] or report.NA), ("replies", r["replies_by_channel"] or report.NA), ("posts drafted", r["content_drafted"]), ("posts approved", r["content_approved"]), ("posts published", r["content_published"])])}</div>
<h2>Content queue</h2><div class=wrap>{_table(["date", "platform", "status", "topic", "audience"], [(c.get("scheduled_for"), c["platform"], c["status"], c["topic"], c["audience"]) for c in report_queue(content)])}</div>
<h2>Post performance</h2><div class=wrap>{_table(["platform", "topic", "enquiries", "clicks", "comments", "impressions", "url"], [(c["platform"], c["topic"], c["metrics"].get("enquiries"), c["metrics"].get("clicks"), c["metrics"].get("comments"), c["metrics"].get("impressions"), c.get("published_url")) for c in perf])}</div>
<h2>Website (landing pages and sign-ups)</h2>{site_html}
<h2>Paying customers</h2><div class=wrap>{_table(["company", "plan", "revenue (INR)"], [(p["company"], p.get("plan"), p.get("revenue_inr")) for p in prospects if p["stage"] == "paid"])}</div>
</main></body></html>
"""


def report_queue(content: list) -> list:
    return sorted(content, key=lambda c: (c.get("scheduled_for") or "9999", c["created_at"]))
