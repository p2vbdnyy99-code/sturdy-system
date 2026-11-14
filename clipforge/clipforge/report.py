"""Earnings Intelligence: weekly profitability report.

Two kinds of earnings are kept strictly apart:
  * verified  = money actually received (payouts table). Only this counts toward the target.
  * estimated = views x campaign CPM, after per-post thresholds and caps. A forecast, not income;
                marketplaces reject views (bots, wrong region, late submission) and budgets run out.
"""

from __future__ import annotations

import sqlite3
from datetime import date, timedelta

from .db import fmt_money
from .evaluator import payout_for_views

TARGET_VERIFIED_CENTS = 5_000   # first $50 verified
TARGET_CLIPS = 30


def week_bounds(any_day: date) -> tuple[date, date]:
    start = any_day - timedelta(days=any_day.weekday())   # Monday
    return start, start + timedelta(days=6)                # Sunday, inclusive


def _views_as_of(conn: sqlite3.Connection, post_id: int, day: date) -> tuple[int, int | None]:
    row = conn.execute(
        "SELECT views, approved_views FROM view_snapshots WHERE post_id=? AND taken_on<=? "
        "ORDER BY taken_on DESC, id DESC LIMIT 1",
        (post_id, day.isoformat()),
    ).fetchone()
    return (row["views"], row["approved_views"]) if row else (0, None)


def weekly_data(conn: sqlite3.Connection, any_day: date | None = None) -> dict:
    start, end = week_bounds(any_day or date.today())
    before = start - timedelta(days=1)
    s, e = start.isoformat(), end.isoformat()

    campaigns = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM campaigns")}
    per_campaign: dict[int, dict] = {
        cid: {"name": f"{c['marketplace']}: {c['name']}", "est_cents": 0.0, "verified_cents": 0,
              "minutes": 0, "posts": 0, "views_gained": 0}
        for cid, c in campaigns.items()
    }

    # Estimated earnings accrued this week, per post: pay(end) - pay(start).
    # Thresholds apply to cumulative views, so this is not views_gained x CPM.
    posts = conn.execute(
        "SELECT p.id, p.posted_on, c.campaign_id FROM posts p JOIN clips c ON c.id = p.clip_id"
    ).fetchall()
    for p in posts:
        c = campaigns[p["campaign_id"]]
        v_end, a_end = _views_as_of(conn, p["id"], end)
        v_start, a_start = _views_as_of(conn, p["id"], before)
        # Prefer marketplace-approved views when reported.
        basis_end = a_end if a_end is not None else v_end
        basis_start = a_start if a_start is not None else v_start
        pay = lambda v: payout_for_views(v, c["cpm_cents"], c["min_views_per_post"], c["max_payout_per_post_cents"])
        pc = per_campaign[p["campaign_id"]]
        pc["est_cents"] += pay(basis_end) - pay(basis_start)
        pc["views_gained"] += v_end - v_start
        if s <= p["posted_on"] <= e:
            pc["posts"] += 1

    for r in conn.execute(
        "SELECT campaign_id, SUM(amount_cents) t FROM payouts WHERE received_on BETWEEN ? AND ? GROUP BY campaign_id",
        (s, e),
    ):
        if r["campaign_id"] in per_campaign:
            per_campaign[r["campaign_id"]]["verified_cents"] += r["t"]

    minutes_operating = minutes_building = 0
    for r in conn.execute("SELECT campaign_id, activity, minutes FROM work_log WHERE worked_on BETWEEN ? AND ?", (s, e)):
        if r["activity"] == "building":
            minutes_building += r["minutes"]
        else:
            minutes_operating += r["minutes"]
        if r["campaign_id"] in per_campaign:
            per_campaign[r["campaign_id"]]["minutes"] += r["minutes"]

    verified_week = conn.execute(
        "SELECT COALESCE(SUM(amount_cents),0) FROM payouts WHERE received_on BETWEEN ? AND ?", (s, e)).fetchone()[0]
    verified_total = conn.execute("SELECT COALESCE(SUM(amount_cents),0) FROM payouts").fetchone()[0]
    expenses_week = conn.execute(
        "SELECT COALESCE(SUM(amount_cents),0) FROM expenses WHERE spent_on BETWEEN ? AND ?", (s, e)).fetchone()[0]
    expenses_total = conn.execute("SELECT COALESCE(SUM(amount_cents),0) FROM expenses").fetchone()[0]
    clips_published = conn.execute("SELECT COUNT(DISTINCT clip_id) FROM posts").fetchone()[0]
    est_week = sum(pc["est_cents"] for pc in per_campaign.values())

    def per_hour(cents: float, minutes: int) -> float | None:
        return cents * 60 / minutes if minutes else None

    return {
        "start": s, "end": e,
        "verified_week_cents": verified_week,
        "verified_total_cents": verified_total,
        "estimated_week_cents": est_week,
        "expenses_week_cents": expenses_week,
        "expenses_total_cents": expenses_total,
        "minutes_operating": minutes_operating,
        "minutes_building": minutes_building,
        "verified_per_operating_hour": per_hour(verified_week, minutes_operating),
        "estimated_per_operating_hour": per_hour(est_week, minutes_operating),
        "verified_per_total_hour": per_hour(verified_week, minutes_operating + minutes_building),
        "clips_published": clips_published,
        "target_verified_cents": TARGET_VERIFIED_CENTS,
        "target_clips": TARGET_CLIPS,
        "campaigns": [dict(cid=k, **v) for k, v in per_campaign.items()
                      if v["est_cents"] or v["verified_cents"] or v["minutes"] or v["posts"]],
    }


