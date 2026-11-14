"""Command line entry point:  python -m clipforge <command> ...  (run with --help for details)."""

from __future__ import annotations

import argparse
import csv
import math
import sqlite3
import sys
from datetime import date
from pathlib import Path

from . import db as dbm
from .evaluator import Assumptions, evaluate
from .report import to_markdown, weekly_data

CAMPAIGN_FIELDS = {
    # csv column / flag -> (db column, converter)
    "marketplace": ("marketplace", str),
    "name": ("name", str),
    "url": ("url", str),
    "cpm": ("cpm_cents", dbm.to_cents),
    "budget_total": ("budget_total_cents", dbm.to_cents),
    "budget_remaining": ("budget_remaining_cents", dbm.to_cents),
    "min_views": ("min_views_per_post", lambda v: int(v) if str(v).strip() else 0),
    "max_payout_per_post": ("max_payout_per_post_cents", dbm.to_cents),
    "platforms": ("platforms", lambda v: v.replace(" ", "").lower()),
    "source_permission": ("source_permission", str),
    "min_withdrawal": ("min_withdrawal_cents", lambda v: dbm.to_cents(v) or 0),
    "payout_terms": ("payout_terms", str),
    "rules": ("rules", str),
    "status": ("status", str),
    "ends_on": ("ends_on", str),
    "checked_on": ("checked_on", str),
}
REQUIRED = ("marketplace", "name", "cpm", "platforms")
PERMISSIONS = ("explicit", "unclear", "none")


def upsert_campaign(conn, values: dict) -> int:
    missing = [k for k in REQUIRED if not str(values.get(k) or "").strip()]
    if missing:
        raise ValueError(f"missing required field(s): {', '.join(missing)}")
    perm = values.get("source_permission") or "unclear"
    if perm not in PERMISSIONS:
        raise ValueError(f"source_permission must be one of {PERMISSIONS}, got {perm!r}")
    row = {}
    for key, raw in values.items():
        if key in CAMPAIGN_FIELDS and raw is not None and str(raw).strip() != "":
            col, conv = CAMPAIGN_FIELDS[key]
            row[col] = conv(str(raw).strip())
    row.setdefault("checked_on", date.today().isoformat())
    cols = ", ".join(row)
    marks = ", ".join("?" for _ in row)
    updates = ", ".join(f"{c}=excluded.{c}" for c in row if c not in ("marketplace", "name"))
    conn.execute(
        f"INSERT INTO campaigns ({cols}) VALUES ({marks}) "
        f"ON CONFLICT(marketplace, name) DO UPDATE SET {updates}",
        list(row.values()),
    )
    return conn.execute("SELECT id FROM campaigns WHERE marketplace=? AND name=?",
                        (row["marketplace"], row["name"])).fetchone()[0]


def cmd_campaign(conn, a):
    if a.action == "import":
        with open(a.file, newline="", encoding="utf-8-sig") as f:
            n = 0
            for i, rec in enumerate(csv.DictReader(f), start=2):
                try:
                    upsert_campaign(conn, rec)
                    n += 1
                except ValueError as e:
                    print(f"row {i}: skipped ({e})", file=sys.stderr)
        conn.commit()
        print(f"imported {n} campaign(s)")
    elif a.action == "add":
        vals = {k: getattr(a, k, None) for k in CAMPAIGN_FIELDS}
        cid = upsert_campaign(conn, vals)
        conn.commit()
        print(f"campaign {cid} saved")
    elif a.action == "list":
        for r in conn.execute("SELECT * FROM campaigns ORDER BY status, marketplace, name"):
            print(f"[{r['id']}] {r['status']:<9} {r['marketplace']}: {r['name']}  "
                  f"CPM {dbm.fmt_money(r['cpm_cents'])}  budget left {dbm.fmt_money(r['budget_remaining_cents'])}  "
                  f"min views {r['min_views_per_post']}  permission {r['source_permission']}  checked {r['checked_on'][:10]}")
    elif a.action == "status":
        conn.execute("UPDATE campaigns SET status=? WHERE id=?", (a.new_status, a.id))
        conn.commit()
        print(f"campaign {a.id} -> {a.new_status}")


def cmd_evaluate(conn, a):
    assume = Assumptions(minutes_per_clip=a.minutes_per_clip, posts_per_clip=a.posts_per_clip,
                         our_platforms=tuple(p.strip().lower() for p in a.platforms.split(",")))
    evs = evaluate(conn, assume)
    if not evs:
        print("no campaigns recorded; add some with 'campaign add' or 'campaign import'")
        return
    print(f"View distribution: {evs[0].view_source}")
    print(f"Assumptions: {assume.minutes_per_clip:g} min per clip, {assume.posts_per_clip} post(s) per clip, "
          f"platforms {','.join(assume.our_platforms)}\n")
    for e in evs:
        line = f"{e.verdict:<8} [{e.campaign_id}] {e.marketplace}: {e.name}"
        if e.verdict == "GO":
            line += (f"  ~{dbm.fmt_money(e.expected_cents_per_post)}/post  "
                     f"~{dbm.fmt_money(e.expected_cents_per_hour)}/hour")
            if e.clips_to_min_withdrawal:
                line += f"  ~{math.ceil(e.clips_to_min_withdrawal)} clips to reach withdrawal minimum"
        print(line)
        for r in e.reasons:
            print(f"           - {r}")
        for w in e.warnings:
            print(f"           ! {w}")


