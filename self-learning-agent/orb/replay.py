"""Replay recorded launches through the agent, in time order.

Input is JSONL, one launch per line: every LaunchSnapshot field as it was
known at decision time, plus the outcome observed `horizon_minutes` later:

    {"launch_id": "...", "organic_buy_share": 0.41, ..., "liquidity_usd": 8200,
     "outcome": "stop_loss", "realized_return": -0.47}

Producing this file (from an RPC/indexer of your choice) is the data
collection step; the agent itself never touches a wallet.
"""
import json
from dataclasses import fields

from .features import CLASSES, LaunchSnapshot

_SNAPSHOT_FIELDS = {f.name for f in fields(LaunchSnapshot)}


def read_jsonl(path):
    with open(path) as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            try:
                snap = LaunchSnapshot(**{k: rec[k] for k in _SNAPSHOT_FIELDS})
                label = CLASSES.index(rec["outcome"])
            except (KeyError, ValueError) as e:
                raise ValueError(f"{path}:{n}: bad record ({e})") from e
            yield snap, label, rec.get("realized_return")


def replay(agent, path):
    for snap, label, ret in read_jsonl(path):
        agent.observe(snap)
        agent.resolve(snap.launch_id, label, realized_return=ret)
    return agent.report()
