#!/bin/sh
set -eu

umask 077
SHA=${1:-}
RELEASE_DIR=${2:-}
PROJECT_DIR=${PROJECT_DIR:-/opt/infinite-canvas-deploy}
RELEASE_ROOT=${RELEASE_ROOT:-/opt/infinite-canvas-releases}
LOCK_FILE=${LOCK_FILE:-/var/lock/infinite-canvas-deploy.lock}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_DIR")}

[ "${#SHA}" -eq 40 ] || {
    printf '%s\n' "invalid commit sha" >&2
    exit 1
}
case "$SHA" in
    *[!0-9a-f]*)
        printf '%s\n' "invalid commit sha" >&2
        exit 1
        ;;
esac
[ "$RELEASE_DIR" = "$RELEASE_ROOT/$SHA" ] && [ ! -L "$RELEASE_DIR" ] || {
    printf '%s\n' "invalid release directory" >&2
    exit 1
}
[ -f "$RELEASE_DIR/.source-ready" ] && [ -f "$RELEASE_DIR/docker-compose.yml" ] || {
    printf '%s\n' "release source is incomplete" >&2
    exit 1
}
[ ! -L "$PROJECT_DIR/.env" ] && [ -f "$PROJECT_DIR/.env" ] || {
    printf '%s\n' "production environment file is missing" >&2
    exit 1
}
[ "$(stat -c '%u:%a' "$PROJECT_DIR/.env")" = "0:600" ] || {
    printf '%s\n' "production environment permissions are unsafe" >&2
    exit 1
}
: "${GHCR_TOKEN_FILE:?GHCR_TOKEN_FILE is required}"
: "${GHCR_USERNAME:?GHCR_USERNAME is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
[ -s "$GHCR_TOKEN_FILE" ] || {
    printf '%s\n' "registry token is missing" >&2
    exit 1
}

exec 9>"$LOCK_FILE"
flock -n 9 || {
    printf '%s\n' "another deployment is running" >&2
    exit 1
}

set -a
. "$PROJECT_DIR/.env"
set +a

LOWER_REPOSITORY=$(printf '%s' "$GITHUB_REPOSITORY" | tr '[:upper:]' '[:lower:]')
NEW_API_IMAGE_REPOSITORY="ghcr.io/$LOWER_REPOSITORY-api"
NEW_WEB_IMAGE_REPOSITORY="ghcr.io/$LOWER_REPOSITORY-web"
PREVIOUS_TAG=${IMAGE_TAG:-local}
PREVIOUS_API_IMAGE_REPOSITORY=${API_IMAGE_REPOSITORY:-infinite-canvas-api}
PREVIOUS_WEB_IMAGE_REPOSITORY=${WEB_IMAGE_REPOSITORY:-infinite-canvas-web}
BACKUP_ROOT=${BACKUP_ROOT:-/data/backups/infinite-canvas}
HEALTH_URL=${PRODUCTION_HEALTH_URL:-https://canvas.zgonline.top/api/v1/health}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
STATE_DIR="$BACKUP_ROOT/releases/$SHA/$STAMP"
SOURCE_BEFORE="$STATE_DIR/source-before"
ENV_BEFORE="$STATE_DIR/env.before"
DOCKER_CONFIG=$(mktemp -d /run/infinite-canvas-docker-XXXXXX)

cleanup() {
    docker --config "$DOCKER_CONFIG" logout ghcr.io >/dev/null 2>&1 || true
    rm -rf -- "$DOCKER_CONFIG"
}
trap cleanup EXIT INT TERM

compose() {
    docker compose \
        --project-name "$COMPOSE_PROJECT_NAME" \
        --project-directory "$PROJECT_DIR" \
        --env-file "$PROJECT_DIR/.env" \
        -f "$PROJECT_DIR/docker-compose.yml" "$@"
}

release_compose() {
    env \
        API_IMAGE_REPOSITORY="$NEW_API_IMAGE_REPOSITORY" \
        WEB_IMAGE_REPOSITORY="$NEW_WEB_IMAGE_REPOSITORY" \
        IMAGE_TAG="$SHA" \
        docker compose \
            --project-name "$COMPOSE_PROJECT_NAME" \
            --project-directory "$RELEASE_DIR" \
            --env-file "$PROJECT_DIR/.env" \
            -f "$RELEASE_DIR/docker-compose.yml" "$@"
}

wait_healthy() {
    service=$1
    limit=${2:-180}
    attempt=0
    while [ "$attempt" -lt "$limit" ]; do
        container=$(compose ps -q "$service" 2>/dev/null || true)
        if [ -n "$container" ]; then
            state=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || true)
            health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)
            if [ "$state" = "running" ] && { [ "$health" = "healthy" ] || [ "$health" = "none" ]; }; then
                return 0
            fi
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    printf '%s\n' "$service did not become healthy" >&2
    return 1
}

wait_public_health() {
    attempt=0
    while [ "$attempt" -lt 18 ]; do
        if curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 5
    done
    printf '%s\n' "public health check failed: $HEALTH_URL" >&2
    return 1
}

