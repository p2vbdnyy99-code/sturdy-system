"""SQLite storage. All money is stored as integer cents to avoid float drift."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

DEFAULT_DB = Path(os.environ.get("CLIPFORGE_DB", Path.home() / "clipforge" / "clipforge.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS campaigns (
    id                      INTEGER PRIMARY KEY,
    marketplace             TEXT NOT NULL,            -- ssemble | vyro | content_rewards | other
    name                    TEXT NOT NULL,
    url                     TEXT,
    cpm_cents               INTEGER NOT NULL,         -- pay per 1,000 eligible views, in cents
    budget_total_cents      INTEGER,
    budget_remaining_cents  INTEGER,
    min_views_per_post      INTEGER NOT NULL DEFAULT 0,   -- post earns nothing below this
    max_payout_per_post_cents INTEGER,                -- NULL = no per-post cap
    platforms               TEXT NOT NULL,            -- comma list: tiktok,youtube,instagram,x
    source_permission       TEXT NOT NULL DEFAULT 'unclear',  -- explicit | unclear | none
    min_withdrawal_cents    INTEGER NOT NULL DEFAULT 0,
    payout_terms            TEXT,
    rules                   TEXT,
    status                  TEXT NOT NULL DEFAULT 'candidate', -- candidate | active | paused | ended | rejected
    ends_on                 TEXT,                     -- ISO date
    checked_on              TEXT NOT NULL DEFAULT (date('now')),  -- when terms were last verified
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (marketplace, name)
);

CREATE TABLE IF NOT EXISTS clips (
    id            INTEGER PRIMARY KEY,
    campaign_id   INTEGER NOT NULL REFERENCES campaigns(id),
    title         TEXT NOT NULL,
    source_url    TEXT,
    file_path     TEXT,
    quality_score REAL,                               -- 0-100, from the quality gate (Phase 3+)
    status        TEXT NOT NULL DEFAULT 'draft',      -- draft | approved | rejected | published
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
    id           INTEGER PRIMARY KEY,
    clip_id      INTEGER NOT NULL REFERENCES clips(id),
    platform     TEXT NOT NULL,
    account      TEXT NOT NULL,
    url          TEXT NOT NULL UNIQUE,
    posted_on    TEXT NOT NULL DEFAULT (date('now')),
    submitted    INTEGER NOT NULL DEFAULT 0           -- 1 once submitted to the campaign
);

-- Cumulative view counts over time; the latest snapshot per post is authoritative.
CREATE TABLE IF NOT EXISTS view_snapshots (
    id             INTEGER PRIMARY KEY,
    post_id        INTEGER NOT NULL REFERENCES posts(id),
    taken_on       TEXT NOT NULL DEFAULT (date('now')),
    views          INTEGER NOT NULL,
    approved_views INTEGER                            -- as reported by the marketplace, if known
);

-- Money actually received. Only this counts toward "verified earnings".
CREATE TABLE IF NOT EXISTS payouts (
    id           INTEGER PRIMARY KEY,
    campaign_id  INTEGER REFERENCES campaigns(id),
    amount_cents INTEGER NOT NULL,
    received_on  TEXT NOT NULL,
    reference    TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY,
    amount_cents INTEGER NOT NULL,
    spent_on     TEXT NOT NULL,
    description  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_log (
    id           INTEGER PRIMARY KEY,
    campaign_id  INTEGER REFERENCES campaigns(id),    -- NULL = general/system-building time
    minutes      INTEGER NOT NULL,
    worked_on    TEXT NOT NULL DEFAULT (date('now')),
    activity     TEXT NOT NULL                        -- e.g. clipping, posting, building, admin
);
"""


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    path = Path(path) if path else DEFAULT_DB
    if str(path) != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def to_cents(dollars: str | float | None) -> int | None:
    if dollars is None or str(dollars).strip() == "":
        return None
    return int(round(float(str(dollars).replace("$", "").replace(",", "")) * 100))


def fmt_money(cents: int | float | None) -> str:
    if cents is None:
        return "-"
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) / 100:,.2f}"
