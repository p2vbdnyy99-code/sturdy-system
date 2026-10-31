"""Settings: marketing/marketing-config.json (git-ignored) over the defaults
in marketing/marketing-config.example.json. TTM_DATA_DIR and TTM_CONFIG
override the paths (tests use them)."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # marketing/


def data_dir() -> Path:
    d = Path(os.environ.get("TTM_DATA_DIR", ROOT / "data"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_config() -> dict:
    with open(ROOT / "marketing-config.example.json", encoding="utf-8") as f:
        cfg = json.load(f)
    local = Path(os.environ.get("TTM_CONFIG", ROOT / "marketing-config.json"))
    if local.exists():
        with open(local, encoding="utf-8") as f:
            _merge(cfg, json.load(f))
    return cfg


def _merge(base: dict, over: dict) -> None:
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _merge(base[k], v)
        else:
            base[k] = v
