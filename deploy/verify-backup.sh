#!/bin/sh
set -eu

BACKUP_ROOT=${BACKUP_ROOT:-/data/backups/infinite-canvas}
TARGET=${1:-$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name "20*T*Z" | sort | tail -n 1)}
[ -n "$TARGET" ] && [ -f "$TARGET/postgres.dump" ] && [ -f "$TARGET/SHA256SUMS" ]

(
    cd "$TARGET"
    sha256sum -c SHA256SUMS >/dev/null
)

VERIFY_CONTAINER="infinite-canvas-restore-verify-$$"
cleanup() {
    docker rm -f "$VERIFY_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --name "$VERIFY_CONTAINER" \
    -e POSTGRES_PASSWORD=restore-verify-only \
    -e POSTGRES_DB=restore_verify \
    postgres:17-alpine >/dev/null

attempt=0
until docker exec "$VERIFY_CONTAINER" sh -c '[ "$(cat /proc/1/comm)" = postgres ]' >/dev/null 2>&1 &&
    docker exec "$VERIFY_CONTAINER" pg_isready -U postgres -d restore_verify >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 30 ] || exit 1
    sleep 1
done

docker exec -i "$VERIFY_CONTAINER" pg_restore \
    -U postgres -d restore_verify --no-owner --no-privileges < "$TARGET/postgres.dump"

TABLES=$(docker exec "$VERIFY_CONTAINER" psql -U postgres -d restore_verify -Atc \
    "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")
[ "$TABLES" -ge 7 ]

EXPECTED_FILES=$(docker exec "$VERIFY_CONTAINER" psql -U postgres -d restore_verify -Atc "select count(*) from user_files")
ACTUAL_FILES=$(find "$TARGET/objects" -type f | wc -l | tr -d ' ')
[ "$ACTUAL_FILES" -ge "$EXPECTED_FILES" ]

printf 'tables=%s user_files=%s objects=%s\n' "$TABLES" "$EXPECTED_FILES" "$ACTUAL_FILES"
