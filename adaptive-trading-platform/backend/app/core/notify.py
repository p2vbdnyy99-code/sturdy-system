"""Notifications with de-duplication. One (user, dedupe_key) is stored and
pushed at most once, enforced by a unique constraint."""
from __future__ import annotations

import logging

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Notification, PushToken, User

log = logging.getLogger("atp.notify")

KINDS = {
    "opportunity": "New trading opportunity", "trade_executed": "Trade executed",
    "stop_loss": "Stop-loss triggered", "take_profit": "Take-profit triggered",
    "position_closed": "Position closed", "daily_loss_limit": "Daily loss limit reached",
    "broker_disconnected": "Broker disconnected", "feed_disconnected": "Data feed disconnected",
    "strategy_disabled": "Strategy disabled", "unusual_volatility": "Unusual market volatility",
    "risk": "Risk control event", "live_mode": "Live trading status",
}

_listeners: list = []          # in-process subscribers (WebSocket hub)


def subscribe(fn) -> None:
    _listeners.append(fn)


def preferences(user: User) -> dict[str, bool]:
    saved = (user.settings or {}).get("notifications", {})
    return {k: bool(saved.get(k, True)) for k in KINDS}


def push_expo(tokens: list[str], title: str, body: str, data: dict) -> str:
    """Deliver through the Expo push service. Returns a status string; never raises."""
    if not tokens:
        return "no_device"
    try:
        r = httpx.post(get_settings().expo_push_url, timeout=5.0,
                       json=[{"to": t, "title": title, "body": body, "data": data, "sound": "default"} for t in tokens])
        return "sent" if r.status_code == 200 else f"error_{r.status_code}"
    except httpx.HTTPError as e:
        log.warning("push delivery failed: %s", type(e).__name__)
        return "error_network"


_pusher = push_expo


def set_pusher(fn) -> None:
    global _pusher
    _pusher = fn or push_expo


def notify(db: Session, user_id: int, kind: str, body: str, dedupe_key: str, data: dict | None = None,
           title: str | None = None) -> Notification | None:
    """Returns the stored notification, or None when it was a duplicate or the
    user has muted this kind."""
    user = db.get(User, user_id)
    if user is None or not preferences(user).get(kind, True):
        return None
    if db.query(Notification.id).filter_by(user_id=user_id, dedupe_key=dedupe_key).first():
        return None
    n = Notification(user_id=user_id, kind=kind, title=title or KINDS.get(kind, kind), body=body,
                     dedupe_key=dedupe_key, data=data or {})
    try:
        with db.begin_nested():
            db.add(n)
            db.flush()
    except IntegrityError:
        return None
    tokens = [t.token for t in db.query(PushToken).filter_by(user_id=user_id)]
    n.push_status = _pusher(tokens, n.title, n.body, {"kind": kind, **(data or {})})
    for fn in _listeners:
        try:
            fn(user_id, {"type": "notification", "kind": kind, "title": n.title, "body": n.body})
        except Exception:  # a broken listener must never break trading
            log.exception("notification listener failed")
    return n
