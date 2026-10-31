"""The daily tender post: one state, organisation or list from the public
tender search, with live counts and a few recently published tenders.

Reads only TenderTez's own public API (the same data as the public pages).
Prints JSON with label, linkedin, x and whatsapp texts; every link is a
direct https://tendertez.in link with standard UTMs, checked by links.py.
It never posts or sends anything.

    python3 -m ttm daily-post [--date YYYY-MM-DD] [--base https://tendertez.in]
"""
import datetime as dt
import json
import urllib.parse
import urllib.request

from . import links

UA = "TenderTezDailyPost/1.0 (+https://tendertez.in)"
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


class DailyPostError(RuntimeError):
    pass


def _get(base: str, path: str, params: dict | None = None, fetch_json=None):
    url = f"{base}{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    if fetch_json:
        return fetch_json(url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def pick_page(pages: list, day: dt.date) -> dict:
    """A different list each day: rotate through all landing pages by date."""
    if not pages:
        raise DailyPostError("no landing pages (the tender search returned none)")
    ordered = sorted(pages, key=lambda p: p["path"])
    return ordered[day.toordinal() % len(ordered)]


def _closes(iso: str | None) -> str:
    if not iso:
        return ""
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(IST).strftime("%-d %b")


def _short(title: str, n: int = 80) -> str:
    title = " ".join((title or "").split())
    return title if len(title) <= n else title[: n - 1].rstrip() + "…"


def build(base: str = links.CANONICAL_ORIGIN, day: dt.date | None = None, fetch_json=None) -> dict:
    day = day or dt.datetime.now(IST).date()
    pages = _get(base, "/bidpilot/public/tenders/landing", fetch_json=fetch_json)["pages"]
    page = pick_page(pages, day)
    q = {"kind": page["kind"], "state": page.get("state", ""), "organisation": page.get("organisation", "")}
    q = {k: v for k, v in q.items() if v}
    recent = _get(base, "/bidpilot/public/tenders", {**q, "status": "open", "sort": "newest", "limit": 4}, fetch_json)
    closing = _get(base, "/bidpilot/public/tenders", {**q, "status": "closing", "limit": 1}, fetch_json)
    open_n, closing_n, items = recent["total"], closing["total"], recent["tenders"]
    if not open_n or not items:
        raise DailyPostError(f"{page['label']}: no open tenders listed today")
    label = page["label"]
    what = "GeM bids" if page["kind"] == "gem" else f"{label} tenders"
    ident = "bid" if page["kind"] == "gem" else "ID"

    def link(source, medium):
        return links.build_url(page["path"], source=source, medium=medium, campaign="daily_tenders")

    lines = [f"• {_short(t['title'])} (closes {_closes(t['closingAt'])}"
             + (f", {ident} {t['tenderId']}" if t.get("tenderId") else "") + ")" for t in items]
    linkedin = "\n".join([
        f"{open_n:,} {what} are open right now, and {closing_n:,} close in the next 7 days.".replace(",", ","),
        "",
        "A few recently published:",
        *lines,
        "",
        "See the full list, closing soonest first, free and without signing up:",
        link("linkedin", "organic"),
        "",
        "When you find one worth bidding on, upload its PDF to TenderTez: it lists the eligibility conditions, "
        "documents, dates and EMD, each with its page number.",
        "",
        "Source: public tender lists of the Central Public Procurement Portal (CPPP). Not every tender in India is listed.",
    ])
    x = f"{closing_n:,} {what} close in the next 7 days ({open_n:,} open). Free list, closing soonest first: {link('x', 'organic')}"
    whatsapp = "\n".join([
        f"*{label}: {closing_n:,} tenders close in the next 7 days* ({open_n:,} open).",
        "",
        *[f"• {_short(t['title'], 70)} – closes {_closes(t['closingAt'])}" for t in items[:3]],
        "",
        f"Free list: {link('whatsapp', 'message')}",
        "(Source: CPPP public lists)",
    ])
    out = {"date": day.isoformat(), "label": label, "page": page["path"], "open": open_n, "closing_7d": closing_n,
           "sources": [links.build_url(page["path"])],  # the counts are this public page's own list
           "linkedin": linkedin, "x": x, "whatsapp": whatsapp}
    for key in ("linkedin", "x", "whatsapp"):
        check = links.check_text(out[key], require_link=True)
        if not check["ok"]:
            raise DailyPostError(f"{key} links failed the link policy: {check['errors']}")
    return out
