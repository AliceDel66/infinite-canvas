#!/bin/sh
set -eu

umask 077
set -f
CONFIG_FILE=${INFINITE_CANVAS_DEPLOY_CONFIG:-/etc/infinite-canvas-deploy.conf}
[ "$(id -u)" -eq 0 ] || {
    printf '%s\n' "deployment entrypoint must run as root" >&2
    exit 1
}
[ ! -L "$CONFIG_FILE" ] && [ -f "$CONFIG_FILE" ] && [ -r "$CONFIG_FILE" ] || {
    printf '%s\n' "deployment config is unavailable" >&2
    exit 1
}
[ "$(stat -c '%u:%a' "$CONFIG_FILE")" = "0:600" ] || {
    printf '%s\n' "deployment config permissions are unsafe" >&2
    exit 1
}
. "$CONFIG_FILE"

: "${ALLOWED_REPOSITORY:?Set ALLOWED_REPOSITORY in $CONFIG_FILE}"
RELEASE_ROOT=${RELEASE_ROOT:-/opt/infinite-canvas-releases}
export RELEASE_ROOT
[ -z "${PROJECT_DIR:-}" ] || export PROJECT_DIR
[ -z "${LOCK_FILE:-}" ] || export LOCK_FILE
COMMAND=${SSH_ORIGINAL_COMMAND:-}

if [ "$COMMAND" = "probe" ]; then
    printf '%s\n' "infinite-canvas deploy ready"
    exit 0
fi

set -- $COMMAND
[ "$#" -eq 4 ] && [ "$1" = "deploy" ] || {
    printf '%s\n' "command is not allowed" >&2
    exit 1
}

REPOSITORY=$2
SHA=$3
ACTOR=$4
[ "$REPOSITORY" = "$ALLOWED_REPOSITORY" ] || {
    printf '%s\n' "repository is not allowed" >&2
    exit 1
}
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
case "$ACTOR" in
    "" | *[!A-Za-z0-9_\[\]-]*)
        printf '%s\n' "invalid registry actor" >&2
        exit 1
        ;;
esac

IFS= read -r REGISTRY_TOKEN
[ -n "$REGISTRY_TOKEN" ] || {
    printf '%s\n' "registry token is missing" >&2
    exit 1
}

install -d -m 700 "$RELEASE_ROOT"
RELEASE_DIR="$RELEASE_ROOT/$SHA"
if [ ! -f "$RELEASE_DIR/.source-ready" ]; then
    INCOMING=$(mktemp -d "$RELEASE_ROOT/.incoming-$SHA-XXXXXX")
    cleanup_incoming() {
        rm -rf -- "$INCOMING"
    }
    trap cleanup_incoming EXIT INT TERM
    curl --fail --silent --show-error --location --retry 3 --retry-all-errors \
        --proto '=https' --tlsv1.2 \
        "https://codeload.github.com/$REPOSITORY/tar.gz/$SHA" |
        tar -xz --strip-components=1 -C "$INCOMING"
    [ "$(find "$INCOMING" -type l -print -quit)" = "" ] || {
        printf '%s\n' "deployment bundle contains symlinks" >&2
        exit 1
    }
    [ -f "$INCOMING/docker-compose.yml" ] && [ -f "$INCOMING/deploy/deploy-production.sh" ] || {
        printf '%s\n' "deployment bundle is incomplete" >&2
        exit 1
    }
    touch "$INCOMING/.source-ready"
    [ ! -e "$RELEASE_DIR" ] || {
        printf '%s\n' "release directory already exists but is incomplete" >&2
        exit 1
    }
    mv "$INCOMING" "$RELEASE_DIR"
    trap - EXIT INT TERM
fi

TOKEN_FILE=$(mktemp "$RELEASE_ROOT/.registry-token-XXXXXX")
cleanup_token() {
    rm -f -- "$TOKEN_FILE"
}
trap cleanup_token EXIT INT TERM
printf '%s' "$REGISTRY_TOKEN" > "$TOKEN_FILE"
unset REGISTRY_TOKEN

GHCR_TOKEN_FILE="$TOKEN_FILE" \
GHCR_USERNAME="$ACTOR" \
GITHUB_REPOSITORY="$REPOSITORY" \
    sh "$RELEASE_DIR/deploy/deploy-production.sh" "$SHA" "$RELEASE_DIR"
