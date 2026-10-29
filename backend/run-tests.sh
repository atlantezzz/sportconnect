#!/usr/bin/env bash
# Run the backend API tests in a throwaway container from the api image,
# against the real database, as the two Claude test accounts.
# Usage: backend/run-tests.sh [pytest args]
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${SC_TEST_ENV:-$HOME/.claude/sportconnect-test-account.env}"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

docker compose run --rm --no-deps -T --user root \
  -v "$PWD/backend:/app" -w /app \
  -e SC_TEST_EMAIL -e SC_TEST_PASSWORD -e SC_TEST2_EMAIL -e SC_TEST2_PASSWORD \
  -e RESEND_API_KEY= \
  api sh -c "pip install -q --root-user-action=ignore -r requirements-dev.txt && python -m pytest -q -p no:cacheprovider tests $*"
