---
name: verify
description: Prove a SportConnect change works - type check, lint, API smoke test with the test account, and database check. Use after every code change and before telling the user something is fixed.
---

# Verify a change

Pick the steps that match what changed. Report the real output, including failures.

## 1. Static checks

```bash
cd /opt/sportconnect/frontend
npx --no-install tsc --noEmit --incremental false -p .
npx --no-install eslint src
python3 -m py_compile /opt/sportconnect/backend/app/*.py /opt/sportconnect/backend/app/routers/*.py
/opt/sportconnect/backend/run-tests.sh          # backend API tests (pytest, real DB, cleans up after itself)
```

Baseline as of 2026-10-28 (evening): tsc clean; eslint 13 errors / 14 warnings (errors are `react-hooks/set-state-in-effect`, mostly the duplicated theme loading per page; most warnings are deliberate `window.location.href = "/"` navigations, see CLAUDE.md). Don't add new ones; compare against the baseline instead of calling the old ones yours.

## 2. Deploy

Code only runs after a rebuild. Use the `deploy` skill first.

## 3. API smoke test as the test account

Go through the frontend proxy (`:3000/api/...`) so the proxy route is tested too. Keep the cookie jar in the scratchpad directory.

```bash
source ~/.claude/sportconnect-test-account.env
JAR="$SCRATCHPAD/jar.txt"   # use the session scratchpad path
curl -s -c "$JAR" -H 'Content-Type: application/json' \
  http://127.0.0.1:3000/api/auth/login \
  -d "{\"email\":\"$SC_TEST_EMAIL\",\"wachtwoord\":\"$SC_TEST_PASSWORD\"}"
curl -s -b "$JAR" http://127.0.0.1:3000/api/auth/me
```

Then call the endpoints you changed and check status codes and bodies. Test the unhappy paths too: logged out (401), someone else's resource (403), invalid input (422).

Test account = user id 5, "Claude Testaccount". Some flows need a second user (friends, joining someone else's activity). Register `claude-test2@sportconnect.fit` the same way if needed and save it to the same env file as `SC_TEST2_*`.

## 4. Database check

```bash
sudo docker exec -i sportconnect-db psql -U sportconnect -d sportconnect -c 'SELECT ... LIMIT 20;'
```

## 5. Clean up

Prefix every activity title or message you create with `[TEST]`, and delete or cancel it afterwards. Other people use this database.

## UI changes

Use the `/run` or `claude-in-chrome` skill to view `http://localhost:3000` (localhost, so the Secure cookie works). Check light and dark theme and a ~400px-wide viewport.
