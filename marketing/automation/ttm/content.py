"""The content queue: one educational topic adapted per platform, checked
for claims we can't back, approved by the founder, then published by hand
(or by an authorised integration later) and recorded with its URL.

The checker is deliberately strict: a draft that promises accuracy, uses a
testimonial, or states a number without a source can't be queued."""
import re
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse

from . import store
from .safety import guard

PLATFORMS = {
    # name: (max characters, max hashtags)
    "linkedin": (3000, 3),
    "x": (280, 2),
    "x_thread": (280 * 8, 2),
    "facebook": (2000, 3),
    "reddit": (10000, 0),
    "whatsapp": (1000, 0),
    "email": (2500, 0),
    "blog_outline": (8000, 0),
    "video_script": (4000, 0),
    "faq": (1500, 0),
}

# Claims TenderTez can't make (see CLAUDE.md: no fake evidence, no promise of
# a feature or result the product doesn't deliver).
BANNED = [
    (r"(?<!bank )(?<!performance )\bguarantee[sd]?\b", "no guarantees of results"),  # "bank guarantee" is a tender term
    (r"\b100\s?%\s?(accurate|accuracy|correct)", "no accuracy promise"),
    (r"\bnever miss\b", "'never miss' is a promise we can't keep"),
    (r"\b(win|winning) (every|more) (bid|tender)s?\b", "no promise of winning bids"),
    (r"\bbid\s?/\s?no[- ]bid (verdict|decision|recommendation)\b", "TenderTez gives no bid/no-bid verdict"),
    (r"\b(#1|number one|best in india|india'?s (best|leading))\b", "no superlatives we can't prove"),
    (r"\b(testimonial|our customers say|trusted by \d+)", "no testimonials or customer counts unless real and approved"),
    (r"\bsaves? \d+\s?(hours|days|%)", "time-saving figures need a measured source"),
]
NUMBER_CLAIM = re.compile(r"\b\d+(\.\d+)?\s?(%|percent|crore|lakh|days|hours|minutes|times)\b|\brule\s\d+|\bsection\s\d+", re.I)
URL_RE = re.compile(r"https?://\S+")


class ContentError(ValueError):
    pass


def x_length(text: str) -> int:
    """X counts every link as 23 characters."""
    return len(URL_RE.sub("x" * 23, text))


def lint(text: str, platform: str, sources: list) -> dict:
    if platform not in PLATFORMS:
        raise ContentError(f"platform must be one of {', '.join(PLATFORMS)}")
    errors, warnings = [], []
    limit, max_tags = PLATFORMS[platform]
    length = x_length(text) if platform == "x" else len(text)
    if length > limit:
        errors.append(f"{length} characters; {platform} allows {limit}.")
    if not text.strip():
        errors.append("empty draft")
    for pattern, why in BANNED:
        if re.search(pattern, text, re.I):
            errors.append(f"claim not allowed: {why}")
    tags = re.findall(r"(?<!\w)#\w+", text)
    if len(tags) > max_tags:
        errors.append(f"{len(tags)} hashtags; at most {max_tags} on {platform}.")
    if NUMBER_CLAIM.search(text) and not sources:
        errors.append("states a number or rule without a source URL: add the source or remove the number.")
    for s in sources:
        if urlparse(s).scheme not in ("http", "https"):
            errors.append(f"source is not a URL: {s}")
    if platform == "reddit" and "tendertez" in text.lower():
        warnings.append("Reddit: most communities ban self-promotion; read the rules and lead with help, not the product.")
    if platform == "whatsapp" and URL_RE.search(text) is None:
        warnings.append("WhatsApp: no link, so readers can't find the tool.")
    return {"ok": not errors, "errors": errors, "warnings": warnings, "length": length}


def with_utm(url: str, source: str, campaign: str, content: str = "") -> str:
    """Adds utm_source/utm_campaign (and utm_content) to tendertez.in links only."""
    p = urlparse(url)
    if not (p.hostname or "").endswith("tendertez.in"):
        return url
    q = dict(parse_qsl(p.query))
    q.update({"utm_source": source, "utm_campaign": campaign})
    if content:
        q["utm_content"] = content
    return urlunparse(p._replace(query=urlencode(q)))


def slug(text: str, limit: int = 24) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:limit].rstrip("_") or "general"


SITE_LINK = re.compile(r"https?://(?:www\.)?tendertez\.in[^\s)\]>\"']*")


def tag_links(text: str, platform: str, campaign: str) -> str:
    """Tags tendertez.in links that carry no utm_source yet. The site stores
    only utm_source (page_views.campaign, max 40 chars), so it carries both the
    channel and the campaign: utm_source=linkedin.emd_exemption."""
    source = f"{platform.split('_')[0]}.{campaign}"[:40]

    def repl(m):
        url = m.group(0).rstrip(".,;:")
        tail = m.group(0)[len(url):]
        if "utm_source=" in url:
            return m.group(0)
        return with_utm(url, source, campaign) + tail
    return SITE_LINK.sub(repl, text)


