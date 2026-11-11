#!/usr/bin/env bash
# Local development without Docker: needs Python 3.12+, PostgreSQL 16 and (for the UI) Node 20+.
set -euo pipefail
cd "$(dirname "$0")/../backend"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/pip install -q -r requirements-dev.txt
export ATP_DATABASE_URL="${ATP_DATABASE_URL:-postgresql+psycopg://atp:atp_dev@localhost:5432/atp}"
.venv/bin/alembic upgrade head
if [ -d ../mobile/dist ]; then export ATP_WEB_DIST_DIR="$PWD/../mobile/dist"; fi
exec .venv/bin/uvicorn app.main:app --reload --port 8000
