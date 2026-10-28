#!/usr/bin/env bash
# Browser checks in headless Chromium against http://localhost:3000:
#   e2e.py    main user flows (login, create via map picker, join, pins, chat panel, settings, ...)
#   audit.py  screenshots of every screen (light/dark, desktop/phone) + axe-core
#             contrast check, console errors and failed requests.
# Needs [TEST] activities for the IDS (first id = an activity of test account 1).
# Usage: tools/ui-audit/run.sh "<id1> <id2> ..."      Output: tools/ui-audit/out/
set -euo pipefail
cd "$(dirname "$0")"
source "${SC_TEST_ENV:-$HOME/.claude/sportconnect-test-account.env}"
mkdir -p out/vendor
[ -s out/vendor/axe.min.js ] || curl -fsS -o out/vendor/axe.min.js https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js
cp audit.py e2e.py out/
docker image inspect sc-playwright >/dev/null 2>&1 || docker build -q -t sc-playwright .
run() { docker run --rm --network host -v "$PWD/out:/work" -e SC_EMAIL="$SC_TEST_EMAIL" -e SC_PASSWORD="$SC_TEST_PASSWORD" \
  -e SC_EMAIL2="$SC_TEST2_EMAIL" -e SC_PASSWORD2="$SC_TEST2_PASSWORD" \
  -e IDS="${1:-}" -e FRIEND_ID=6 sc-playwright python "/work/$2" "${3:-}"; }
run "${1:-}" e2e.py
run "${1:-}" audit.py "$(date +%Y%m%d-%H%M)"
