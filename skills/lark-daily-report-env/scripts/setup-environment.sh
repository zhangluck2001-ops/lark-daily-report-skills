#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf 'Setting up lark-daily-report runtime environment...\n'

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '[ACTION REQUIRED] Install Node.js and npm, then rerun this script.\n'
  exit 1
fi

if ! command -v lark-cli >/dev/null 2>&1; then
  printf '[INSTALL] lark-cli\n'
  npm install -g @larksuiteoapi/lark-cli
else
  printf '[OK] lark-cli already installed\n'
fi

if node "$ROOT_DIR/scripts/playwright-runtime.cjs" >/dev/null 2>&1; then
  printf '[OK] Reusing an existing compatible Playwright runtime and Chromium\n'
else
  printf '[INSTALL] Skill-local Node dependencies\n'
  (
    cd "$ROOT_DIR"
    npm install --no-audit --no-fund
  )
fi

if ! node "$ROOT_DIR/scripts/playwright-runtime.cjs" >/dev/null 2>&1; then
  printf '[INSTALL] Playwright Chromium\n'
  (
    cd "$ROOT_DIR"
    PLAYWRIGHT_BROWSERS_URL=https://npmmirror.com/mirrors/playwright npx playwright install chromium
  )
else
  printf '[OK] Compatible Playwright runtime and Chromium are ready\n'
fi

printf '\nAutomatic setup finished.\n'
printf 'Codex in-app Browser is host-provided and cannot be installed by this script.\n'
printf 'When the current Codex host exposes Browser, use it first; otherwise use local Playwright fallback.\n'
printf 'Run: bash scripts/ensure-environment.sh --force\n'
printf 'If login or scopes are missing, follow references/environment-setup.md.\n'
