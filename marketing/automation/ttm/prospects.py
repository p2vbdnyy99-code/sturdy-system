"""The prospect CRM: verified businesses with evidence of tender activity,
scored by evidence, moved through the funnel, with duplicate detection and
opt-outs. Nothing is guessed: a contact must come with the public page it
was found on, and evidence must come with its source URL."""
import datetime as dt
import re
from urllib.parse import urlparse

from . import store
from .safety import guard

CATEGORIES = [
    "tender_consultant", "procurement_consultant", "civil_contractor", "electrical_contractor",
    "mechanical_contractor", "gem_seller", "medical_supplier", "it_supplier", "pharma_supplier", "msme_supplier",
]

# The funnel, in order. lost and opted_out end it.
STAGES = ["identified", "verified", "drafted", "approved", "contacted", "replied", "demo", "activated", "paid"]
END_STAGES = ["lost", "opted_out"]

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)
PHONE_RE = re.compile(r"^\+?[0-9][0-9 \-]{6,18}$")


class ProspectError(ValueError):
    pass


def _domain(url: str) -> str:
    if not url:
        return ""
    host = urlparse(url if "://" in url else f"https://{url}").hostname or ""
    return host.lower().removeprefix("www.")


def _name_key(name: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "", name.lower())
    return re.sub(r"(pvtltd|privatelimited|llp|ltd|limited|inc|co)$", "", key)


def _is_url(u: str) -> bool:
    p = urlparse(u or "")
    return p.scheme in ("http", "https") and bool(p.netloc)


def score(prospect: dict, rules: dict) -> tuple[int, str, str]:
    """Score 0-100 from the evidence signals the researcher recorded."""
    total, reasons = 0, []
    for sig in prospect.get("signals", []):
        pts = rules["signals"].get(sig)
        if pts:
            total += pts
            reasons.append(f"{sig} +{pts}")
    bonus = rules["category_bonus"].get(prospect.get("category"), 0)
    if bonus:
        total += bonus
        reasons.append(f"category {prospect.get('category')} +{bonus}")
    if prospect.get("public_contact"):
        total += rules["public_contact_bonus"]
        reasons.append(f"public business contact +{rules['public_contact_bonus']}")
    total = min(total, 100)
    tier = "A" if total >= rules["tiers"]["A"] else "B" if total >= rules["tiers"]["B"] else "C"
    return total, tier, "; ".join(reasons) or "no evidence signals recorded"


def validate(p: dict) -> dict:
    p = {k: (v.strip() if isinstance(v, str) else v) for k, v in p.items()}
    for field in ("company", "source_url", "evidence", "category"):
        if not p.get(field):
            raise ProspectError(f"{field} is required (record only what you verified).")
    if p["category"] not in CATEGORIES:
        raise ProspectError(f"category must be one of: {', '.join(CATEGORIES)}")
    if not _is_url(p["source_url"]):
        raise ProspectError("source_url must be the http(s) page where the evidence was found.")
    if p.get("website") and not _is_url(p["website"]):
        raise ProspectError("website must be an http(s) URL, or left empty.")
    contact = p.get("public_contact") or ""
    if contact:
        if not (EMAIL_RE.match(contact) or PHONE_RE.match(contact) or _is_url(contact)):
            raise ProspectError("public_contact must be a published business email, phone or contact-page URL.")
        if not _is_url(p.get("contact_source_url") or ""):
            raise ProspectError("contact_source_url is required with a contact: the public page it is published on.")
    p["signals"] = [s for s in (p.get("signals") or []) if isinstance(s, str)]
    return p


def find_duplicate(records: list, p: dict):
    dom, key = _domain(p.get("website", "")), _name_key(p["company"])
    contact = (p.get("public_contact") or "").lower()
    for r in records:
        if dom and _domain(r.get("website", "")) == dom:
            return r
        if key and _name_key(r["company"]) == key:
            return r
        if contact and (r.get("public_contact") or "").lower() == contact:
            return r
    return None


# Stages a business contacted outside the CRM can be imported at (with its history).
IMPORT_STAGES = ["contacted", "replied", "demo", "activated", "paid"]


