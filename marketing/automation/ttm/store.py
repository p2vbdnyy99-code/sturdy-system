"""A tiny JSON document store: one file per collection in the data folder,
written atomically under a lock, plus an append-only event log. Safe to run
again after a crash; no partial files."""
import contextlib
import datetime as dt
import fcntl
import json
import os
import uuid
from pathlib import Path

from .config import data_dir


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


@contextlib.contextmanager
def locked(name: str):
    lock_path = data_dir() / f".{name}.lock"
    with open(lock_path, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def load(name: str) -> list:
    path = data_dir() / f"{name}.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(name: str, records: list) -> None:
    path: Path = data_dir() / f"{name}.json"
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def log_event(kind: str, **fields) -> dict:
    event = {"at": now_iso(), "kind": kind, **fields}
    with open(data_dir() / "events.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event


def events() -> list:
    path = data_dir() / "events.jsonl"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
