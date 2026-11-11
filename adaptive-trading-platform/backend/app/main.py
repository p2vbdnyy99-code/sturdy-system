from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, runner
from .api import auth, brokers, research, system, trading
from .brokers.registry import seed_brokers
from .config import get_settings
from .core import live_gate
from .core.strategies.library import STRATEGIES
from .core.trading import seed_instruments
from .db import session_scope
from .models import StrategyDef
from .security import RateLimiter, audit

log = logging.getLogger("atp")
limiter = RateLimiter()


def bootstrap() -> None:
    """Idempotent reference-data seed + mandatory live-mode disarm."""
    with session_scope() as db:
        seed_brokers(db)
        seed_instruments(db)
        have = {s.key for s in db.query(StrategyDef)}
        for s in STRATEGIES.values():
            if s.key not in have:
                db.add(StrategyDef(key=s.key, name=s.name, description=s.description, indicators=list(s.indicators_used)))
        n = live_gate.disarm_all(db)
        audit(db, "system", "startup", version=__version__, live_accounts_disarmed=n)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    bootstrap()
    task = None
    if s.run_trading_loop and s.env != "test":
        task = asyncio.create_task(runner.loop_forever())
    yield
    if task:
        task.cancel()


def create_app() -> FastAPI:
    s = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    app = FastAPI(title="Adaptive AI Trading Platform", version=__version__, lifespan=lifespan,
                  docs_url=None if s.env == "prod" else "/docs", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
                       allow_methods=["*"], allow_headers=["Authorization", "Content-Type"], allow_credentials=False)

    @app.middleware("http")
    async def guard(request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/"):
            ip = request.client.host if request.client else "unknown"
            is_auth = path.startswith("/api/v1/auth/") and request.method == "POST"
            limit = s.auth_rate_limit_per_minute if is_auth else s.rate_limit_per_minute
            if not limiter.allow(f"{'auth' if is_auth else 'api'}:{ip}", limit):
                return JSONResponse({"detail": "Rate limit exceeded. Slow down."}, status_code=429,
                                    headers={"Retry-After": "60"})
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        if path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Internal server error. The error has been logged."}, status_code=500)

    for r in (auth.router, trading.router, research.router, brokers.router, system.router):
        app.include_router(r, prefix="/api/v1")

    dist = s.web_dist_dir
    if dist and os.path.isdir(dist):
        # the exported Expo web build doubles as the browser admin / Windows desktop interface
        for sub in ("_expo", "assets"):
            if os.path.isdir(os.path.join(dist, sub)):
                app.mount(f"/{sub}", StaticFiles(directory=os.path.join(dist, sub)), name=sub)

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            cand = os.path.normpath(os.path.join(dist, full_path))
            if cand.startswith(os.path.abspath(dist)) and os.path.isfile(cand):
                return FileResponse(cand)
            html = os.path.join(dist, f"{full_path}.html")
            return FileResponse(html if os.path.isfile(html) else os.path.join(dist, "index.html"))
    return app


app = create_app()