def save_prospect(data: dict, rules: dict, import_stage: str = "") -> dict:
    """Save a verified prospect. import_stage brings in a business already
    contacted outside the CRM (e.g. the founder's Gmail) at the stage it really
    reached; it needs last_contact_date and a note saying what happened."""
    guard("save_prospect")
    p = validate(data)
    if import_stage:
        if import_stage not in IMPORT_STAGES:
            raise ProspectError(f"import_stage must be one of: {', '.join(IMPORT_STAGES)}")
        if not p.get("last_contact_date") or not p.get("import_note"):
            raise ProspectError("An import needs last_contact_date and import_note (what happened, from which record).")
    with store.locked("prospects"):
        records = store.load("prospects")
        dup = find_duplicate(records, p)
        if dup:
            raise ProspectError(f"Duplicate of {dup['id']} ({dup['company']}).")
        if is_suppressed(p):
            raise ProspectError("This business has opted out; it can't be added again.")
        prior = prior_contact_for(p)
        if prior and not import_stage:
            raise ProspectError(f"Already contacted ({prior['contact'] or prior['domain']}, {prior['date'] or 'date unknown'}, "
                                f"{prior['source'] or 'outside the CRM'}); don't send a second first message.")
        pts, tier, why = score(p, rules)
        rec = {
            "id": store.new_id("pr"),
            "company": p["company"], "website": p.get("website", ""), "category": p["category"],
            "location": p.get("location", ""),
            "public_contact": p.get("public_contact", ""), "contact_source_url": p.get("contact_source_url", ""),
            "source_url": p["source_url"], "evidence": p["evidence"], "signals": p["signals"],
            "use_case": p.get("use_case", ""), "lead_score": pts, "tier": tier, "score_reason": why,
            "suggested_first_message": p.get("suggested_first_message", ""),
            "channel_source": p.get("channel_source", "research"),
            "stage": import_stage or ("verified" if p.get("verified") else "identified"),
            "next_action": p.get("next_action", "Verify the evidence page and draft a first message."),
            "next_action_date": p.get("next_action_date", dt.date.today().isoformat()),
            "last_contact_date": p.get("last_contact_date", "") if import_stage else "",
            "response_status": p.get("response_status", "") if import_stage else "", "opt_out": False,
            "follow_ups": int(p.get("follow_ups", 0) or 0) if import_stage else 0,
            "history": [{"at": store.now_iso(), "event": "saved"}] + (
                [{"at": store.now_iso(), "event": f"imported_at_{import_stage}", "note": p["import_note"]}] if import_stage else []),
            "created_at": store.now_iso(),
        }
        records.append(rec)
        store.save("prospects", records)
    store.log_event("prospect_saved", prospect=rec["id"], tier=tier, score=pts, source=rec["channel_source"],
                    imported_stage=import_stage or None)
    return rec


def list_prospects(query: str = "", stage: str = "", tier: str = "") -> list:
    q = query.lower()
    out = []
    for r in store.load("prospects"):
        if stage and r["stage"] != stage:
            continue
        if tier and r["tier"] != tier:
            continue
        hay = " ".join(str(r.get(k, "")) for k in ("company", "website", "category", "location", "evidence", "use_case")).lower()
        if q and q not in hay:
            continue
        out.append(r)
    return sorted(out, key=lambda r: (-r["lead_score"], r["company"]))


def get_prospect(pid: str) -> dict:
    for r in store.load("prospects"):
        if r["id"] == pid:
            return r
    raise ProspectError(f"No prospect {pid}.")


# Which stage each action needs, and where it moves the prospect.
TRANSITIONS = {
    "verify": ({"identified"}, "verified"),
    "draft": ({"verified", "drafted", "contacted"}, "drafted"),
    "approve": ({"drafted"}, "approved"),
    "contacted": ({"approved"}, "contacted"),
    "followed_up": ({"contacted"}, "contacted"),
    "reply": ({"contacted"}, "replied"),
    "demo": ({"replied", "contacted"}, "demo"),
    "activated": ({"demo", "replied", "contacted"}, "activated"),
    "paid": ({"activated", "demo"}, "paid"),
    "lost": (set(STAGES), "lost"),
}


