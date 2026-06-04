#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
MIN_LARK_CLI_VERSION="1.0.46"
REQUIRED_SCOPES="calendar:calendar.event:read vc:meeting.search:read vc:meeting.meetingevent:read vc:note:read vc:record:readonly search:docs:read contact:user.basic_profile:readonly im:message:readonly im:chat:read im:message.p2p_msg:get_as_user im:message.group_msg:get_as_user contact:user.base:readonly docx:document:readonly"
OPTIONAL_SCOPES="task:task:read base:app:read base:record:read"

ok() {
  printf '[OK] %s\n' "$1"
}

missing() {
  printf '[MISSING] %s\n' "$1"
  FAILED=1
}

fix() {
  printf '  FIX: %s\n' "$1"
}

version_lt() {
  node - "$1" "$2" <<'NODE'
const [current, minimum] = process.argv.slice(2);
const parts = value => String(value || '').replace(/^v/, '').split('.').map(part => {
  const match = String(part).match(/\d+/);
  return match ? Number(match[0]) : 0;
});
const left = parts(current);
const right = parts(minimum);
for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
  if ((left[i] || 0) < (right[i] || 0)) process.exit(0);
  if ((left[i] || 0) > (right[i] || 0)) process.exit(1);
}
process.exit(1);
NODE
}

printf 'Checking lark-daily-report runtime environment...\n'

if command -v node >/dev/null 2>&1; then
  ok "Node.js: $(node --version)"
else
  missing 'Node.js is not installed'
  fix 'Install Node.js and npm, then rerun this script.'
fi

if command -v npm >/dev/null 2>&1; then
  ok "npm: $(npm --version)"
else
  missing 'npm is not installed'
  fix 'Install Node.js and npm, then rerun this script.'
fi

if command -v lark-cli >/dev/null 2>&1; then
  ok "lark-cli: $(command -v lark-cli)"
  LARK_CLI_VERSION="$(lark-cli --version 2>/dev/null | node -e "
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const match = input.match(/v?([0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)/);
  console.log(match ? match[1] : '');
});" 2>/dev/null || true)"
  if [ -n "$LARK_CLI_VERSION" ]; then
    if version_lt "$LARK_CLI_VERSION" "$MIN_LARK_CLI_VERSION"; then
      missing "lark-cli version is too old: $LARK_CLI_VERSION < $MIN_LARK_CLI_VERSION"
      fix 'Run: lark-cli update'
    else
      ok "lark-cli version: $LARK_CLI_VERSION"
    fi
  else
    missing 'Unable to detect lark-cli version'
    fix 'Run: lark-cli --version; if it fails, reinstall or update lark-cli.'
  fi

  UPDATE_RESULT="$(lark-cli update --check --json 2>/dev/null || true)"
  UPDATE_ACTION="$(printf '%s' "$UPDATE_RESULT" | node -e "
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    console.log(data.action || '');
  } catch {
    console.log('');
  }
});" 2>/dev/null)"
  if [ "$UPDATE_ACTION" = 'update_available' ]; then
    LATEST_VERSION="$(printf '%s' "$UPDATE_RESULT" | node -e "
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    console.log(data.latest_version || '');
  } catch {
    console.log('');
  }
});" 2>/dev/null)"
    missing "lark-cli update available: ${LARK_CLI_VERSION:-unknown} -> ${LATEST_VERSION:-latest}"
    fix 'Run: lark-cli update'
  elif [ -n "$UPDATE_ACTION" ]; then
    ok "lark-cli update check: $UPDATE_ACTION"
  else
    printf '[INFO] lark-cli update check skipped or unavailable; version floor still checked\n'
  fi

  AUTH_STATUS="$(lark-cli auth status 2>/dev/null || true)"
  TOKEN_STATUS="$(printf '%s' "$AUTH_STATUS" | node -e "
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    console.log(data.identities?.user?.tokenStatus || '');
  } catch {
    console.log('');
  }
});" 2>/dev/null)"

  case "$TOKEN_STATUS" in
    valid|needs_refresh)
      ok "Feishu user login: $TOKEN_STATUS"
      ;;
    *)
      missing 'Feishu user login is missing or expired'
      fix 'Read references/environment-setup.md and run the login command.'
      ;;
  esac

  if [ "$TOKEN_STATUS" = 'valid' ] || [ "$TOKEN_STATUS" = 'needs_refresh' ]; then
    SCOPE_RESULT="$(lark-cli auth check --scope "$REQUIRED_SCOPES" 2>/dev/null || true)"
    SCOPE_OK="$(printf '%s' "$SCOPE_RESULT" | node -e "
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    console.log(data.ok === true ? 'true' : 'false');
  } catch {
    console.log('false');
  }
});" 2>/dev/null)"

    if [ "$SCOPE_OK" = 'true' ]; then
      ok 'Feishu core user scopes'
    else
      missing 'Feishu core user scopes are incomplete'
      printf '%s\n' "$SCOPE_RESULT"
      fix 'Enable missing scopes for the Feishu app, then follow references/environment-setup.md.'
    fi

    OPTIONAL_SCOPE_RESULT="$(lark-cli auth check --scope "$OPTIONAL_SCOPES" 2>/dev/null || true)"
    OPTIONAL_SCOPE_OK="$(printf '%s' "$OPTIONAL_SCOPE_RESULT" | node -e "
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    console.log(data.ok === true ? 'true' : 'false');
  } catch {
    console.log('false');
  }
});" 2>/dev/null)"
    if [ "$OPTIONAL_SCOPE_OK" = 'true' ]; then
      ok 'Feishu optional scopes for tasks and bitables'
    else
      printf '[INFO] Optional scopes may be incomplete; task and bitable clues can be missing\n'
      printf '%s\n' "$OPTIONAL_SCOPE_RESULT"
      fix 'For fuller daily reports, enable optional scopes: task:task:read base:app:read base:record:read'
    fi
  fi
else
  missing 'lark-cli is not installed'
  fix 'Run scripts/setup-environment.sh after user approval.'
fi

if command -v node >/dev/null 2>&1 && RUNTIME_INFO="$(node "$ROOT_DIR/scripts/playwright-runtime.cjs" 2>/dev/null)"; then
  ok "Playwright runtime and Chromium: $RUNTIME_INFO"
else
  missing 'No compatible Playwright runtime and Chromium pair was found'
  fix 'Run scripts/setup-environment.sh after user approval.'
fi

BROWSER_PLUGIN_CACHE="$HOME/.codex/plugins/cache/openai-bundled/browser"
if [ -d "$BROWSER_PLUGIN_CACHE" ]; then
  ok 'Codex in-app Browser plugin cache detected; use it when exposed by the current Codex host'
else
  printf '[INFO] Codex in-app Browser plugin cache not detected; local Playwright fallback remains available\n'
fi

if [ "$FAILED" -eq 0 ]; then
  printf '\nEnvironment check passed.\n'
  exit 0
fi

printf '\nEnvironment check failed. Apply the FIX items and rerun this script.\n'
exit 1
