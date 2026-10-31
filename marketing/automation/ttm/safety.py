"""The global kill switch and dry-run. Every function that changes data calls
guard(); anything that would reach the outside world is only ever recorded
here (sending and publishing are manual)."""
from .config import load_config


class KillSwitchOn(RuntimeError):
    pass


def guard(action: str) -> dict:
    cfg = load_config()
    if cfg.get("kill_switch"):
        raise KillSwitchOn(f"Kill switch is on: '{action}' was not run. Set kill_switch to false in marketing/marketing-config.json.")
    return cfg


def is_dry_run() -> bool:
    return bool(load_config().get("dry_run", True))
