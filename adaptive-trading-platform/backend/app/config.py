from __future__ import annotations

import base64
import hashlib
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="ATP_", extra="ignore")

    env: str = "dev"                                  # dev | test | prod
    database_url: str = "postgresql+psycopg://atp:atp_dev@localhost:5432/atp"
    redis_url: str | None = None
    secret_key: str = "dev-only-change-me"            # JWT signing key
    credentials_key: str | None = None                # Fernet key for broker secrets
    access_token_minutes: int = 20
    refresh_token_days: int = 14
    cors_origins: str = "http://localhost:8081,http://localhost:19006"
    allow_registration: bool = True
    default_jurisdiction: str = "IN"
    rate_limit_per_minute: int = 300
    auth_rate_limit_per_minute: int = 10
    run_trading_loop: bool = True
    trading_loop_seconds: float = 5.0
    quote_stale_seconds: float = 90.0
    mt5_bridge_url: str | None = None                 # e.g. https://bridge.tailnet:8787
    mt5_bridge_secret: str | None = None
    binance_base_url: str = "https://data-api.binance.vision"
    anthropic_api_key: str | None = None              # optional AI narration only
    ai_model: str = "claude-opus-5-5"
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    web_dist_dir: str | None = None                   # exported Expo web build to serve at /

    @model_validator(mode="after")
    def _prod_guard(self):
        if self.env == "prod":
            if self.secret_key == "dev-only-change-me" or len(self.secret_key) < 32:
                raise ValueError("ATP_SECRET_KEY must be set to a random value of >= 32 chars in prod")
            if not self.credentials_key:
                raise ValueError("ATP_CREDENTIALS_KEY (Fernet key) is required in prod")
        return self

    @property
    def fernet_key(self) -> bytes:
        if self.credentials_key:
            return self.credentials_key.encode()
        # dev/test only: deterministic key derived from the secret
        return base64.urlsafe_b64encode(hashlib.sha256(self.secret_key.encode()).digest())


@lru_cache
def get_settings() -> Settings:
    return Settings()
