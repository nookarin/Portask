#!/bin/bash
# Portask updater for Synology Task Scheduler (no git needed): downloads the latest
# commit of the repo, rebuilds, migrates and restarts. See README "Updating".
# Edit APP / HEALTH below to match your setup.
set -euo pipefail

APP=/volume1/docker/portask          # project folder (contains .env and docker-compose.prod.yml)
REPO=nookarin/Portask
BRANCH=main
HEALTH=http://172.17.0.1:8080/portask/api/health   # match FRONTEND_BIND and BASE_PATH
DC="/usr/local/bin/docker compose -f docker-compose.prod.yml"
LOG="$APP/update.log"

main() {
  exec >>"$LOG" 2>&1
  echo "=== $(date '+%F %T') ==="
  cd "$APP"

  # 1. Is there anything new?
  LATEST=$(curl -fsS -H "Accept: application/vnd.github.sha" "https://api.github.com/repos/$REPO/commits/$BRANCH")
  CURRENT=$(cat .deployed-sha 2>/dev/null || echo none)
  if [ "$LATEST" = "$CURRENT" ]; then echo "Up to date ($CURRENT)"; return 0; fi
  echo "Updating $CURRENT -> $LATEST"

  # 2. Back up the database (bundled Postgres only) and keep the last 7 dumps
  mkdir -p backups
  $DC exec -T db pg_dump -U portask portask | gzip > "backups/db-$(date +%F-%H%M).sql.gz" \
    || echo "WARNING: database backup failed (skipping if you use an external database)"
  ls -1t backups/db-*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

  # 3. Download and unpack the new code. .env, ./data and backups are never touched.
  TMP=$(mktemp -d)
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$LATEST" -o "$TMP/src.tgz"
  tar -xzf "$TMP/src.tgz" -C "$APP" --strip-components=1 \
    --exclude='*/.env' --exclude='*/data' --exclude='*/backups'
  rm -rf "$TMP"

  # 4. Rebuild, migrate, restart
  $DC build
  $DC run --rm api npx prisma migrate deploy
  $DC up -d

  # 5. Wait for the app to answer, then record the version
  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH" | grep -q '"status":"ok"'; then
      echo "$LATEST" > .deployed-sha
      echo "Deployed $LATEST"
      return 0
    fi
    sleep 5
  done
  echo "ERROR: health check failed after update; .deployed-sha not updated"
  return 1
}

# Everything runs inside main() so replacing this file mid-run (step 3) is safe.
main
exit $?
