#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
STATE_DIR="$STATE_HOME/lark-daily-report-env"
CHECK_VERSION="v1"
STATE_FILE="$STATE_DIR/environment-${CHECK_VERSION}.ok"
FORCE=0

if [ "${1:-}" = '--force' ]; then
  FORCE=1
elif [ -n "${1:-}" ]; then
  printf 'Usage: bash scripts/ensure-environment.sh [--force]\n'
  exit 2
fi

if [ "$FORCE" -eq 0 ] && [ -f "$STATE_FILE" ]; then
  printf '[OK] Initial environment check already completed: %s\n' "$STATE_FILE"
  exit 0
fi

printf '[INFO] Running the full lark-daily-report environment check...\n'
if bash "$ROOT_DIR/scripts/check-environment.sh"; then
  if mkdir -p "$STATE_DIR" 2>/dev/null && {
    printf 'checked_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'check_version=%s\n' "$CHECK_VERSION"
  } 2>/dev/null > "$STATE_FILE"; then
    printf '[OK] Recorded successful initial environment check: %s\n' "$STATE_FILE"
  else
    printf '[WARN] Environment passed, but the state marker could not be written: %s\n' "$STATE_FILE"
    printf '[WARN] Future runs will repeat the full check until this path is writable.\n'
  fi
  exit 0
fi

printf '\nEnvironment check failed. Review the missing items before collecting report data.\n'
exit 1
