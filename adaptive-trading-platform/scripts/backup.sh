#!/bin/sh
# Database backup (custom-format dump). Run with:  docker compose run --rm backup
# Restore with: pg_restore -h db -U atp -d atp --clean <file>
set -eu
STAMP=$(date +%Y%m%d-%H%M%S)
pg_dump -h db -U atp -Fc atp > "/backups/atp-${STAMP}.dump"
ls -lh /backups | tail -3
