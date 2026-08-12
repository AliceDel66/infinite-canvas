#!/bin/sh
set -eu

umask 077
PROJECT_DIR=${PROJECT_DIR:-$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)}
cd "$PROJECT_DIR"

set -a
. "$PROJECT_DIR/.env"
set +a

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_ROOT=${BACKUP_ROOT:-/data/backups/infinite-canvas}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
TARGET="$BACKUP_ROOT/$STAMP"
install -d -m 700 "$BACKUP_ROOT"
mkdir -p "$TARGET/objects"
chmod 700 "$TARGET"

docker compose exec -T postgres pg_dump \
    -U "${POSTGRES_USER:-infinite_canvas}" \
    -d "${POSTGRES_DB:-infinite_canvas}" \
    --format=custom > "$TARGET/postgres.dump"

docker compose --profile operations run --rm -T minio-client \
    "mc mirror --overwrite canvas/${S3_BUCKET:-infinite-canvas} /backups/$STAMP/objects"

(
    cd "$TARGET"
    find postgres.dump objects -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)

"$PROJECT_DIR/deploy/verify-backup.sh" "$TARGET"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name "20*T*Z" -mtime "+$RETENTION_DAYS" -exec rm -rf -- {} +
printf '%s\n' "$TARGET"