write_release_env() {
    target=$1
    awk '!/^(API_IMAGE_REPOSITORY|WEB_IMAGE_REPOSITORY|IMAGE_TAG)=/' "$ENV_BEFORE" > "$target"
    printf '%s\n' \
        "API_IMAGE_REPOSITORY=$NEW_API_IMAGE_REPOSITORY" \
        "WEB_IMAGE_REPOSITORY=$NEW_WEB_IMAGE_REPOSITORY" \
        "IMAGE_TAG=$SHA" >> "$target"
    chmod 600 "$target"
}

rollback() {
    printf '%s\n' "deployment failed; restoring source and application images" >&2
    rsync -a --delete \
        --exclude .env --exclude .git --exclude .codegraph --exclude node_modules --exclude dist \
        "$SOURCE_BEFORE/" "$PROJECT_DIR/" || return 1
    cp "$ENV_BEFORE" "$PROJECT_DIR/.env" || return 1
    chmod 600 "$PROJECT_DIR/.env" || return 1
    compose up -d --no-build postgres minio || return 1
    wait_healthy postgres 180 || return 1
    wait_healthy minio 180 || return 1
    compose up --no-build --no-deps --abort-on-container-exit --exit-code-from minio-init minio-init || return 1
    compose up --no-build --no-deps --abort-on-container-exit --exit-code-from migrate migrate || return 1
    compose up -d --no-build --no-deps api || return 1
    wait_healthy api 180 || return 1
    compose up -d --no-build --no-deps app || return 1
    wait_healthy app 180 || return 1
    wait_public_health || return 1
    printf '%s\n' "rollback restored $PREVIOUS_API_IMAGE_REPOSITORY:$PREVIOUS_TAG and $PREVIOUS_WEB_IMAGE_REPOSITORY:$PREVIOUS_TAG" >&2
}

install -d -m 700 "$STATE_DIR" "$SOURCE_BEFORE"
cp "$PROJECT_DIR/.env" "$ENV_BEFORE"
chmod 600 "$ENV_BEFORE"
rsync -a --delete \
    --exclude .env --exclude .git --exclude .codegraph --exclude node_modules --exclude dist \
    "$PROJECT_DIR/" "$SOURCE_BEFORE/"

export DOCKER_CONFIG
docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin < "$GHCR_TOKEN_FILE" >/dev/null
release_compose config --quiet
release_compose pull migrate api app

BACKUP_LOG="$STATE_DIR/backup.log"
PROJECT_DIR="$PROJECT_DIR" "$PROJECT_DIR/deploy/backup.sh" > "$BACKUP_LOG" || {
    printf '%s\n' "verified data backup failed" >&2
    exit 1
}
DATA_BACKUP=$(tail -n 1 "$BACKUP_LOG")
[ -n "$DATA_BACKUP" ] && [ -d "$DATA_BACKUP" ] && [ -f "$DATA_BACKUP/postgres.dump" ] && [ -f "$DATA_BACKUP/SHA256SUMS" ] || {
    printf '%s\n' "backup did not return a verified artifact" >&2
    exit 1
}
printf '%s\n' "$DATA_BACKUP" > "$STATE_DIR/data-backup-path"

NEXT_ENV="$STATE_DIR/env.next"
write_release_env "$NEXT_ENV"

deploy_release() {
    rsync -a --delete \
        --exclude .env --exclude .git --exclude .codegraph --exclude node_modules --exclude dist \
        "$RELEASE_DIR/" "$PROJECT_DIR/" || return 1
    cp "$NEXT_ENV" "$PROJECT_DIR/.env" || return 1
    chmod 600 "$PROJECT_DIR/.env" || return 1
    compose config --quiet || return 1
    compose up -d --no-build postgres minio || return 1
    wait_healthy postgres 180 || return 1
    wait_healthy minio 180 || return 1
    compose up --no-build --no-deps --abort-on-container-exit --exit-code-from minio-init minio-init || return 1
    compose up --no-build --no-deps --abort-on-container-exit --exit-code-from migrate migrate || return 1
    compose up -d --no-build --no-deps api || return 1
    wait_healthy api 180 || return 1
    compose up -d --no-build --no-deps app || return 1
    wait_healthy app 180 || return 1
    curl --fail --silent --show-error --max-time 15 "http://127.0.0.1:${APP_PORT:-3000}/api/v1/health" >/dev/null || return 1
    wait_public_health || return 1
}

if ! deploy_release; then
    if ! rollback; then
        printf '%s\n' "automatic rollback failed; use $STATE_DIR for recovery" >&2
    fi
    exit 1
fi

printf '%s\n' "$SHA" > "$STATE_DIR/deployed.sha"
printf '%s\n' "$NEW_API_IMAGE_REPOSITORY:$SHA" "$NEW_WEB_IMAGE_REPOSITORY:$SHA" > "$STATE_DIR/images"

for repository in "$NEW_API_IMAGE_REPOSITORY" "$NEW_WEB_IMAGE_REPOSITORY"; do
    docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' |
        while IFS= read -r image; do
            case "$image" in
                "$repository:$SHA" | "$repository:$PREVIOUS_TAG") ;;
                *) docker image rm "$image" >/dev/null 2>&1 || true ;;
            esac
        done
done
find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} +

printf '%s\n' "deployed $SHA"
