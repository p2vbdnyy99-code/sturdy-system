"""The weekly growth report, from what was actually recorded: the CRM, the
content queue, the event log, and any site numbers recorded with
`ttm site-metrics` (visits, sign-ups, paid plans from production). Anything
not recorded is printed as "not available", never estimated."""
import datetime as dt
from collections import Counter

from . import store
from .prospects import due_follow_ups

NA = "not available"


def _in_week(iso: str, start: dt.date, end: dt.date) -> bool:
    if not iso:
        return False
    d = dt.datetime.fromisoformat(iso).date()
    return start <= d <= end


def record_site_metrics(week_ending: str, source: str, **numbers) -> dict:
    """Numbers read from production or analytics for a week (e.g. from
    visits-report.mjs or GA4). source says where they came from."""
    rec = {"week_ending": week_ending, "source": source, "recorded_at": store.now_iso(),
           **{k: int(v) for k, v in numbers.items() if v is not None}}
    with store.locked("site_metrics"):
        rows = [r for r in store.load("site_metrics") if not (r["week_ending"] == week_ending and r["source"] == source)]
        rows.append(rec)
        store.save("site_metrics", rows)
    return rec


def weekly(end: dt.date | None = None) -> dict:
    end = end or dt.date.today()
    start = end - dt.timedelta(days=6)
    ev = [e for e in store.events() if _in_week(e["at"], start, end)]
    kinds = Counter(e["kind"] for e in ev)
    prospects = store.load("prospects")
    content = store.load("content")
    by_channel = Counter(e.get("channel") or "unknown" for e in ev if e["kind"] == "prospect_contacted")
    replies_by_channel = Counter(e.get("channel") or "unknown" for e in ev if e["kind"] == "prospect_reply")
    revenue = sum(float(e.get("amount_inr") or 0) for e in ev if e["kind"] == "prospect_paid")
    published = [c for c in content if _in_week(c.get("published_at", ""), start, end)]
    best = sorted([c for c in content if c.get("metrics")],
                  key=lambda c: (c["metrics"].get("enquiries", 0), c["metrics"].get("clicks", 0), c["metrics"].get("comments", 0)),
                  reverse=True)[:3]
    site = [r for r in store.load("site_metrics") if start.isoformat() <= r["week_ending"] <= end.isoformat()]
    return {
        "week": f"{start.isoformat()} to {end.isoformat()}",
        "new_qualified_prospects": sum(1 for e in ev if e["kind"] == "prospect_saved" and e.get("tier") in ("A", "B")
                                       and not e.get("imported_stage")),
        "new_prospects_all": sum(1 for e in ev if e["kind"] == "prospect_saved" and not e.get("imported_stage")),
        "imported_from_outside": dict(Counter(e["imported_stage"] for e in ev if e["kind"] == "prospect_saved" and e.get("imported_stage"))),
        "contacted": kinds["prospect_contacted"] + kinds["prospect_followed_up"],
        "replies": kinds["prospect_reply"],
        "positive_replies": sum(1 for e in ev if e["kind"] == "prospect_reply" and e.get("sentiment") == "positive"),
        "demos": kinds["prospect_demo"],
        "trial_users": kinds["prospect_activated"],
        "paying_customers_new": kinds["prospect_paid"],
        "paying_customers_total": sum(1 for p in prospects if p["stage"] == "paid"),
        "revenue_inr": revenue if kinds["prospect_paid"] else (0 if prospects else NA),
        "opt_outs": kinds["prospect_opt_out"],
        "contacts_by_channel": dict(by_channel),
        "replies_by_channel": dict(replies_by_channel),
        "content_drafted": kinds["content_drafted"],
        "content_approved": kinds["content_approved"],
        "content_published": len(published),
        "best_content": [{"id": c["id"], "platform": c["platform"], "topic": c["topic"], "metrics": c["metrics"], "url": c.get("published_url")} for c in best],
        "pending_follow_ups": [{"id": p["id"], "company": p["company"], "due": p["next_action_date"]} for p in due_follow_ups(end)],
        "awaiting_approval": {"content": sum(1 for c in content if c["status"] == "draft"),
                              "outreach": sum(1 for p in prospects if p["stage"] == "drafted")},
        "site_metrics": site or NA,
        "next_actions": next_actions(prospects, content, end),
    }


