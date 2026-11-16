"""Phase 3: single confirmatory test of H1 (BTC 30-day time-series momentum), as registered in preregistration.json.

Run from backend/:
    .venv/bin/python ../research/phase3/experiment.py check        # training only: reproduces the Phase 2.1 numbers
    .venv/bin/python ../research/phase3/experiment.py validation   # ONE run; refuses to run twice
    .venv/bin/python ../research/phase3/experiment.py holdout      # only after a validation PASS; ledgered

The rule, bar construction and evaluation are imported unchanged from research/phase2_1/hypotheses.py."""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
sys.path.insert(0, ".")
sys.path.insert(0, str(HERE.parent / "phase2_1"))
import hypotheses as p21  # noqa: E402
from app.data import splits, store  # noqa: E402
from app.db import session_scope  # noqa: E402

PRE_PATH = HERE / "preregistration.json"
PRE = json.loads(PRE_PATH.read_text())
PRE_SHA = hashlib.sha256(PRE_PATH.read_bytes()).hexdigest()
HYP = PRE["hypothesis"]
COST = (PRE["costs"]["commission_per_side_bp"] + PRE["costs"]["spread_and_slippage_per_side_bp"]) / 1e4
SEED = PRE["primary_test"]["seed"]
assert abs(COST - p21.COST_PER_SIDE) < 1e-15, "cost model differs from Phase 2.1"
assert (p21.N_SHIFTS, p21.MIN_SHIFT) == (2000, 30)

# Phase 2.1 training results for H1 as reported (RESEARCH_HYPOTHESES.md section 3)
TRAIN_REPORTED = {"days": 1095, "exposure_changes": 80, "net_total_return": 3.218, "gross_total_return": 3.588,
                  "net_sharpe": 1.27, "max_drawdown": 0.461, "timing_p": 0.028}


def arrays(d: pd.DataFrame, expo: pd.Series, seg) -> tuple[pd.DatetimeIndex, np.ndarray, np.ndarray, np.ndarray]:
    """Same alignment as hypotheses.evaluate: decision day t, next day's return, exposure before t."""
    ret = d.close.pct_change().shift(-1)
    m = (d.index >= seg[0]) & (d.index < seg[1]) & ret.notna().to_numpy()
    e, r = expo[m].to_numpy(), ret[m].to_numpy()
    prev = np.concatenate([[expo.shift(1).fillna(0.0)[m].to_numpy()[0]], e[:-1]])
    return d.index[m], e, r, prev


def sharpe(x: np.ndarray) -> float | None:
    s = x.std(ddof=1)
    return float(x.mean() / s * np.sqrt(365)) if s > 0 else None


def max_dd(x: np.ndarray) -> float:
    eq = np.cumprod(1 + x)
    return float((1 - eq / np.maximum.accumulate(np.concatenate([[1.0], eq]))[1:]).max())


def trades(idx, e, r, prev, cost) -> dict:
    out, i, n = [], 0, len(e)
    while i < n:
        if e[i] > 0:
            j = i
            while j + 1 < n and e[j + 1] > 0:
                j += 1
            entered = prev[i] == 0 if i == 0 else True
            exited = j + 1 < n
            g = float(np.prod(1 + r[i:j + 1]))
            net = g * ((1 - cost) if entered else 1.0) * ((1 - cost) if exited else 1.0) - 1
            out.append({"decision_day_in": str(idx[i].date()), "decision_day_out": str(idx[j + 1].date()) if exited else None,
                        "days_held": int(j - i + 1), "net_return": net, "carried_in": not entered, "open_at_end": not exited})
            i = j + 1
        else:
            i += 1
    rets = np.array([t["net_return"] for t in out]) if out else np.array([])
    return {"count": len(out), "win_rate": float((rets > 0).mean()) if len(rets) else None,
            "mean_net_return": float(rets.mean()) if len(rets) else None,
            "median_net_return": float(np.median(rets)) if len(rets) else None,
            "mean_days_held": float(np.mean([t["days_held"] for t in out])) if out else None,
            "best": float(rets.max()) if len(rets) else None, "worst": float(rets.min()) if len(rets) else None,
            "list": out}


