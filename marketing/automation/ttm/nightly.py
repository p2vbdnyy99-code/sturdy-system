"""The founder's nightly email: the live dashboard's numbers as Gmail-safe
HTML (tables, coloured bars, one <style> block; Gmail shows no SVG and runs
no scripts), plus a plain-text version and a subject line. Kept compact,
because the founder's assistant pastes the HTML into Gmail every night.

Input: the JSON printed by whatsapp-doc-assistant/backend/scripts/insights-summary.mjs
(last 7 days, no contact details). Builds the email only; never sends.

    python3 -m ttm nightly-email --data summary.json --out email.html
"""
import datetime as dt
import html

DASHBOARD = "https://tendertez.in/insights"

# Tender-list freshness, the same rules as the site's
# whatsapp-doc-assistant/backend/src/bidpilot/discovery/freshness.js
# (test/bidpilot/freshness.test.js there checks these numbers match).
FRESH_HOURS = 2
STALE_HOURS = 24
UNAVAILABLE_DAYS = 7
FEED_LABELS = {"central": "Central", "state": "State", "gem": "GeM"}
FEED_RANK = {"fresh": 0, "delayed": 1, "stale": 2, "unavailable": 3}
KIND = {"signup": "signed up", "upload": "uploaded a tender", "analysed": "got an analysis", "failed": "analysis failed"}

STYLE = (
    "<style>"
    ".w{background:#06101f;padding:16px 8px;font-family:Arial,sans-serif;color:#e8eef7}"
    ".c{background:#0b1a2e;border:1px solid #16263d;border-radius:12px;padding:14px;margin:0 0 10px}"
    ".k{color:#d96f0c;font-size:11px;font-weight:700;letter-spacing:2px;margin:0}"
    ".h{font-size:22px;font-weight:800;margin:4px 0 12px}"
    ".t{font-size:15px;font-weight:700;margin:0 0 10px}"
    ".l{color:#a9b8cc;font-size:11px;font-weight:700;letter-spacing:1px;margin:0}"
    ".v{font-size:28px;font-weight:800;margin:4px 0 2px}"
    ".n{color:#8496b0;font-size:12px;margin:0}"
    ".r td{padding:4px 0;font-size:13px;color:#a9b8cc}.r b{color:#e8eef7}"
    ".b{height:8px;border-radius:4px;font-size:0;line-height:0}"
    ".g{color:#3fc93f;font-weight:700}.d{color:#e66767;font-weight:700}"
    "</style>"
)


def _e(s) -> str:
    return html.escape(str(s), quote=True)


def _day(iso: str) -> str:
    return dt.date.fromisoformat(iso).strftime("%-d %b")


def _delta(cur: int, prev: int) -> str:
    if cur == prev:
        return "no change"
    if prev == 0:
        return f'<span class="g">+{cur} new</span>'
    pct = round((cur - prev) / prev * 100)
    return f'<span class="{"g" if pct > 0 else "d"}">{"+" if pct > 0 else ""}{pct}%</span>'


def _bar(v: int, top: int, color: str) -> str:
    pct = max(2, round(100 * v / top)) if v > 0 and top > 0 else 0
    fill = f'<td width="{pct}%" class="b" bgcolor="{color}"></td>' if pct else ""
    return f'<table width="100%" cellspacing="0" bgcolor="#16263d" class="b"><tr>{fill}<td></td></tr></table>'


def _bars(rows, color: str) -> str:
    if not rows:
        return '<p class="n">Nothing yet.</p>'
    top = max(v for _, v in rows) or 1
    return "".join(f'<table width="100%" class="r"><tr><td>{_e(lbl)}</td><td align="right"><b>{v}</b></td></tr></table>'
                   f'{_bar(v, top, color)}' for lbl, v in rows)


def _card(title: str, body: str) -> str:
    return f'<div class="c"><p class="t">{_e(title)}</p>{body}</div>'


def _tile(label: str, today: int, week: int, prev: int) -> str:
    return (f'<td width="50%" valign="top"><div class="c"><p class="l">{_e(label.upper())}</p><p class="v">{today}</p>'
            f'<p class="n">today · {week} this week {_delta(week, prev)}</p></div></td>')


