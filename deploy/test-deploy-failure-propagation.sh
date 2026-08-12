#!/bin/sh
set -eu

SCRIPT=${1:-deploy/deploy-production.sh}
ENTRYPOINT=${2:-deploy/github-actions-entrypoint.sh}

require_guard() {
    file=$1
    pattern=$2
    grep -F "$pattern" "$file" >/dev/null || {
        printf 'missing explicit failure guard: %s\n' "$pattern" >&2
        exit 1
    }
}

require_guard "$SCRIPT" 'minio-init minio-init || return 1'
require_guard "$SCRIPT" 'migrate migrate || return 1'
require_guard "$SCRIPT" 'wait_healthy api 180 || return 1'
require_guard "$SCRIPT" 'wait_public_health || return 1'
require_guard "$SCRIPT" '"$PROJECT_DIR/deploy/backup.sh" > "$BACKUP_LOG" || {'
require_guard "$ENTRYPOINT" 'cmp -s "$INCOMING/deploy/github-actions-entrypoint.sh" "$0" || {'
require_guard "$ENTRYPOINT" 'git ls-remote --exit-code "https://github.com/$REPOSITORY.git" refs/heads/main'

if grep -F 'backup.sh" | tail' "$SCRIPT" >/dev/null; then
    printf '%s\n' 'backup verification is hidden behind a pipeline' >&2
    exit 1
fi

if grep -F 'mv "$ENTRYPOINT_TMP" /usr/local/sbin/infinite-canvas-github-actions' "$SCRIPT" >/dev/null; then
    printf '%s\n' 'deployment script must not self-update the forced-command entrypoint' >&2
    exit 1
fi

printf '%s\n' 'deployment failure propagation contract passed'