def next_actions(prospects: list, content: list, today: dt.date) -> list:
    """Recommended actions from the recorded state only, most valuable first."""
    acts = []
    warm = [p for p in prospects if p["stage"] in ("replied", "demo", "activated") and not p["opt_out"]]
    for p in sorted(warm, key=lambda p: ["activated", "demo", "replied"].index(p["stage"])):
        acts.append(f"{p['company']} is at '{p['stage']}': {p.get('next_action') or 'talk to them about a paid plan.'}")
    due = due_follow_ups(today)
    if due:
        acts.append(f"Send {len(due)} due follow-up(s): " + ", ".join(p["company"] for p in due) + " (run /follow-up-review).")
    drafted = [p for p in prospects if p["stage"] == "drafted"]
    if drafted:
        acts.append(f"Review and approve {len(drafted)} outreach draft(s): " + ", ".join(p["company"] for p in drafted) + ".")
    approved = [p for p in prospects if p["stage"] == "approved"]
    if approved:
        acts.append(f"Send {len(approved)} approved message(s) by hand, then record 'contacted'.")
    posts = [c for c in content if c["status"] == "draft"]
    if posts:
        acts.append(f"Review {len(posts)} post draft(s) in the queue (ttm queue --status draft).")
    unpublished = [c for c in content if c["status"] == "approved"]
    if unpublished:
        acts.append(f"Publish {len(unpublished)} approved post(s), then record the URL (ttm published).")
    to_verify = [p for p in prospects if p["stage"] == "identified"]
    if to_verify:
        acts.append(f"Verify {len(to_verify)} identified prospect(s) on their own websites before drafting.")
    if not any(p["stage"] not in ("lost", "opted_out") for p in prospects):
        acts.append("The CRM has no open prospects: run /find-prospects.")
    return acts


def to_markdown(r: dict) -> str:
    def v(x):
        return NA if x == NA else x
    lines = [f"# TenderTez weekly growth report ({r['week']})", "",
             "Verified numbers from the CRM, content queue and event log. \"not available\" means nothing was recorded; nothing here is estimated.", "",
             "## Funnel", "| measure | this week |", "|---|---|"]
    for label, key in [("New qualified prospects (tier A/B)", "new_qualified_prospects"), ("All new prospects", "new_prospects_all"),
                       ("Contacted (incl. follow-ups)", "contacted"), ("Replies", "replies"), ("Positive replies", "positive_replies"),
                       ("Demos", "demos"), ("Trial users (first successful use)", "trial_users"),
                       ("New paying customers", "paying_customers_new"), ("Paying customers in total", "paying_customers_total"),
                       ("Revenue (INR)", "revenue_inr"), ("Opt-outs", "opt_outs")]:
        lines.append(f"| {label} | {v(r[key])} |")
    lines += ["", "## Channels", f"- Contacts by channel: {r['contacts_by_channel'] or NA}", f"- Replies by channel: {r['replies_by_channel'] or NA}",
              "", "## Content", f"- Drafted {r['content_drafted']}, approved {r['content_approved']}, published {r['content_published']}"]
    if r["best_content"]:
        lines.append("- Best performing (by enquiries, then clicks, then comments):")
        lines += [f"  - {c['platform']}: {c['topic']} {c['metrics']} {c['url'] or ''}" for c in r["best_content"]]
    else:
        lines.append(f"- Best performing: {NA} (no engagement recorded)")
    if r.get("imported_from_outside"):
        lines.insert(lines.index("## Channels") - 1, f"Imported from contact made outside the CRM (not counted above): {r['imported_from_outside']}")
    lines += ["", "## Website (recorded from production or analytics)"]
    if r["site_metrics"] == NA:
        lines.append(f"- {NA}: record it with `ttm site-metrics`.")
    else:
        lines += ["| week ending | visits | visitors | sign-ups | first analyses | paid plans | source |", "|---|---|---|---|---|---|---|"]
        lines += [f"| {m['week_ending']} | {m.get('visits', NA)} | {m.get('visitors', NA)} | {m.get('signups', NA)} | "
                  f"{m.get('first_analyses', NA)} | {m.get('paid_plans', NA)} | {m['source']} |" for m in r["site_metrics"]]
    lines += ["", "## Due now", f"- Follow-ups due: {len(r['pending_follow_ups'])}"]
    lines += [f"  - {p['company']} ({p['id']}), due {p['due']}" for p in r["pending_follow_ups"]]
    lines += [f"- Waiting for your approval: {r['awaiting_approval']['content']} posts, {r['awaiting_approval']['outreach']} outreach drafts"]
    lines += ["", "## Recommended next actions (from the recorded state)"] + [f"{n}. {a}" for n, a in enumerate(r.get("next_actions") or [], 1)]
    if not r.get("next_actions"):
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)