def block_bootstrap_sharpe(net: np.ndarray, block: int = 30, n_boot: int = 2000, seed: int = 0) -> list[float]:
    rng = np.random.default_rng(seed)
    n = len(net)
    k = int(np.ceil(n / block))
    vals = []
    for _ in range(n_boot):
        starts = rng.integers(0, n, k)
        x = np.concatenate([np.take(net, np.arange(s, s + block), mode="wrap") for s in starts])[:n]
        s = sharpe(x)
        if s is not None:
            vals.append(s)
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def segment_report(d: pd.DataFrame, expo: pd.Series, seg) -> dict:
    base = p21.evaluate(d, expo, seg, seed=SEED)                       # primary statistics, unchanged code
    idx, e, r, prev = arrays(d, expo, seg)
    turn = np.abs(e - prev)
    net = e * r - turn * COST
    assert abs(float(np.prod(1 + net) - 1) - base["net_total_return"]) < 1e-12, "re-derivation disagrees with evaluate()"
    n = len(net)
    years = n / 365
    stress = {}
    for mult in (2, 3):
        x = e * r - turn * COST * mult
        stress[f"x{mult}"] = {"net_total_return": float(np.prod(1 + x) - 1), "net_sharpe": sharpe(x)}
    extra = {
        "first_decision_day": str(idx[0].date()), "last_decision_day": str(idx[-1].date()),
        "annualised_net_return": float(np.prod(1 + net) ** (1 / years) - 1),
        "annualised_net_volatility": float(net.std(ddof=1) * np.sqrt(365)),
        "t_stat_mean_net_daily": float(net.mean() / (net.std(ddof=1) / np.sqrt(n))),
        "buy_hold_max_drawdown": max_dd(r),
        "net_return_minus_buy_hold": base["net_total_return"] - base["buy_hold_total_return"],
        "net_sharpe_minus_buy_hold": (base["net_sharpe"] or 0) - (base["buy_hold_sharpe"] or 0),
        "turnover_units": float(turn.sum()), "cost_stress": stress,
        "net_sharpe_ci95_block_bootstrap": block_bootstrap_sharpe(net, seed=SEED),
        "trades": trades(idx, e, r, prev, COST),
    }
    assert abs(max_dd(net) - base["max_drawdown"]) < 1e-9 or max_dd(net) >= base["max_drawdown"]
    return base | extra


def load(db, include_holdout: bool):
    sym, src = PRE["dataset"]["symbol"], PRE["dataset"]["source"]
    ds = store.require_dataset(db, sym, src)
    assert (ds.checksum or "").startswith(PRE["dataset"]["checksum_sha256_prefix"]), "dataset changed since registration"
    sp = splits.get_split(ds)
    assert str(sp.train_end.date()) == PRE["dataset"]["train"][1] and str(sp.holdout_start.date()) == PRE["dataset"]["holdout"][0]
    h4 = store.load(db, sym, "H4", src, end=None if include_holdout else splits.research_end(sp))
    d = p21.daily_from_h4(h4)
    return ds, sp, d, p21.h1_tsmom(d, **HYP["params"]), str(h4.index[-1])


def header() -> dict:
    return {"preregistration_sha256": PRE_SHA, "preregistered_at_utc": PRE["registered_at_utc"],
            "run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def main(stage: str) -> None:
    val_path, hold_path = HERE / "validation_result.json", HERE / "holdout_result.json"
    with session_scope() as db:
        if stage == "check":
            ds, sp, d, expo, last = load(db, include_holdout=False)
            t = p21.evaluate(d, expo, (sp.data_start, sp.train_end), seed=SEED)       # TRAINING ONLY
            print("hold-out ledger entries:", len(ds.split.get("accesses", [])), "| loaded until", last)
            for k, v in TRAIN_REPORTED.items():
                print(f"  train {k:22s} now {t[k]:.4f}   reported {v}")
        elif stage == "validation":
            if val_path.exists():
                sys.exit("validation has already been run; a second run is not allowed")
            ds, sp, d, expo, last = load(db, include_holdout=False)
            rep = segment_report(d, expo, (sp.train_end, sp.holdout_start))
            checks = {"timing p < 0.05": rep["timing_p"] is not None and rep["timing_p"] < 0.05,
                      "net Sharpe > 0": (rep["net_sharpe"] or -1) > 0, "net total return > 0": rep["net_total_return"] > 0}
            res = header() | {"stage": "validation", "loaded_until": last, "holdout_ledger_entries": len(ds.split.get("accesses", [])),
                              "gate": checks, "verdict": "PASS" if all(checks.values()) else "FAIL", "metrics": rep}
            val_path.write_text(json.dumps(res, indent=1, default=str))
            print(json.dumps({k: v for k, v in res.items() if k != "metrics"}, indent=1))
            print(json.dumps({k: v for k, v in rep.items() if k != "trades"}, indent=1))
            print(json.dumps({k: v for k, v in rep["trades"].items() if k != "list"}, indent=1))
        elif stage == "holdout":
            if hold_path.exists():
                sys.exit("hold-out has already been run")
            if not val_path.exists() or json.loads(val_path.read_text())["verdict"] != "PASS":
                sys.exit("hold-out stays sealed: validation has not passed")
            sym, src = PRE["dataset"]["symbol"], PRE["dataset"]["source"]
            prior = splits.record_access(store.require_dataset(db, sym, src),
                                         "Phase 3 pre-registered confirmatory hold-out read: H1_tsmom30")
            ds, sp, d, expo, last = load(db, include_holdout=True)
            rep = segment_report(d, expo, (sp.holdout_start, sp.data_end))
            checks = {"net Sharpe > 0": (rep["net_sharpe"] or -1) > 0, "net total return > 0": rep["net_total_return"] > 0}
            res = header() | {"stage": "holdout", "loaded_until": last, "independent": prior == 0, "gate": checks,
                              "verdict": "PASS" if all(checks.values()) else "FAIL", "metrics": rep}
            hold_path.write_text(json.dumps(res, indent=1, default=str))
            print(json.dumps({k: v for k, v in res.items() if k != "metrics"}, indent=1))
            print(json.dumps({k: v for k, v in rep.items() if k != "trades"}, indent=1))
            print(json.dumps({k: v for k, v in rep["trades"].items() if k != "list"}, indent=1))
        else:
            sys.exit("stage must be check, validation or holdout")


if __name__ == "__main__":
    main(sys.argv[1])