def cmd_simple(conn, a):
    d = a.date or date.today().isoformat()
    if a.cmd == "clip":
        cur = conn.execute("INSERT INTO clips (campaign_id, title, source_url, file_path, status) VALUES (?,?,?,?,?)",
                           (a.campaign, a.title, a.source_url, a.file, a.status))
        print(f"clip {cur.lastrowid} saved")
    elif a.cmd == "post":
        cur = conn.execute("INSERT INTO posts (clip_id, platform, account, url, posted_on, submitted) VALUES (?,?,?,?,?,?)",
                           (a.clip, a.platform.lower(), a.account, a.url, d, int(a.submitted)))
        conn.execute("UPDATE clips SET status='published' WHERE id=?", (a.clip,))
        print(f"post {cur.lastrowid} saved")
    elif a.cmd == "views":
        conn.execute("INSERT INTO view_snapshots (post_id, taken_on, views, approved_views) VALUES (?,?,?,?)",
                     (a.post, d, a.views, a.approved))
        print("views recorded")
    elif a.cmd == "payout":
        conn.execute("INSERT INTO payouts (campaign_id, amount_cents, received_on, reference) VALUES (?,?,?,?)",
                     (a.campaign, dbm.to_cents(a.amount), d, a.reference))
        print("payout recorded")
    elif a.cmd == "expense":
        conn.execute("INSERT INTO expenses (amount_cents, spent_on, description) VALUES (?,?,?)",
                     (dbm.to_cents(a.amount), d, a.description))
        print("expense recorded")
    elif a.cmd == "log":
        conn.execute("INSERT INTO work_log (campaign_id, minutes, worked_on, activity) VALUES (?,?,?,?)",
                     (a.campaign, a.minutes, d, a.activity))
        print("time logged")
    conn.commit()


def cmd_report(conn, a):
    md = to_markdown(weekly_data(conn, date.fromisoformat(a.date) if a.date else None))
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(md, encoding="utf-8")
        print(f"report written to {a.out}")
    else:
        print(md)


def cmd_serve(conn, a):
    from .dashboard import serve
    conn.close()
    serve(a.db, a.host, a.port)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="clipforge", description="ClipForge AI: campaigns, clips, earnings.")
    p.add_argument("--db", default=str(dbm.DEFAULT_DB), help="database path (default: %(default)s)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="create the database")

    c = sub.add_parser("campaign", help="add, import, list campaigns or change status")
    csub = c.add_subparsers(dest="action", required=True)
    ci = csub.add_parser("import", help="import/update campaigns from a CSV (see examples/campaigns.csv)")
    ci.add_argument("file")
    ca = csub.add_parser("add", help="add or update one campaign")
    for k in CAMPAIGN_FIELDS:
        ca.add_argument(f"--{k.replace('_', '-')}", dest=k, required=k in REQUIRED)
    csub.add_parser("list")
    cs = csub.add_parser("status")
    cs.add_argument("id", type=int)
    cs.add_argument("new_status", choices=["candidate", "active", "paused", "ended", "rejected"])

    e = sub.add_parser("evaluate", help="rank campaigns by expected pay per hour")
    e.add_argument("--minutes-per-clip", type=float, default=20.0)
    e.add_argument("--posts-per-clip", type=int, default=1)
    e.add_argument("--platforms", default="tiktok,youtube,instagram", help="platforms you have accounts on")

    cl = sub.add_parser("clip", help="record a clip")
    cl.add_argument("--campaign", type=int, required=True)
    cl.add_argument("--title", required=True)
    cl.add_argument("--source-url")
    cl.add_argument("--file")
    cl.add_argument("--status", default="draft", choices=["draft", "approved", "rejected", "published"])

    po = sub.add_parser("post", help="record a published post")
    po.add_argument("--clip", type=int, required=True)
    po.add_argument("--platform", required=True)
    po.add_argument("--account", required=True)
    po.add_argument("--url", required=True)
    po.add_argument("--submitted", action="store_true", help="already submitted to the campaign")

    v = sub.add_parser("views", help="record a cumulative view count for a post")
    v.add_argument("--post", type=int, required=True)
    v.add_argument("--views", type=int, required=True)
    v.add_argument("--approved", type=int, help="views the marketplace approved, if shown")

    pa = sub.add_parser("payout", help="record money actually received")
    pa.add_argument("--amount", required=True, help="dollars, e.g. 12.50")
    pa.add_argument("--campaign", type=int)
    pa.add_argument("--reference")

    ex = sub.add_parser("expense", help="record money spent")
    ex.add_argument("--amount", required=True)
    ex.add_argument("--description", required=True)

    lg = sub.add_parser("log", help="log working time")
    lg.add_argument("--minutes", type=int, required=True)
    lg.add_argument("--activity", required=True, choices=["clipping", "posting", "admin", "research", "building"])
    lg.add_argument("--campaign", type=int)

    for sp in (cl, po, v, pa, ex, lg):
        sp.add_argument("--date", help="ISO date, default today")

    r = sub.add_parser("report", help="weekly profitability report (Monday-Sunday)")
    r.add_argument("--date", help="any day in the week to report, default today")
    r.add_argument("--out", help="write markdown to this file instead of printing")

    s = sub.add_parser("serve", help="run the dashboard web page")
    s.add_argument("--host", default="127.0.0.1",
                   help="0.0.0.0 to reach it from your phone on the same Wi-Fi (no login; home network only)")
    s.add_argument("--port", type=int, default=8765)
    return p


def main(argv: list[str] | None = None) -> int:
    a = build_parser().parse_args(argv)
    conn = dbm.connect(a.db)
    try:
        if a.cmd == "init":
            print(f"database ready at {a.db}")
        elif a.cmd == "campaign":
            cmd_campaign(conn, a)
        elif a.cmd == "evaluate":
            cmd_evaluate(conn, a)
        elif a.cmd == "report":
            cmd_report(conn, a)
        elif a.cmd == "serve":
            cmd_serve(conn, a)
        else:
            cmd_simple(conn, a)
    except (ValueError, OSError, sqlite3.Error) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return 0
