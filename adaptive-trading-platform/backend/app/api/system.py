from __future__ import annotations

import asyncio
import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import __version__, runner
from ..core import notify as notify_mod
from ..core.sessions import DEFAULT_SESSIONS, DST_ANCHORED_SESSIONS, session_from_dict, session_to_dict
from ..core.trading import user_sessions
from ..db import SessionLocal, get_db, utcnow
from ..models import Account, Notification, PushToken, SystemLog, User
from ..security import audit, current_user, require_role, user_from_token

router = APIRouter(tags=["system"])
log = logging.getLogger("atp.ws")


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("select 1"))
        ok = True
    except Exception:
        ok = False
    return {"status": "ok" if ok else "degraded", "database": ok, "version": __version__, "time": utcnow()}


# -------------------------------------------------------------------------- settings
class SessionIn(BaseModel):
    key: str = Field(pattern="^(asia|london|newyork)$")
    name: str
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    tz: str = "Asia/Kolkata"


class SettingsPatch(BaseModel):
    jurisdiction: str | None = Field(default=None, pattern="^[A-Za-z]{2}$")
    confirm_residency: bool = False
    sessions: list[SessionIn] | None = None
    session_preset: str | None = Field(default=None, pattern="^(ist_fixed|dst_anchored)$")
    notifications: dict[str, bool] | None = None


def settings_out(user: User) -> dict:
    return {"jurisdiction": user.jurisdiction, "residency_declared": user.residency_declared_at is not None,
            "display_timezone": "Asia/Kolkata", "sessions": [session_to_dict(s, utcnow()) for s in
                                                              user_sessions(user.settings).values()],
            "notifications": notify_mod.preferences(user), "notification_kinds": notify_mod.KINDS,
            "email": user.email, "role": user.role}


@router.get("/settings")
def get_settings_(user: User = Depends(current_user)):
    return settings_out(user)