def _columns(series) -> str:
    top = max([row[1] for row in series] + [1])
    cols, days = [], []
    for day, v, *_ in series:
        h = max(3, round(100 * v / top)) if v > 0 else 0
        bar = f'<div style="height:{h}px;width:24px;margin:0 auto;background:#d96f0c;border-radius:4px 4px 0 0"></div>' if h else ""
        cols.append(f'<td valign="bottom" align="center" height="120"><b>{v}</b>{bar}</td>')
        days.append(f'<td align="center">{_e(_day(day))}</td>')
    return (f'<table width="100%" class="r" style="table-layout:fixed"><tr>{"".join(cols)}</tr>'
            f'<tr>{"".join(days)}</tr></table>')


def _parse(iso):
    if not iso:
        return None
    try:
        return dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def feed_status(src: dict, checked_at) -> str:
    """One list's status from the raw facts insights-summary.mjs prints."""
    if not src.get("enabled"):
        return "unavailable"
    last = _parse(src.get("lastSuccessAt"))
    if last is None:
        return "unavailable"
    hours = max(0.0, (checked_at - last).total_seconds() / 3600)
    if hours <= FRESH_HOURS:
        return "fresh"
    if hours <= STALE_HOURS:
        return "delayed"
    if hours <= UNAVAILABLE_DAYS * 24:
        return "stale"
    return "unavailable"


def feed_summary(d: dict, previous: dict | None = None) -> dict | None:
    """Each list's status tonight, and which got worse since the previous
    night's data (the alert) or recovered. Unchanged problems are listed but
    not alerted again. None when the data has no feed section."""
    feed = d.get("feed")
    if not feed:
        return None
    checked = _parse(feed.get("checkedAt")) or dt.datetime.now(dt.timezone.utc)
    prev_status = {}
    if previous and previous.get("feed"):
        pf = previous["feed"]
        pc = _parse(pf.get("checkedAt")) or checked
        prev_status = {s["list"]: feed_status(s, pc) for s in pf.get("sources", [])}
    rows, worse, recovered = [], [], []
    for s in feed.get("sources", []):
        st = feed_status(s, checked)
        before = prev_status.get(s["list"], "fresh")
        if FEED_RANK[st] > FEED_RANK[before]:
            worse.append(s["list"])
        elif st == "fresh" and before != "fresh":
            recovered.append(s["list"])
        rows.append({**s, "status": st})
    return {"rows": rows, "worse": worse, "recovered": recovered,
            "problem": [r for r in rows if r["status"] != "fresh"]}


def _feed_day(iso) -> str:
    when = _parse(iso)
    if when is None:
        return "never"
    return (when + dt.timedelta(hours=5, minutes=30)).strftime("%-d %b %Y")