# The next step after each action ('contacted' and 'followed_up' set their own dates).
NEXT_ACTION = {
    "verify": "Draft a first message from the evidence.",
    "draft": "Founder reviews and approves the draft (nothing is sent before that).",
    "approve": "Founder sends the approved message by hand, then records 'contacted'.",
    "reply": "Answer the reply; offer a short demo or help with the first tender.",
    "demo": "Check they analysed a real tender; help with anything it missed.",
    "activated": "Ask whether a monthly plan fits their tender volume.",
    "paid": "Thank them; ask what would make it more useful.",
    "lost": "None.",
}


def update_stage(pid: str, action: str, note: str = "", **fields) -> dict:
    """Move a prospect through the funnel. 'contacted' needs an approved draft;
    an opted-out prospect can't move at all."""
    guard(f"prospect:{action}")
    if action == "opt_out":
        return opt_out(pid, note)
    if action not in TRANSITIONS:
        raise ProspectError(f"Unknown action {action}. Use: {', '.join(list(TRANSITIONS) + ['opt_out'])}")
    allowed, target = TRANSITIONS[action]
    with store.locked("prospects"):
        records = store.load("prospects")
        rec = next((r for r in records if r["id"] == pid), None)
        if not rec:
            raise ProspectError(f"No prospect {pid}.")
        if rec["opt_out"]:
            raise ProspectError(f"{rec['company']} opted out; nothing more can be done.")
        if rec["stage"] not in allowed:
            raise ProspectError(f"Can't '{action}' from stage '{rec['stage']}' (needs {', '.join(sorted(allowed))}).")
        if action == "draft":
            if not fields.get("message"):
                raise ProspectError("A draft needs the message text.")
            rec["draft_message"] = fields["message"]
            rec["draft_channel"] = fields.get("channel", "email")
        if action == "approve":
            rec["approved_by"] = fields.get("approved_by", "founder")
        if action == "contacted":
            today = dt.date.today()
            rec["last_contact_date"] = today.isoformat()
            rec["follow_ups"] = rec.get("follow_ups", 0)
            rec["next_action"] = "Follow up if there is no reply."
            rec["next_action_date"] = (today + dt.timedelta(days=int(fields.get("follow_up_days", 5)))).isoformat()
        if action == "followed_up":
            rec["follow_ups"] = rec.get("follow_ups", 0) + 1
            rec["last_contact_date"] = dt.date.today().isoformat()
            rec["next_action"] = "No more follow-ups; wait for a reply."
            rec["next_action_date"] = ""
        if action == "reply":
            rec["response_status"] = fields.get("sentiment", "neutral")
        if action == "paid":
            rec["revenue_inr"] = float(fields.get("amount_inr", 0) or 0)
            rec["plan"] = fields.get("plan", "")
        if action in NEXT_ACTION:
            rec["next_action"] = NEXT_ACTION[action]
            rec["next_action_date"] = dt.date.today().isoformat() if action != "lost" else ""
        rec["stage"] = target
        rec["history"].append({"at": store.now_iso(), "event": action, "note": note, **{k: v for k, v in fields.items() if k != "message"}})
        store.save("prospects", records)
    store.log_event(f"prospect_{action}", prospect=pid, channel=fields.get("channel") or rec.get("draft_channel"),
                    source=rec.get("channel_source"), amount_inr=fields.get("amount_inr"), sentiment=fields.get("sentiment"))
    return rec


def opt_out(pid: str, note: str = "") -> dict:
    with store.locked("prospects"):
        records = store.load("prospects")
        rec = next((r for r in records if r["id"] == pid), None)
        if not rec:
            raise ProspectError(f"No prospect {pid}.")
        rec["opt_out"], rec["stage"] = True, "opted_out"
        rec["next_action"], rec["next_action_date"] = "Never contact again.", ""
        rec["history"].append({"at": store.now_iso(), "event": "opt_out", "note": note})
        store.save("prospects", records)
    with store.locked("suppression"):
        sup = store.load("suppression")
        sup.append({"company": rec["company"], "domain": _domain(rec.get("website", "")),
                    "contact": (rec.get("public_contact") or "").lower(), "at": store.now_iso()})
        store.save("suppression", sup)
    store.log_event("prospect_opt_out", prospect=pid)
    return rec