@router.patch("/settings")
def patch_settings(body: SettingsPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = dict(user.settings or {})
    if body.jurisdiction:
        if not body.confirm_residency:
            raise HTTPException(422, "Set confirm_residency=true to declare your country of residence. "
                                     "A false declaration does not make a transaction lawful.")
        if body.jurisdiction.upper() != user.jurisdiction:
            # changing residence invalidates live activation everywhere
            from ..core import live_gate
            for a in db.query(Account).filter_by(user_id=user.id, mode="live"):
                live_gate.disable(db, a, "jurisdiction changed")
        audit(db, "admin", "residency_declared", user.id, level="warn", previous=user.jurisdiction,
              declared=body.jurisdiction.upper())
        user.jurisdiction, user.residency_declared_at = body.jurisdiction.upper(), utcnow()
    preset = {"ist_fixed": DEFAULT_SESSIONS, "dst_anchored": DST_ANCHORED_SESSIONS}.get(body.session_preset or "")
    if preset:
        s["sessions"] = [session_to_dict(x) for x in preset.values()]
    if body.sessions is not None:
        if {x.key for x in body.sessions} != {"asia", "london", "newyork"}:
            raise HTTPException(422, "Provide exactly the three sessions: asia, london, newyork")
        for x in body.sessions:
            try:
                ZoneInfo(x.tz)
                session_from_dict(x.model_dump())
            except (ZoneInfoNotFoundError, ValueError) as e:
                raise HTTPException(422, f"Invalid session '{x.key}': {e}") from e
        s["sessions"] = [x.model_dump() for x in body.sessions]
    if body.notifications is not None:
        unknown = set(body.notifications) - set(notify_mod.KINDS)
        if unknown:
            raise HTTPException(422, f"Unknown notification kinds: {sorted(unknown)}")
        s["notifications"] = {**s.get("notifications", {}), **body.notifications}
    user.settings = s
    db.commit()
    return settings_out(user)


# --------------------------------------------------------------------- notifications
@router.get("/notifications")
def notifications(unread_only: bool = False, limit: int = Query(100, le=500), user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    q = db.query(Notification).filter_by(user_id=user.id)
    if unread_only:
        q = q.filter(Notification.read_at.is_(None))
    return [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "created_at": n.created_at,
             "read": n.read_at is not None, "push_status": n.push_status, "data": n.data}
            for n in q.order_by(Notification.id.desc()).limit(limit)]


@router.post("/notifications/read", status_code=204)
def mark_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter_by(user_id=user.id, read_at=None).update({"read_at": utcnow()})
    db.commit()


class PushIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    platform: str = Field(default="ios", pattern="^(ios|android|web)$")


@router.post("/push-tokens", status_code=204)
def register_push(body: PushIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(PushToken).filter_by(token=body.token).first()
    if row:
        row.user_id, row.platform = user.id, body.platform
    else:
        db.add(PushToken(user_id=user.id, token=body.token, platform=body.platform))
    db.commit()


# ---------------------------------------------------------------------------- admin
class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(admin|trader|viewer)$")
    is_active: bool | None = None


@router.get("/admin/users")
def admin_users(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return [{"id": u.id, "email": u.email, "role": u.role, "is_active": u.is_active, "created_at": u.created_at,
             "jurisdiction": u.jurisdiction} for u in db.query(User).order_by(User.id)]


@router.patch("/admin/users/{user_id}")
def admin_patch_user(user_id: int, body: UserPatch, user: User = Depends(require_role("admin")),
                     db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id and (body.role not in (None, "admin") or body.is_active is False):
        raise HTTPException(409, "You cannot demote or deactivate yourself")
    if body.role:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    audit(db, "admin", "user_changed", user.id, target=target.id, **body.model_dump(exclude_none=True))
    db.commit()
    return {"id": target.id, "role": target.role, "is_active": target.is_active}


@router.get("/admin/logs")
def admin_logs(category: str | None = None, limit: int = Query(200, le=1000),
               user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    q = db.query(SystemLog)
    if category:
        q = q.filter_by(category=category)
    return [{"id": r.id, "ts": r.ts, "level": r.level, "category": r.category, "event": r.event,
             "user_id": r.user_id, "account_id": r.account_id, "detail": r.detail}
            for r in q.order_by(SystemLog.id.desc()).limit(limit)]


@router.get("/audit")
def my_audit(limit: int = Query(200, le=1000), user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(SystemLog).filter_by(user_id=user.id).order_by(SystemLog.id.desc()).limit(limit)
    return [{"id": r.id, "ts": r.ts, "level": r.level, "category": r.category, "event": r.event,
             "account_id": r.account_id, "detail": r.detail} for r in rows]


@router.post("/admin/emergency-stop-all")
def admin_stop_all(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    from ..core import live_gate
    n = 0
    for a in db.query(Account):
        a.kill_switch, a.trading_enabled = True, False
        live_gate.disable(db, a, "admin global stop")
        n += 1
    audit(db, "risk", "admin_global_stop", user.id, level="crit", accounts=n)
    db.commit()
    return {"stopped_accounts": n}


# ------------------------------------------------------------------------ websocket
class Hub:
    def __init__(self):
        self.clients: dict[WebSocket, int] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    def publish(self, user_id: int | None, message: dict) -> None:
        """Thread-safe: called from the trading loop thread."""
        if not self.loop or not self.clients:
            return
        for ws, uid in list(self.clients.items()):
            if user_id is None or uid == user_id:
                asyncio.run_coroutine_threadsafe(self._send(ws, message), self.loop)

    async def _send(self, ws: WebSocket, message: dict) -> None:
        try:
            await ws.send_json(message)
        except Exception:
            self.clients.pop(ws, None)


hub = Hub()
notify_mod.subscribe(hub.publish)
runner.on_quote(lambda q: hub.publish(None, {"type": "quote", "symbol": q.symbol, "bid": q.bid, "ask": q.ask,
                                             "ts": q.ts.isoformat(), "source": q.source}))


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = Query(...)):
    db = SessionLocal()
    try:
        user = user_from_token(db, token)
    except HTTPException:
        await ws.close(code=4401)
        return
    finally:
        db.close()
    await ws.accept()
    hub.loop = asyncio.get_running_loop()
    hub.clients[ws] = user.id
    await ws.send_json({"type": "hello", "time": utcnow().isoformat()})
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_json({"type": "pong", "time": utcnow().isoformat()})
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.pop(ws, None)
