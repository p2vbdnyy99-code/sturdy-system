from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..brokers.base import BrokerError
from ..brokers.registry import build_adapter
from ..core import compliance, live_gate
from ..core.risk import RiskConfig
from ..core.trading import spec_from_dict
from ..db import get_db, utcnow
from ..models import Account, Broker, BrokerConnection, ComplianceAttestation, Instrument, Order, User
from ..security import audit, current_user, encrypt_secret, owned_account, require_role, verify_password

router = APIRouter(tags=["brokers"])


def conn_out(c: BrokerConnection) -> dict:
    return {"id": c.id, "broker": c.broker.key, "broker_name": c.broker.name, "label": c.label,
            "config": c.config, "account_type": c.account_type, "status": c.status, "last_test_at": c.last_test_at,
            "last_test_result": c.last_test_result, "has_credentials": bool(c.credentials_enc),
            "integration_status": c.broker.integration_status}


def _owned_conn(db, user, cid) -> BrokerConnection:
    c = db.get(BrokerConnection, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Broker connection not found")
    return c


@router.get("/brokers")
def brokers(user: User = Depends(current_user), db: Session = Depends(get_db)):
    out = []
    for b in db.query(Broker).order_by(Broker.id):
        elig = {ac: compliance.evaluate(user.jurisdiction, b.key, ac).to_dict() for ac in b.asset_classes}
        out.append({"key": b.key, "name": b.name, "asset_classes": b.asset_classes,
                    "integration_status": b.integration_status, "notes": b.notes, "eligibility": elig})
    return {"jurisdiction": user.jurisdiction, "brokers": out}


class ConnIn(BaseModel):
    broker: str
    label: str = Field(min_length=1, max_length=64)
    config: dict = Field(default_factory=dict)       # non-secret: bridge_url, symbol_map, base_url
    credentials: dict = Field(default_factory=dict)  # secret: api_key/api_secret/bridge_secret (encrypted at rest)


@router.get("/broker-connections")
def connections(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [conn_out(c) for c in db.query(BrokerConnection).filter_by(user_id=user.id)]


@router.post("/broker-connections", status_code=201)
def create_connection(body: ConnIn, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    b = db.query(Broker).filter_by(key=body.broker).first()
    if not b or b.key == "paper":
        raise HTTPException(422, "Unknown broker")
    if b.integration_status == "not_implemented":
        raise HTTPException(422, b.notes)
    c = BrokerConnection(user_id=user.id, broker_id=b.id, label=body.label, config=body.config,
                         credentials_enc=encrypt_secret(body.credentials) if body.credentials else None)
    db.add(c)
    audit(db, "broker", "connection_created", user.id, broker=b.key, credential_fields=sorted(body.credentials))
    db.commit()
    return conn_out(c)


@router.delete("/broker-connections/{cid}", status_code=204)
def delete_connection(cid: int, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    c = _owned_conn(db, user, cid)
    if db.query(Account.id).filter_by(broker_connection_id=c.id).first():
        raise HTTPException(409, "A live account uses this connection")
    db.delete(c)
    audit(db, "broker", "connection_deleted", user.id, connection_id=cid)
    db.commit()


@router.post("/broker-connections/{cid}/test")
def test_connection(cid: int, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    """Read-only end-to-end test. This is the ONLY thing that can mark a
    connection 'ok'; it never places an order."""
    c = _owned_conn(db, user, cid)
    c.last_test_at = utcnow()
    try:
        adapter = build_adapter(c)
        try:
            res = adapter.test_connection()
        finally:
            adapter.close()
        c.status = "ok" if res.get("ok") else "failed"
        c.account_type = res.get("account_type", "unknown")
        c.last_test_result = res
    except (BrokerError, RuntimeError) as e:
        c.status, c.last_test_result = "failed", {"ok": False, "error": str(e)[:500]}
    audit(db, "broker", "connection_tested", user.id, connection_id=c.id, status=c.status)
    db.commit()
    return conn_out(c)


@router.post("/broker-connections/{cid}/sync-specs")
def sync_specs(cid: int, symbols: list[str], user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    """Overwrite platform contract specifications with the broker's own values."""
    c = _owned_conn(db, user, cid)
    adapter, out = build_adapter(c), []
    try:
        for sym in symbols:
            inst = db.query(Instrument).filter_by(symbol=sym).first()
            if not inst:
                out.append({"symbol": sym, "ok": False, "error": "unknown instrument"})
                continue
            try:
                b = adapter.symbol_spec(sym)
                new = {**inst.spec}
                for k in ("contract_size", "tick_size", "min_volume", "volume_step", "max_volume", "min_notional",
                          "swap_long", "swap_short", "margin_rate"):
                    if b.get(k) not in (None, 0) or k in ("swap_long", "swap_short"):
                        if b.get(k) is not None:
                            new[k] = float(b[k])
                if b.get("spread") is not None:
                    new["typical_spread"] = float(b["spread"])
                new["verified"] = True
                spec_from_dict(new).validate()
                inst.spec, inst.spec_verified, inst.spec_source, inst.updated_at = new, True, f"{c.broker.key}:{c.label}", utcnow()
                out.append({"symbol": sym, "ok": True, "spec": new})
            except (BrokerError, ValueError, KeyError) as e:
                out.append({"symbol": sym, "ok": False, "error": str(e)[:300]})
    finally:
        adapter.close()
    audit(db, "broker", "specs_synced", user.id, connection_id=c.id, symbols=symbols)
    db.commit()
    return out


# --------------------------------------------------------------------- compliance
@router.get("/compliance/check")
def compliance_check(broker: str, asset_class: str, account_type: str = "unknown", user: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    attested = db.query(ComplianceAttestation.id).filter_by(user_id=user.id, broker_key=broker, asset_class=asset_class,
                                                            jurisdiction=user.jurisdiction).first() is not None
    return compliance.evaluate(user.jurisdiction, broker, asset_class, attested, account_type).to_dict() | {
        "jurisdiction": user.jurisdiction, "attested": attested}


class AttestIn(BaseModel):
    broker: str
    asset_class: str
    account_type: str = "unknown"
    statement: str


@router.post("/compliance/attest", status_code=201)
def attest(body: AttestIn, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    r = compliance.evaluate(user.jurisdiction, body.broker, body.asset_class, False, body.account_type)
    if r.status == "blocked":
        raise HTTPException(403, {"message": "This combination is blocked and cannot be attested.", **r.to_dict()})
    if r.status != "attestation_required" or body.statement.strip() != (r.attestation_text or ""):
        raise HTTPException(422, {"message": "Statement must match the attestation text exactly.",
                                  "attestation_text": r.attestation_text})
    db.add(ComplianceAttestation(user_id=user.id, broker_key=body.broker, asset_class=body.asset_class,
                                 jurisdiction=user.jurisdiction, statement=body.statement.strip()))
    audit(db, "admin", "compliance_attested", user.id, broker=body.broker, asset_class=body.asset_class,
          jurisdiction=user.jurisdiction, level="warn")
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------------- live mode
class LiveAccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    connection_id: int


@router.post("/accounts/live", status_code=201)
def create_live_account(body: LiveAccountIn, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    """Registers a LIVE account record (execution stays disabled). Refused outright
    when every product of the broker is blocked for the user's jurisdiction."""
    c = _owned_conn(db, user, body.connection_id)
    verdicts = [compliance.evaluate(user.jurisdiction, c.broker.key, ac, False, c.account_type)
                for ac in c.broker.asset_classes]
    if all(v.status == "blocked" for v in verdicts):
        raise HTTPException(403, {"message": "This broker cannot be used for live trading from your declared "
                                             "country of residence.", **verdicts[0].to_dict()})
    a = Account(user_id=user.id, name=body.name, mode="live", broker_connection_id=c.id, initial_balance=0.0,
                balance=0.0, equity=0.0, peak_equity=0.0, day_start_equity=0.0)
    db.add(a)
    audit(db, "admin", "live_account_created", user.id, connection_id=c.id, level="warn")
    db.commit()
    return {"id": a.id, "mode": a.mode, "live_enabled": a.live_enabled}


@router.get("/accounts/{account_id}/live/checklist")
def live_checklist(account_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return live_gate.checklist(db, owned_account(db, user, account_id)) | {"confirm_phrase": live_gate.CONFIRM_PHRASE}


@router.post("/accounts/{account_id}/live/selftest")
def live_selftest(account_id: int, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    res = live_gate.risk_selftest(RiskConfig.from_dict(a.risk_config))
    a.live_state = {**(a.live_state or {}), "risk_selftest": {"passed": res["passed"], "ran_at": res["ran_at"]}}
    audit(db, "risk", "risk_selftest", user.id, a.id, passed=res["passed"])
    db.commit()
    return res


class ArmIn(BaseModel):
    password: str


class ConfirmIn(BaseModel):
    code: str
    phrase: str


@router.post("/accounts/{account_id}/live/arm")
def live_arm(account_id: int, body: ArmIn, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Password is incorrect")
    try:
        code = live_gate.arm(db, a)
    except PermissionError as e:
        raise HTTPException(409, {"message": str(e), "checklist": live_gate.checklist(db, a)}) from e
    db.commit()
    return {"step": "1 of 2", "confirmation_code": code, "expires_in_seconds": 300,
            "next": f'Confirm with this code and the phrase "{live_gate.CONFIRM_PHRASE}".'}


@router.post("/accounts/{account_id}/live/confirm")
def live_confirm(account_id: int, body: ConfirmIn, user: User = Depends(require_role("trader")),
                 db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    try:
        live_gate.confirm(db, a, body.code, body.phrase)
    except PermissionError as e:
        raise HTTPException(409, str(e)) from e
    db.commit()
    return {"live_enabled": True, "note": "The first live order will still wait for a separate confirmation."}


@router.post("/accounts/{account_id}/live/disable")
def live_disable(account_id: int, user: User = Depends(require_role("trader")), db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    live_gate.disable(db, a, "user request")
    a.trading_enabled = False
    db.commit()
    return {"live_enabled": False}


@router.post("/accounts/{account_id}/live/confirm-first-order")
def confirm_first_order(account_id: int, body: ArmIn, user: User = Depends(require_role("trader")),
                        db: Session = Depends(get_db)):
    a = owned_account(db, user, account_id)
    if a.mode != "live" or not a.live_enabled:
        raise HTTPException(409, "Live trading is not enabled")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Password is incorrect")
    a.first_live_order_confirmed = True
    # the parked order is stale by now; it is cancelled, not sent late
    n = db.query(Order).filter_by(account_id=a.id, status="awaiting_confirmation").update(
        {"status": "expired", "reject_reason": "expired while awaiting first-live-order confirmation"})
    audit(db, "admin", "first_live_order_confirmed", user.id, a.id, level="crit", expired_orders=n)
    db.commit()
    return {"first_live_order_confirmed": True, "expired_orders": n}