FREE_MAIL = {"gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "rediffmail.com", "icloud.com"}


def add_prior_contact(contact: str, company: str = "", date: str = "", source: str = "", aliases: list | None = None) -> dict:
    """Record a business the founder already contacted outside this CRM (for
    example from the Gmail sent folder), so it is never sent a second first
    message. aliases are other names or domains of the same business."""
    guard("add_prior_contact")
    contact = contact.strip().lower()
    if not (EMAIL_RE.match(contact) or _is_url(contact) or "." in contact):
        raise ProspectError("contact must be the email address or domain that was contacted.")
    dom = contact.split("@", 1)[1] if "@" in contact else _domain(contact)
    entry = {"contact": contact if "@" in contact else "", "domain": "" if dom in FREE_MAIL else dom,
             "company": company, "aliases": [a.strip() for a in (aliases or []) if a.strip()],
             "date": date, "source": source, "at": store.now_iso()}
    with store.locked("prior_contacts"):
        rows = store.load("prior_contacts")
        if any(r["contact"] == entry["contact"] and r["domain"] == entry["domain"] for r in rows):
            raise ProspectError(f"{contact} is already in the contacted-before list.")
        rows.append(entry)
        store.save("prior_contacts", rows)
    store.log_event("prior_contact_added", domain=entry["domain"], source=source)
    return entry


def prior_contact_for(p: dict):
    """The contacted-before entry matching this prospect's website, contact or name, if any."""
    dom, key = _domain(p.get("website", "")), _name_key(p.get("company", ""))
    contact = (p.get("public_contact") or "").lower()
    cdom = contact.split("@", 1)[1] if "@" in contact else ""
    for r in store.load("prior_contacts"):
        doms = {r["domain"]} | {_domain(a) for a in r["aliases"] if "." in a}
        names = {_name_key(r["company"])} | {_name_key(a) for a in r["aliases"] if "." not in a}
        doms.discard(""); names.discard("")
        if (dom and dom in doms) or (cdom and cdom in doms) or (contact and contact == r["contact"]) or (key and key in names):
            return r
    return None


def is_suppressed(p: dict) -> bool:
    dom, key = _domain(p.get("website", "")), _name_key(p.get("company", ""))
    contact = (p.get("public_contact") or "").lower()
    for s in store.load("suppression"):
        if (dom and s.get("domain") == dom) or (contact and s.get("contact") == contact) or _name_key(s.get("company", "")) == key:
            return True
    return False


def due_follow_ups(today: dt.date | None = None, max_follow_ups: int = 1) -> list:
    today = today or dt.date.today()
    out = []
    for r in store.load("prospects"):
        if r["opt_out"] or r["stage"] != "contacted" or not r.get("next_action_date"):
            continue
        if r.get("follow_ups", 0) >= max_follow_ups:
            continue
        if dt.date.fromisoformat(r["next_action_date"]) <= today:
            out.append(r)
    return out


LEAD_COLUMNS = ["Company", "Website", "Business category", "Location", "Public business contact", "Contact source URL",
                "Evidence of tender activity", "Evidence source URL", "Likely use case", "Lead score", "Reason for score",
                "Suggested first message", "Stage", "Last contact date", "Response status", "Next action", "Next action date",
                "Opt-out status", "Source"]


def lead_rows() -> list:
    """The CRM as rows in LEAD_COLUMNS order (for leads CSV exports)."""
    out = []
    for r in list_prospects():
        out.append([r["company"], r.get("website", ""), r["category"], r.get("location", ""), r.get("public_contact", ""),
                    r.get("contact_source_url", ""), r["evidence"], r["source_url"], r.get("use_case", ""), r["lead_score"],
                    r["score_reason"], r.get("draft_message") or r.get("suggested_first_message", ""), r["stage"],
                    r.get("last_contact_date", ""), r.get("response_status", ""), r.get("next_action", ""),
                    r.get("next_action_date", ""), "yes" if r["opt_out"] else "no", r.get("channel_source", "")])
    return out