def _hours(m: int) -> str:
    return f"{m / 60:.1f} h"


def to_markdown(d: dict) -> str:
    def rate(x):
        return fmt_money(x) + "/h" if x is not None else "n/a (no hours logged)"

    net_week = d["verified_week_cents"] - d["expenses_week_cents"]
    lines = [
        f"# ClipForge weekly profitability: {d['start']} to {d['end']}",
        "",
        f"**Verified earnings this week: {fmt_money(d['verified_week_cents'])}** "
        f"(net of expenses {fmt_money(net_week)}). "
        f"Verified per operating hour: {rate(d['verified_per_operating_hour'])}.",
        "",
        "## Validation target",
        f"- Verified to date: {fmt_money(d['verified_total_cents'])} of {fmt_money(d['target_verified_cents'])} "
        f"({d['verified_total_cents'] / d['target_verified_cents']:.0%})",
        f"- Clips published to date: {d['clips_published']} of {d['target_clips']}",
        f"- Expenses to date: {fmt_money(d['expenses_total_cents'])}",
        "",
        "## This week",
        "| Measure | Value |",
        "|---|---|",
        f"| Verified (money received) | {fmt_money(d['verified_week_cents'])} |",
        f"| Estimated (views x CPM; forecast, not income) | {fmt_money(round(d['estimated_week_cents']))} |",
        f"| Expenses | {fmt_money(d['expenses_week_cents'])} |",
        f"| Operating time (clipping, posting, admin) | {_hours(d['minutes_operating'])} |",
        f"| Building time (system development) | {_hours(d['minutes_building'])} |",
        f"| Verified per operating hour | {rate(d['verified_per_operating_hour'])} |",
        f"| Estimated per operating hour | {rate(d['estimated_per_operating_hour'])} |",
        f"| Verified per hour incl. building | {rate(d['verified_per_total_hour'])} |",
        "",
    ]
    if d["campaigns"]:
        lines += ["## By campaign", "| Campaign | Posts | Views gained | Estimated | Verified | Time |",
                  "|---|---|---|---|---|---|"]
        for c in sorted(d["campaigns"], key=lambda c: -c["est_cents"]):
            lines.append(f"| {c['name']} | {c['posts']} | {c['views_gained']:,} | {fmt_money(round(c['est_cents']))} "
                         f"| {fmt_money(c['verified_cents'])} | {_hours(c['minutes'])} |")
        lines.append("")
    lines += [
        "## Notes",
        "- Payouts usually lag views, so verified per hour trails estimated per hour. If the gap stays wide after",
        "  payouts should have arrived, the marketplace is rejecting views or the budget ran out.",
        "- Estimated figures use marketplace-approved views where recorded, raw views otherwise.",
    ]
    return "\n".join(lines) + "\n"
