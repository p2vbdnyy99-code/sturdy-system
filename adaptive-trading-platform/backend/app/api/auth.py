from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db, utcnow
from ..models import Account, AuthSession, User
from ..security import (audit, create_session, current_user, hash_password, rotate_refresh, validate_password_strength,
                        verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=200)


class RefreshIn(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "role": u.role, "jurisdiction": u.jurisdiction,
            "residency_declared": u.residency_declared_at is not None}


@router.post("/register", status_code=201)
def register(body: Credentials, request: Request, db: Session = Depends(get_db)):
    s = get_settings()
    if not s.allow_registration:
        raise HTTPException(403, "Registration is disabled")
    validate_password_strength(body.password)
    email = body.email.strip().lower()
    if db.query(User.id).filter_by(email=email).first():
        raise HTTPException(409, "An account with this email already exists")
    first = db.query(User.id).first() is None
    user = User(email=email, password_hash=hash_password(body.password), role="admin" if first else "trader",
                jurisdiction=s.default_jurisdiction)
    db.add(user)
    db.flush()
    # every user starts with exactly one PAPER account; live accounts are never auto-created
    db.add(Account(user_id=user.id, name="Paper account", mode="paper"))
    audit(db, "auth", "register", user.id, role=user.role)
    tokens = create_session(db, user, request)
    db.commit()
    return {"user": user_out(user), **tokens}


@router.post("/login")
def login(body: Credentials, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.strip().lower()).first()
    now = utcnow()
    if user and user.locked_until and user.locked_until > now:
        raise HTTPException(429, "Too many failed attempts. Try again later.")
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        if user:
            user.failed_logins += 1
            if user.failed_logins >= 5:
                user.locked_until, user.failed_logins = now + timedelta(minutes=15), 0
            audit(db, "auth", "login_failed", user.id, level="warn")
            db.commit()
        raise HTTPException(401, "Incorrect email or password")
    user.failed_logins, user.locked_until = 0, None
    tokens = create_session(db, user, request)
    audit(db, "auth", "login", user.id)
    db.commit()
    return {"user": user_out(user), **tokens}


@router.post("/refresh")
def refresh(body: RefreshIn, request: Request, db: Session = Depends(get_db)):
    tokens = rotate_refresh(db, body.refresh_token, request)
    db.commit()
    return tokens


@router.post("/logout", status_code=204)
def logout(user: User = Depends(current_user), db: Session = Depends(get_db)):
    sess = db.get(AuthSession, user._sid)
    sess.revoked_at = utcnow()
    audit(db, "auth", "logout", user.id)
    db.commit()


@router.post("/logout-all", status_code=204)
def logout_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(AuthSession).filter_by(user_id=user.id, revoked_at=None).update({"revoked_at": utcnow()})
    audit(db, "auth", "logout_all", user.id)
    db.commit()


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.get("/sessions")
def sessions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(AuthSession).filter_by(user_id=user.id, revoked_at=None).order_by(AuthSession.id.desc()).all()
    return [{"id": s.id, "created_at": s.created_at, "expires_at": s.expires_at, "user_agent": s.user_agent,
             "ip": s.ip, "current": s.id == user._sid} for s in rows if s.expires_at > utcnow()]


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    validate_password_strength(body.new_password)
    user.password_hash = hash_password(body.new_password)
    db.query(AuthSession).filter(AuthSession.user_id == user.id, AuthSession.id != user._sid,
                                 AuthSession.revoked_at.is_(None)).update({"revoked_at": utcnow()})
    audit(db, "auth", "password_changed", user.id)
    db.commit()
