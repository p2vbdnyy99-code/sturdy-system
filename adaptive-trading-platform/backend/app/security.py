from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db, utcnow
from .models import Account, AuthSession, SystemLog, User

_ph = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)
ROLE_RANK = {"viewer": 0, "trader": 1, "admin": 2}


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except (VerifyMismatchError, Exception):
        return False


def validate_password_strength(pw: str) -> None:
    if len(pw) < 10 or pw.lower() == pw or not any(ch.isdigit() for ch in pw):
        raise HTTPException(422, "Password must be at least 10 characters and include an upper-case "
                                 "letter and a digit.")


def _hash_token(tok: str) -> str:
    return hashlib.sha256(tok.encode()).hexdigest()


def create_session(db: Session, user: User, request: Request | None = None) -> dict:
    s = get_settings()
    refresh = secrets.token_urlsafe(48)
    sess = AuthSession(user_id=user.id, refresh_hash=_hash_token(refresh),
                       expires_at=utcnow() + timedelta(days=s.refresh_token_days),
                       user_agent=(request.headers.get("user-agent", "")[:255] if request else None),
                       ip=(request.client.host if request and request.client else None))
    db.add(sess)
    db.flush()
    return {"access_token": _access_token(user, sess.id), "refresh_token": refresh, "token_type": "bearer",
            "expires_in": s.access_token_minutes * 60}


def _access_token(user: User, sid: int) -> str:
    s = get_settings()
    now = int(time.time())
    return jwt.encode({"sub": str(user.id), "sid": sid, "role": user.role, "iat": now,
                       "exp": now + s.access_token_minutes * 60}, s.secret_key, algorithm="HS256")


def rotate_refresh(db: Session, refresh: str, request: Request | None = None) -> dict:
    sess = db.query(AuthSession).filter_by(refresh_hash=_hash_token(refresh)).first()
    if not sess or sess.revoked_at or sess.expires_at < utcnow():
        raise HTTPException(401, "Invalid refresh token")
    user = db.get(User, sess.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Invalid refresh token")
    sess.revoked_at = utcnow()          # one-time use: rotation
    return create_session(db, user, request)


def decode_access(token: str) -> dict:
    try:
        return jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise HTTPException(401, "Invalid or expired token") from e


def user_from_token(db: Session, token: str) -> User:
    claims = decode_access(token)
    sess = db.get(AuthSession, claims.get("sid"))
    if not sess or sess.revoked_at or sess.expires_at < utcnow():
        raise HTTPException(401, "Session ended")
    user = db.get(User, int(claims["sub"]))
    if not user or not user.is_active:
        raise HTTPException(401, "Account disabled")
    user._sid = sess.id  # type: ignore[attr-defined]
    return user


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    if not cred:
        raise HTTPException(401, "Not authenticated")
    return user_from_token(db, cred.credentials)


def require_role(minimum: str):
    def dep(user: User = Depends(current_user)) -> User:
        if ROLE_RANK[user.role] < ROLE_RANK[minimum]:
            raise HTTPException(403, f"Requires role '{minimum}' or higher")
        return user
    return dep


def owned_account(db: Session, user: User, account_id: int) -> Account:
    """Account isolation: 404 (not 403) so ids of other users are not disclosed."""
    acct = db.get(Account, account_id)
    if not acct or acct.user_id != user.id:
        raise HTTPException(404, "Account not found")
    return acct


# ---- credential encryption ---------------------------------------------------
def encrypt_secret(data: dict) -> str:
    return Fernet(get_settings().fernet_key).encrypt(json.dumps(data).encode()).decode()


def decrypt_secret(token: str) -> dict:
    try:
        return json.loads(Fernet(get_settings().fernet_key).decrypt(token.encode()))
    except InvalidToken as e:
        raise RuntimeError("Stored credentials cannot be decrypted with the configured key") from e


# ---- request signing for the MT5 bridge ---------------------------------------
def sign_request(secret: str, method: str, path: str, body: bytes, ts: str, nonce: str) -> str:
    msg = b"\n".join([ts.encode(), nonce.encode(), method.upper().encode(), path.encode(),
                      hashlib.sha256(body).hexdigest().encode()])
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


# ---- audit ---------------------------------------------------------------------
def audit(db: Session, category: str, event: str, user_id: int | None = None, account_id: int | None = None,
          level: str = "info", **detail) -> None:
    db.add(SystemLog(category=category, event=event, user_id=user_id, account_id=account_id, level=level,
                     detail=detail))


# ---- rate limiting ---------------------------------------------------------------
class RateLimiter:
    """Sliding-window limiter. Uses Redis when configured, else process memory."""

    def __init__(self):
        self._mem: dict[str, deque] = defaultdict(deque)
        self._redis = None
        url = get_settings().redis_url
        if url:
            try:
                import redis
                self._redis = redis.Redis.from_url(url, socket_timeout=0.5)
                self._redis.ping()
            except Exception:
                self._redis = None

    def allow(self, key: str, limit: int, window: int = 60) -> bool:
        now = time.time()
        if self._redis is not None:
            try:
                bucket = f"rl:{key}:{int(now // window)}"
                n = self._redis.incr(bucket)
                if n == 1:
                    self._redis.expire(bucket, window * 2)
                return n <= limit
            except Exception:
                pass
        q = self._mem[key]
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True

    def reset(self):
        self._mem.clear()