def render(d: dict, previous: dict | None = None) -> dict:
    t, w, p, paid, f = d["today"], d["week"], d["previousWeek"], d["paid"], d["funnel"]
    date = _day(d["date"])
    subject = (f"TenderTez tonight ({date}): {t['visitors']} visitors, {t['signups']} sign-ups, "
               f"{t['uploads']} uploads, {t['analyses']} analyses, {paid['companies']} paying")
    feed = feed_summary(d, previous)
    if feed and feed["worse"]:
        names = ", ".join(FEED_LABELS.get(x, x) for x in feed["worse"])
        subject = f"Tender feed alert ({names}) · {subject}"
    hero = (f"₹{paid['monthlyListPrice']:,} a month at list price" if paid["companies"]
            else "No active paid plan yet. Your own accounts are not counted.")
    parts = [
        f'<p class="k">MISSION CONTROL</p><p class="h">TenderTez tonight · {_e(date)}</p>',
        f'<div class="c" style="border-color:#d96f0c"><p class="l">PAYING CUSTOMERS</p>'
        f'<p class="v" style="font-size:44px">{paid["companies"]}</p><p class="n">{_e(hero)}</p></div>',
        f'<table width="100%" cellspacing="6"><tr>{_tile("Visitors", t["visitors"], w["visitors"], p["visitors"])}'
        f'{_tile("Sign-ups", t["signups"], w["signups"], p["signups"])}</tr>'
        f'<tr>{_tile("Uploads", t["uploads"], w["uploads"], p["uploads"])}'
        f'{_tile("Analyses", t["analyses"], w["analyses"], p["analyses"])}</tr></table>',
    ]
    if feed:
        rows = "".join(
            f'<tr><td><b>{_e(FEED_LABELS.get(r["list"], r["list"]))}</b> {_e(r["status"])}'
            f'{" (NEW)" if r["list"] in feed["worse"] else ""}{" (recovered)" if r["list"] in feed["recovered"] else ""}</td>'
            f'<td align="right">last update {_e(_feed_day(r.get("lastSuccessAt")))}</td></tr>'
            for r in feed["rows"])
        err = next((r.get("lastError") for r in feed["problem"] if r.get("lastError")), None)
        note = (f'<p class="n">Latest error: {_e(err)}</p>' if err else "")
        colour = "#e66767" if feed["problem"] else "#16263d"
        parts.append(f'<div class="c" style="border-color:{colour}"><p class="t">Tender lists</p>'
                     f'<table width="100%" class="r">{rows}</table>{note}</div>')
    if w.get("waiting") or w.get("failed"):
        parts.append(f'<div class="c" style="border-color:#fab219;font-size:13px"><b>Activation gap:</b> {w.get("waiting", 0)} uploaded '
                     f'tender(s) waiting for Analyze and {w.get("failed", 0)} failed this week.</div>')
    parts.append(_card("Visitors per day (last 7 days)", _columns(d["series"])))
    funnel = [("Visitors (per day)", f["visitors"]), ("Opened sign-up", f["saw_signup"]), ("Signed up", f["signups"]),
              ("Uploaded a tender", f["uploaded"]), ("Got an analysis", f["analysed"]), ("Paying now", paid["companies"])]
    parts.append(_card("Funnel (7 days, your accounts left out)", _bars(funnel, "#d96f0c")))
    parts.append(_card("Where visitors came from", _bars(d.get("sources", []), "#1f8fd0")))
    if d.get("campaigns"):
        parts.append(_card("Campaigns", _bars(d["campaigns"], "#1f8fd0")))
    if d.get("stuck"):
        rows = "".join(f'<tr><td><b>{_e(n)}</b></td><td align="right">{na} not analysed{f", {fl} failed" if fl else ""}</td></tr>'
                       for n, na, fl in d["stuck"])
        parts.append(_card("Needs a nudge", f'<table width="100%" class="r">{rows}</table>'))
    if d.get("activity"):
        rows = "".join(f'<tr><td><b>{_e(c)}</b> {_e(KIND.get(k, k))}</td><td align="right">{_e(_day(at[:10]))}</td></tr>'
                       for k, c, at in d["activity"])
        parts.append(_card("Latest activity", f'<table width="100%" class="r">{rows}</table>'))
    parts.append(f'<p align="center"><a href="{DASHBOARD}" style="display:inline-block;padding:12px 22px;background:#d96f0c;'
                 f'color:#fff;border-radius:99px;font-weight:700;text-decoration:none">Open the live dashboard</a></p>'
                 f'<p class="n" align="center">Numbers from tendertez.in, India dates. Visits may include your own.</p>')
    body = f'{STYLE}<div class="w"><div style="max-width:600px;margin:0 auto">{"".join(parts)}</div></div>'
    text = "\n".join([
        f"TenderTez tonight ({date})",
        f"Paying customers: {paid['companies']}",
        f"Today: {t['visitors']} visitors, {t['signups']} sign-ups, {t['uploads']} uploads, {t['analyses']} analyses",
        f"This week: {w['visitors']} visitors, {w['signups']} sign-ups, {w['uploads']} uploads, {w['analyses']} analyses",
        f"Funnel (7 days): {f['visitors']} visitor-days > {f['saw_signup']} opened sign-up > {f['signups']} signed up > "
        f"{f['uploaded']} uploaded > {f['analysed']} analysed > {paid['companies']} paying",
        *([_feed_text(feed)] if feed else []),
        f"Live dashboard: {DASHBOARD}",
    ])
    return {"subject": subject, "text": text, "html": body}


def _feed_text(feed: dict) -> str:
    if not feed["problem"]:
        return "Tender lists: all fresh" + (f" (recovered: {', '.join(feed['recovered'])})" if feed["recovered"] else "")
    parts = [f"{FEED_LABELS.get(r['list'], r['list'])} {r['status']} since {_feed_day(r.get('lastSuccessAt'))}"
             + (" NEW" if r["list"] in feed["worse"] else "") for r in feed["problem"]]
    return "Tender lists: " + "; ".join(parts)


def previous_night(data_path: str, date: str | None) -> dict | None:
    """The previous night's saved JSON next to tonight's (N/<date-1>.json),
    for the tender-feed alert de-duplication; None when there is none."""
    import json
    from pathlib import Path
    if not date:
        return None
    try:
        prev = Path(data_path).with_name(f"{dt.date.fromisoformat(date) - dt.timedelta(days=1)}.json")
        return json.loads(prev.read_text(encoding="utf-8")) if prev.exists() else None
    except (ValueError, OSError):
        return None
