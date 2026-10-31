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


def render(d: dict) -> dict:
    t, w, p, paid, f = d["today"], d["week"], d["previousWeek"], d["paid"], d["funnel"]
    date = _day(d["date"])
    subject = (f"TenderTez tonight ({date}): {t['visitors']} visitors, {t['signups']} sign-ups, "
               f"{t['uploads']} uploads, {t['analyses']} analyses, {paid['companies']} paying")
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
        f"Live dashboard: {DASHBOARD}",
    ])
    return {"subject": subject, "text": text, "html": body}
