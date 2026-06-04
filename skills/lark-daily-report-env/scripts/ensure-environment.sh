#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
STATE_DIR="$STATE_HOME/lark-daily-report-env"
CHECK_VERSION="v2"
STATE_FILE="$STATE_DIR/environment-${CHECK_VERSION}.ok"
MAX_AGE_DAYS="${LARK_DAILY_REPORT_ENV_MAX_AGE_DAYS:-7}"
FORCE=0

if [ "${1:-}" = '--force' ]; then
  FORCE=1
elif [ -n "${1:-}" ]; then
  printf 'Usage: bash scripts/ensure-environment.sh [--force]\n'
  exit 2
fi

state_is_fresh() {
  node - "$STATE_FILE" "$MAX_AGE_DAYS" <<'NODE'
const fs = require('fs');
const [file, maxAgeDays] = process.argv.slice(2);
const content = fs.readFileSync(file, 'utf8');
const checkedAt = content.match(/^checked_at=(.+)$/m)?.[1];
if (!checkedAt) process.exit(1);
const checkedMs = Date.parse(checkedAt);
const maxMs = Number(maxAgeDays) * 24 * 60 * 60 * 1000;
if (!Number.isFinite(checkedMs) || !Number.isFinite(maxMs)) process.exit(1);
process.exit(Date.now() - checkedMs <= maxMs ? 0 : 1);
NODE
}

token_is_usable() {
  command -v lark-cli >/dev/null 2>&1 || return 1
  lark-cli auth status 2>/dev/null | node -e "
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const status = data.identities?.user?.tokenStatus || '';
    process.exit(status === 'valid' || status === 'needs_refresh' ? 0 : 1);
  } catch {
    process.exit(1);
  }
});
"
}

if [ "$FORCE" -eq 0 ] && [ -f "$STATE_FILE" ]; then
  if state_is_fresh && token_is_usable; then
    printf '[OK] Recent environment check is still valid and Feishu login is usable: %s\n' "$STATE_FILE"
    exit 0
  fi
  printf '[INFO] Cached environment check is stale or Feishu login needs refresh; running full check.\n'
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
