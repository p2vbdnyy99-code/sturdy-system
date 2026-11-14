"""Campaign Evaluator: rank campaigns by expected pay per working hour.

Expected pay is computed from a distribution of views per post, not a single
guess, because view counts are heavy-tailed and campaigns apply minimum-view
thresholds and per-post caps. A threshold of 1,000 views pays nothing on a post
that gets 900, so the average view count alone would overstate earnings.

Until there are enough of our own posts, the distribution is DEFAULT_VIEW_PRIOR,
which is a placeholder guess for a new account, not data. Once MIN_OWN_POSTS
posts have view snapshots, the evaluator switches to our own observed views.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date

# (probability, views per post). PLACEHOLDER: a guess for a new, small account.
# Replace with real data as soon as posts exist; the evaluator does this automatically.
DEFAULT_VIEW_PRIOR: list[tuple[float, int]] = [
    (0.50, 300),
    (0.30, 1_500),
    (0.15, 8_000),
    (0.05, 50_000),
]
MIN_OWN_POSTS = 10
STALE_AFTER_DAYS = 7


@dataclass
class Assumptions:
    minutes_per_clip: float = 20.0      # end-to-end human minutes per clip (edit, check, post, submit)
    posts_per_clip: int = 1             # conservative: many campaigns restrict reposting one clip
    our_platforms: tuple[str, ...] = ("tiktok", "youtube", "instagram")
    clips_per_week: int = 15            # 30 clips over the 14-day experiment


@dataclass
class Evaluation:
    campaign_id: int
    marketplace: str
    name: str
    verdict: str                        # GO | BLOCKED | ENDED
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    expected_cents_per_post: float = 0.0
    expected_cents_per_hour: float = 0.0
    clips_to_min_withdrawal: float | None = None
    view_source: str = "prior"


def payout_for_views(views: int, cpm_cents: int, min_views: int, cap_cents: int | None) -> float:
    if views < min_views:
        return 0.0
    pay = views * cpm_cents / 1000
    return min(pay, cap_cents) if cap_cents is not None else pay


def view_distribution(conn: sqlite3.Connection) -> tuple[list[tuple[float, int]], str]:
    """Our own latest view count per post if we have enough posts, else the prior."""
    rows = conn.execute(
        """SELECT s.views FROM view_snapshots s
           JOIN (SELECT post_id, MAX(id) AS mid FROM view_snapshots GROUP BY post_id) l
             ON s.id = l.mid"""
    ).fetchall()
    if len(rows) >= MIN_OWN_POSTS:
        p = 1 / len(rows)
        return [(p, r["views"]) for r in rows], f"own data ({len(rows)} posts)"
    return DEFAULT_VIEW_PRIOR, f"placeholder prior (only {len(rows)} posts with views; need {MIN_OWN_POSTS})"


def evaluate(conn: sqlite3.Connection, a: Assumptions | None = None, today: date | None = None) -> list[Evaluation]:
    a = a or Assumptions()
    today = today or date.today()
    dist, source = view_distribution(conn)
    out: list[Evaluation] = []

    for c in conn.execute("SELECT * FROM campaigns WHERE status != 'rejected'"):
        ev = Evaluation(c["id"], c["marketplace"], c["name"], "GO", view_source=source)

        # Hard gates: any one of these blocks the campaign.
        if c["status"] == "ended" or (c["ends_on"] and c["ends_on"] < today.isoformat()):
            ev.verdict = "ENDED"
            ev.reasons.append("campaign has ended")
        if c["source_permission"] != "explicit":
            ev.verdict = "BLOCKED" if ev.verdict == "GO" else ev.verdict
            ev.reasons.append(f"source permission is '{c['source_permission']}', must be 'explicit'")
        allowed = {p.strip().lower() for p in c["platforms"].split(",") if p.strip()}
        overlap = allowed & set(a.our_platforms)
        if not overlap:
            ev.verdict = "BLOCKED" if ev.verdict == "GO" else ev.verdict
            ev.reasons.append(f"no overlap between campaign platforms {sorted(allowed)} and ours")
        if c["budget_remaining_cents"] is not None and c["budget_remaining_cents"] <= 0:
            ev.verdict = "BLOCKED" if ev.verdict == "GO" else ev.verdict
            ev.reasons.append("budget exhausted")

        # Warnings: do not block, but should be looked at.
        checked = date.fromisoformat(c["checked_on"][:10])
        if (today - checked).days > STALE_AFTER_DAYS:
            ev.warnings.append(f"terms last checked {c['checked_on'][:10]}; re-verify before posting")
        if c["budget_total_cents"] and c["budget_remaining_cents"] is not None:
            left = c["budget_remaining_cents"] / c["budget_total_cents"]
            if left < 0.2:
                ev.warnings.append(f"only {left:.0%} of budget left; it may run out before views are counted")

        per_post = sum(
            p * payout_for_views(v, c["cpm_cents"], c["min_views_per_post"], c["max_payout_per_post_cents"])
            for p, v in dist
        )
        posts = min(a.posts_per_clip, len(overlap)) if overlap else 0
        per_clip = per_post * posts
        ev.expected_cents_per_post = per_post
        ev.expected_cents_per_hour = per_clip * 60 / a.minutes_per_clip if a.minutes_per_clip else 0.0
        if c["min_withdrawal_cents"] and per_clip > 0:
            ev.clips_to_min_withdrawal = c["min_withdrawal_cents"] / per_clip
        out.append(ev)

    rank = {"GO": 0, "BLOCKED": 1, "ENDED": 2}
    out.sort(key=lambda e: (rank[e.verdict], -e.expected_cents_per_hour))
    return out
