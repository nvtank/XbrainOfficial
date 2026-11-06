#!/bin/sh
set -e
# Apply database migrations when PostgreSQL is configured.
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] applying Prisma migrations…"
  i=0
  until npx prisma migrate deploy --schema prisma/schema.prisma; do
    i=$((i+1))
    if [ "$i" -ge 15 ]; then echo "[entrypoint] database not reachable, giving up"; exit 1; fi
    echo "[entrypoint] database not ready, retrying in 2s ($i/15)"
    sleep 2
  done
fi
exec "$@"