def add_draft(*, platform: str, text: str, topic: str, audience: str, purpose: str, cta: str = "",
              sources: list | None = None, kpi: str = "", scheduled_for: str = "", topic_id: str = "",
              campaign: str = "") -> dict:
    guard("add_draft")
    sources = sources or []
    campaign = slug(campaign or topic)
    text = tag_links(text, platform, campaign)
    check = lint(text, platform, sources)
    if not check["ok"]:
        raise ContentError("; ".join(check["errors"]))
    for field, value in (("topic", topic), ("audience", audience), ("purpose", purpose)):
        if not value:
            raise ContentError(f"{field} is required: every post needs a specific audience and purpose.")
    rec = {
        "id": store.new_id("ct"), "topic_id": topic_id, "topic": topic, "platform": platform, "audience": audience,
        "purpose": purpose, "text": text, "cta": cta, "sources": sources, "kpi": kpi, "campaign": campaign,
        "scheduled_for": scheduled_for, "status": "draft", "warnings": check["warnings"],
        "approved_by": "", "published_url": "", "metrics": {}, "created_at": store.now_iso(),
    }
    with store.locked("content"):
        items = store.load("content")
        if any(i["platform"] == platform and i["text"].strip() == text.strip() for i in items):
            raise ContentError("The same text is already in the queue for this platform.")
        items.append(rec)
        store.save("content", items)
    store.log_event("content_drafted", content=rec["id"], platform=platform, topic=topic)
    return rec


def queue(status: str = "", platform: str = "") -> list:
    items = [i for i in store.load("content") if (not status or i["status"] == status) and (not platform or i["platform"] == platform)]
    return sorted(items, key=lambda i: (i.get("scheduled_for") or "9999", i["created_at"]))


def _update(cid: str, fn) -> dict:
    with store.locked("content"):
        items = store.load("content")
        item = next((i for i in items if i["id"] == cid), None)
        if not item:
            raise ContentError(f"No content {cid}.")
        fn(item)
        store.save("content", items)
    return item


def approve(cid: str, approved_by: str = "founder") -> dict:
    guard("approve_content")

    def do(i):
        if i["status"] != "draft":
            raise ContentError(f"Only drafts can be approved ({cid} is {i['status']}).")
        check = lint(i["text"], i["platform"], i["sources"])
        if not check["ok"]:
            raise ContentError("; ".join(check["errors"]))
        i["status"], i["approved_by"], i["approved_at"] = "approved", approved_by, store.now_iso()
    item = _update(cid, do)
    store.log_event("content_approved", content=cid, by=approved_by)
    return item


def reject(cid: str, reason: str) -> dict:
    guard("reject_content")
    item = _update(cid, lambda i: i.update(status="rejected", rejected_reason=reason))
    store.log_event("content_rejected", content=cid, reason=reason)
    return item


def mark_published(cid: str, url: str) -> dict:
    guard("mark_published")

    def do(i):
        if i["status"] != "approved":
            raise ContentError("Only approved content can be marked published.")
        if urlparse(url).scheme not in ("http", "https"):
            raise ContentError("url must be the live post's link.")
        i["status"], i["published_url"], i["published_at"] = "published", url, store.now_iso()
    item = _update(cid, do)
    store.log_event("content_published", content=cid, platform=item["platform"], url=url)
    return item


def record_metrics(cid: str, **metrics) -> dict:
    """Engagement copied from the platform (impressions, reactions, comments,
    clicks, enquiries). Only what the platform actually showed."""
    guard("record_metrics")
    clean = {k: int(v) for k, v in metrics.items() if v is not None and str(v).lstrip("-").isdigit()}
    item = _update(cid, lambda i: i["metrics"].update(clean))
    store.log_event("content_metrics", content=cid, platform=item["platform"], **clean)
    return item


def adapt_topic(topic: dict) -> dict:
    """Turns one topic into first drafts per platform, using only the topic's
    own points, source and link (the writing is then improved by hand or by
    /content-batch). Returns {platform: text}; nothing is queued."""
    title, points = topic["title"], topic["points"]
    link = topic.get("link", "https://tendertez.in/")
    campaign = slug(topic.get("campaign") or title)
    src = topic.get("source", "")
    src_line = f"Source: {src}" if src else ""
    bullets = "\n".join(f"• {p}" for p in points)
    cta = topic.get("cta", "Check a tender of your own")
    drafts = {
        "linkedin": "\n\n".join(x for x in [topic["hook"], bullets, topic.get("takeaway", ""), src_line, f"{cta}: {link}"] if x),
        "x": f"{topic['hook']} {link}",
        "x_thread": "\n\n".join([f"1/ {topic['hook']}"] + [f"{n}/ {p}" for n, p in enumerate(points, 2)]
                                + [f"{len(points) + 2}/ {src_line or title} {link}"]),
        "facebook": "\n\n".join(x for x in [topic["hook"], bullets, src_line] if x),
        "whatsapp": "\n".join(x for x in [f"*{title}*", bullets, src_line, link] if x),
        "email": "\n\n".join(x for x in [title, topic["hook"], bullets, src_line, link] if x),
        "blog_outline": "\n".join([f"# {title}", "", f"Problem: {topic['hook']}", "", "## Points", bullets, "", f"## Source\n{src}" if src else ""]),
        "video_script": "\n".join([f"[0-5s] {topic['hook']}"] + [f"[{5 + 10 * n}-{15 + 10 * n}s] {p}" for n, p in enumerate(points)]
                                  + [f"[end] {cta} at tendertez.in"]),
        "faq": f"Q: {title}?\nA: " + " ".join(points) + (f" ({src})" if src else ""),
    }
    return {platform: tag_links(text, platform, campaign) for platform, text in drafts.items()}
