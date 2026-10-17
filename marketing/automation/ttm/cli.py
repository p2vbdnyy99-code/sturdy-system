"""Command line: python3 -m ttm <command> (run from marketing/automation).

Every command that changes data respects the kill switch. Nothing here
sends, posts or publishes: 'contacted' and 'published' only record what the
founder did by hand."""
import argparse
import csv
import datetime as dt
import json
import sys

from . import content, daily_post, dashboard, prospects, report, seo_audit, store
from .config import load_config, data_dir
from .safety import KillSwitchOn, guard


def _print(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2) if not isinstance(obj, str) else obj)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ttm", description="TenderTez marketing operations")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("prospect-add", help="save a verified prospect from a JSON file or string")
    s.add_argument("json", help="JSON object, or @path/to/file.json (a list is accepted)")
    s.add_argument("--import-stage", default="", choices=["", *prospects.IMPORT_STAGES],
                   help="bring in a business contacted outside the CRM at the stage it reached")
    s = sub.add_parser("prospects", help="list prospects")
    s.add_argument("--q", default=""); s.add_argument("--stage", default=""); s.add_argument("--tier", default="")
    s = sub.add_parser("prospect", help="show one prospect"); s.add_argument("id")
    s = sub.add_parser("stage", help="move a prospect: verify|draft|approve|contacted|followed_up|reply|demo|activated|paid|lost|opt_out")
    s.add_argument("id"); s.add_argument("action"); s.add_argument("--note", default="")
    s.add_argument("--message", default=""); s.add_argument("--channel", default="")
    s.add_argument("--sentiment", choices=["positive", "neutral", "negative"], default=None)
    s.add_argument("--amount-inr", default=None); s.add_argument("--plan", default="")
    sub.add_parser("follow-ups", help="prospects due for a follow-up today")
    s = sub.add_parser("leads-csv", help="export the CRM as a leads CSV (keep it out of Git)"); s.add_argument("path")
    s = sub.add_parser("contacted-before", help="record a business already contacted outside the CRM (e.g. Gmail sent)")
    s.add_argument("contact", help="email address or domain that was contacted"); s.add_argument("--company", default="")
    s.add_argument("--date", default=""); s.add_argument("--source", default=""); s.add_argument("--alias", action="append", default=[])

    s = sub.add_parser("draft", help="queue a content draft (checked for claims)")
    s.add_argument("--platform", required=True, choices=list(content.PLATFORMS))
    s.add_argument("--text", required=True); s.add_argument("--topic", required=True)
    s.add_argument("--audience", required=True); s.add_argument("--purpose", required=True)
    s.add_argument("--cta", default=""); s.add_argument("--source", action="append", default=[])
    s.add_argument("--kpi", default=""); s.add_argument("--date", default="")
    s = sub.add_parser("lint", help="check a text for a platform without queueing it")
    s.add_argument("--platform", required=True, choices=list(content.PLATFORMS)); s.add_argument("--text", required=True)
    s.add_argument("--source", action="append", default=[])
    s = sub.add_parser("queue", help="the content queue"); s.add_argument("--status", default=""); s.add_argument("--platform", default="")
    s = sub.add_parser("approve", help="approve a draft"); s.add_argument("id"); s.add_argument("--by", default="founder")
    s = sub.add_parser("reject", help="reject a draft"); s.add_argument("id"); s.add_argument("--reason", required=True)
    s = sub.add_parser("published", help="record that an approved post went live"); s.add_argument("id"); s.add_argument("url")
    s = sub.add_parser("metrics", help="record engagement shown by the platform"); s.add_argument("id")
    for m in ("impressions", "reactions", "comments", "clicks", "enquiries"):
        s.add_argument(f"--{m}", default=None)

    s = sub.add_parser("site-metrics", help="record a week's site numbers (from production or GA4)")
    s.add_argument("--week-ending", required=True); s.add_argument("--source", required=True)
    for m in ("visits", "visitors", "signups", "first_analyses", "paid_plans"):
        s.add_argument(f"--{m.replace('_', '-')}", dest=m, default=None)
    s = sub.add_parser("report", help="weekly report"); s.add_argument("--end", default=""); s.add_argument("--json", action="store_true")
    s = sub.add_parser("seo-audit", help="audit the live site"); s.add_argument("--base", default=None); s.add_argument("--json", action="store_true")
    s = sub.add_parser("dashboard", help="write the HTML dashboard (default marketing/data/dashboard.html)")
    s.add_argument("--out", default="")
    s = sub.add_parser("daily-post", help="today's tender post (JSON: label, linkedin, x, whatsapp); posts nothing")
    s.add_argument("--date", default=""); s.add_argument("--base", default="")
    sub.add_parser("status", help="settings, kill switch and data counts")
    s = sub.add_parser("export", help="write a backup of all data to a JSON file"); s.add_argument("path")
    s = sub.add_parser("import", help="restore data from a backup (refuses to overwrite non-empty data without --force)")
    s.add_argument("path"); s.add_argument("--force", action="store_true")

    a = ap.parse_args(argv)
    cfg = load_config()
    try:
        if a.cmd == "prospect-add":
            if a.json.startswith("@"):
                with open(a.json[1:], encoding="utf-8") as f:
                    raw = f.read()
            else:
                raw = a.json
            data = json.loads(raw)
            results = []
            for item in data if isinstance(data, list) else [data]:
                try:
                    rec = prospects.save_prospect(item, cfg["lead_scoring"], a.import_stage)
                    results.append({"saved": rec["id"], "company": rec["company"], "score": rec["lead_score"], "tier": rec["tier"]})
                except prospects.ProspectError as e:
                    results.append({"skipped": item.get("company"), "reason": str(e)})
            _print(results)
        elif a.cmd == "prospects":
            _print([{k: r[k] for k in ("id", "company", "category", "lead_score", "tier", "stage", "next_action_date")}
                    for r in prospects.list_prospects(a.q, a.stage, a.tier)])
        elif a.cmd == "prospect":
            _print(prospects.get_prospect(a.id))
        elif a.cmd == "stage":
            fields = {k: v for k, v in {"message": a.message, "channel": a.channel, "sentiment": a.sentiment,
                                         "amount_inr": a.amount_inr, "plan": a.plan}.items() if v}
            if a.action == "contacted":
                fields["follow_up_days"] = cfg["limits"]["follow_up_after_days"]
            rec = prospects.update_stage(a.id, a.action, a.note, **fields)
            _print({"id": rec["id"], "company": rec["company"], "stage": rec["stage"], "next_action": rec["next_action"], "next_action_date": rec["next_action_date"]})
        elif a.cmd == "follow-ups":
            _print([{"id": r["id"], "company": r["company"], "last_contact": r["last_contact_date"], "channel": r.get("draft_channel")}
                    for r in prospects.due_follow_ups(max_follow_ups=cfg["limits"]["max_follow_ups"])])
        elif a.cmd == "leads-csv":
            with open(a.path, "w", encoding="utf-8", newline="") as f:
                w = csv.writer(f)
                w.writerow(prospects.LEAD_COLUMNS)
                rows = prospects.lead_rows()
                w.writerows(rows)
            _print({"leads_csv": a.path, "rows": len(rows)})
        elif a.cmd == "contacted-before":
            _print(prospects.add_prior_contact(a.contact, a.company, a.date, a.source, a.alias))
        elif a.cmd == "draft":
            rec = content.add_draft(platform=a.platform, text=a.text, topic=a.topic, audience=a.audience, purpose=a.purpose,
                                    cta=a.cta, sources=a.source, kpi=a.kpi, scheduled_for=a.date)
            _print({"queued": rec["id"], "warnings": rec["warnings"]})
        elif a.cmd == "lint":
            _print(content.lint(a.text, a.platform, a.source))
        elif a.cmd == "queue":
            _print([{k: i.get(k) for k in ("id", "scheduled_for", "platform", "status", "topic", "audience")} for i in content.queue(a.status, a.platform)])
        elif a.cmd == "approve":
            _print(content.approve(a.id, a.by)["status"])
        elif a.cmd == "reject":
            _print(content.reject(a.id, a.reason)["status"])
        elif a.cmd == "published":
            _print(content.mark_published(a.id, a.url)["status"])
        elif a.cmd == "metrics":
            _print(content.record_metrics(a.id, impressions=a.impressions, reactions=a.reactions, comments=a.comments,
                                          clicks=a.clicks, enquiries=a.enquiries)["metrics"])
        elif a.cmd == "site-metrics":
            _print(report.record_site_metrics(a.week_ending, a.source, visits=a.visits, visitors=a.visitors,
                                              signups=a.signups, first_analyses=a.first_analyses, paid_plans=a.paid_plans))
        elif a.cmd == "report":
            r = report.weekly(dt.date.fromisoformat(a.end) if a.end else None)
            _print(r if a.json else report.to_markdown(r))
        elif a.cmd == "seo-audit":
            r = seo_audit.run(a.base or cfg["site"])
            _print(r if a.json else seo_audit.to_markdown(r))
        elif a.cmd == "dashboard":
            out = a.out or str(data_dir() / "dashboard.html")
            with open(out, "w", encoding="utf-8") as f:
                f.write(dashboard.build())
            _print({"dashboard": out})
        elif a.cmd == "daily-post":
            day = dt.date.fromisoformat(a.date) if a.date else None
            try:
                _print(daily_post.build(a.base or cfg["site"], day))
            except daily_post.DailyPostError as e:
                print(f"error: {e}", file=sys.stderr)
                return 3
        elif a.cmd == "status":
            _print({"data_dir": str(data_dir()), "kill_switch": cfg["kill_switch"], "dry_run": cfg["dry_run"],
                    "prospects": len(store.load("prospects")), "content": len(store.load("content")),
                    "suppressed": len(store.load("suppression")),
                    "contacted_before": len(store.load("prior_contacts")), "events": len(store.events())})
        elif a.cmd == "export":
            backup = {name: store.load(name) for name in ("prospects", "content", "suppression", "site_metrics", "prior_contacts")}
            backup["events"] = store.events()
            backup["exported_at"] = store.now_iso()
            with open(a.path, "w", encoding="utf-8") as f:
                json.dump(backup, f, ensure_ascii=False, indent=1)
            _print({"exported": a.path, **{k: len(v) for k, v in backup.items() if isinstance(v, list)}})
        elif a.cmd == "import":
            guard("import")
            with open(a.path, encoding="utf-8") as f:
                backup = json.load(f)
            if not a.force and any(store.load(n) for n in ("prospects", "content")):
                raise SystemExit("Data already exists here; use --force to replace it with the backup.")
            for name in ("prospects", "content", "suppression", "site_metrics", "prior_contacts"):
                store.save(name, backup.get(name, []))
            with open(data_dir() / "events.jsonl", "w", encoding="utf-8") as f:
                for e in backup.get("events", []):
                    f.write(json.dumps(e, ensure_ascii=False) + "\n")
            _print({"imported": a.path})
        return 0
    except (prospects.ProspectError, content.ContentError, KillSwitchOn) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
