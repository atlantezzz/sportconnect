# SportConnect

Dutch web app for finding and organising sport activities together (map, activities, group chat, friends, private messages, notifications). Owner is a native Dutch speaker; we talk in English, but **everything users see must be Dutch** (informal "je/jij").

## Stack & layout

- `backend/app/` — FastAPI package, raw SQL via psycopg 3 (`dict_row`), no ORM. `main.py` only wires routers; endpoints live in `routers/` (`auth`, `profile` incl. public `/users/{id}`, `friends`, `messages` incl. `/chats`, `activities`, `chat`, `notifications`). Shared: `config.py` (env), `db.py` (connection + SQL snippets `LOCAL_NOW_SQL`, `ACTIVITY_NOT_PAST_SQL`, `AGE_SQL`), `security.py` (session cookie, rate limiters), `schemas.py`, `notifications.py`, `ages.py`, `mailer.py` (Resend, optional `RESEND_API_KEY`).
- `tools/ui-audit/run.sh "<ids>"` — headless Chromium (Playwright in Docker): main user flows plus screenshots of every screen in light/dark, desktop/phone, with an axe-core contrast check, console errors and failed requests. Needs some `[TEST]` activities. Run it after UI changes; the owner re-tests everything after each change.
- `backend/tests/` — pytest API tests (in-process TestClient, real DB, both test accounts). Run `backend/run-tests.sh`; run them after every backend change.
- `frontend/` — Next.js 16 (App Router, Turbopack, Tailwind 4), React 19, react-leaflet. Read `frontend/AGENTS.md`: this Next.js version differs from training data; check `frontend/node_modules/next/dist/docs/` before using unfamiliar APIs.
- `frontend/src/app/api/[...path]/route.ts` — one catch-all proxy that forwards the browser's cookie and client IP to the backend (`API_INTERNAL_URL`, default `http://api:8000`) and passes `Set-Cookie` back. Only the backend areas in `ALLOWED_ROOTS` are reachable; FastAPI's English 422 lists become one Dutch `detail`. Geocode routes (`api/geocode/*`) are separate files. The browser never talks to FastAPI directly.
- `migrations/` — SQL schema: `001`–`007` in order rebuild the live schema (see the `db-migration` skill). `backend/scripts/verwijder_testdata.sql` removes `[TEST]` data.
- `compose.yml` — services `db` (postgres:17), `api` (:8000), `frontend` (:3000), `tunnel` (cloudflared); api/frontend ports bound to 127.0.0.1. Secrets in `.env` (POSTGRES_PASSWORD, SESSION_SECRET, GEOAPIFY_API_KEY, RESEND_API_KEY, CLOUDFLARE_TUNNEL_TOKEN) — never print or copy it, and never put a secret in tracked files.
- **Live** since 2026-10-28 at https://sportconnect.fit (and www) via a Cloudflare Tunnel (`tunnel` service). Routing is set in the Cloudflare dashboard (Zero Trust → Tunnels) to `http://sportconnect-frontend:3000`, so the tunnel must stay on the `backend` Docker network. Anything deployed is public immediately.

## Conventions

- DB tables are quoted uppercase Dutch (`"ACTIVITEIT"`, `"GEBRUIKER"`), columns Dutch snake_case (`activiteit_id`, `starttijd`). API JSON uses the same Dutch keys, except `/notifications`, which uses English camelCase.
- The current user always comes from `get_session_user_id(request)` (signed cookie `sportconnect_session`), never from the request body.
- Errors: `raise HTTPException(status_code=..., detail="<Dutch sentence>.")`; the frontend reads `data.detail`.
- Writes inside `with get_connection() as conn:` commit when the block exits; explicit `conn.commit()` is optional.
- Notify users via `create_notification(conn, user_id, categorie, titel, inhoud, activiteit_id=..., doel_url=...)`, or `create_notifications(conn, [user_ids], ...)` for several recipients in one query; categories are in `NOTIFICATION_CATEGORIES`.
- `get_connection()` hands out a connection from a `psycopg_pool` pool (max 20); always use it as `with get_connection() as conn:`.
- Activity status values: `OPEN`, `GEANNULEERD`. Activity `niveau`: `Alle niveaus`, `Beginner`, `Gemiddeld`, `Gevorderd`.
- `GET /activities` requires login, hides activities that started more than 3 hours ago, and returns cancelled ones only to their organizer and participants. `GET /activities/{id}` uses the same rules (404 otherwise); the settings page loads its activity with it.
- Locations: address search (`/api/geocode/autocomplete`) or a point picked on the map (`LocationMapPicker`, reverse geocoded via `/api/geocode/reverse`, Geoapify); both give the same location shape.
- `/api/auth/me` answers 200 `{user: null}` when logged out (not 401), so the session check doesn't log errors.
- Start times (`"ACTIVITEIT".starttijd`) are Dutch wall-clock time (timestamp without time zone), as the frontend sends them. Every other timestamp column is `timestamptz` (since migration 006), so psycopg returns aware datetimes and the JSON carries an offset; no `AT TIME ZONE` needed.
- Users have `geboortedatum`; APIs return only the computed `leeftijd` (`AGE_SQL`), never the birth date. Minimum age 13.
- Sessions: the cookie carries `"GEBRUIKER".sessie_versie` and every request checks it; a password reset, a password change (`POST /auth/password/change`, keeps the current session) and "overal uitloggen" (`POST /auth/logout-everywhere`) raise it. Password reset: `POST /auth/password-reset/request` (always the same answer) and `/confirm`; links `{APP_URL}/wachtwoord-herstellen?token=…`, valid 60 min, one use, only the SHA-256 hash is stored in `"WACHTWOORD_HERSTEL"`.
- E-mails (welcome, reset, password changed) are built in `app/mailer.py` (table layout, inline styles, logo `frontend/public/email-logo.png`). Test real sends with `delivered@resend.dev`, never with `@sportconnect.fit` addresses (no inbox; bounces hurt the domain).
- Reading a group chat never writes; only posting creates the chat/membership. Group chat notifications go to current participants + organizer.

## Known quirks (don't "fix" silently; mention them)

- Frontend activity IDs are `100000 + activiteit_id` (leftover from sample data); subtract before calling the API.
- Rate limits (login per e-mail/IP, register per IP) are in memory in the single API process; they reset on restart. The client IP comes from `X-Forwarded-For`, set by the Next.js proxy (from `CF-Connecting-IP`).
- `PUT /activities/{id}` only updates fields present in the body (omitted = unchanged, explicit `null` = cleared); `titel`, `starttijd` and `maximaal_aantal_deelnemers` are always required. The settings page uses the same address search as the create form and always sends the full address.
- Sport list and emoji/colours are hardcoded in `frontend/src/data/activities.ts` and must match the `"SPORT"` table names.
- Theme (`data-theme` on `<html>`, localStorage `sportconnect-theme`) and the `/api/auth/me` check are duplicated in each page.
- Navigating to `/` with `router.push("/")` showed an error in the browser (reported 2026-10-28). Cause found 2026-10-29: with `cacheComponents`, Next.js hides pages with React `<Activity>` instead of unmounting them and re-runs effects on return; react-leaflet then reuses its removed map and crashes ("This page couldn't load"). The Leaflet components now render the map only while `useIsShown()` (`src/lib/useIsShown.ts`) is true. Any library that keeps a DOM instance in an effect needs the same treatment. Home links use `router.push("/")` again; only logout still does a full reload (`window.location`), on purpose, so no state of the previous user stays in memory.

## Notion (project management)

Everything we do is logged in Notion, in Dutch, always with the date (`<date start="YYYY-MM-DD" />` mentions plus the date in the heading).

- Project space: https://app.notion.com/p/3f4a792888908164bdd0ea5c2206536d
- Task database "SportConnect — Taken & verbeteringen": data source `collection://2557a0db-657f-4d1e-a593-e8142dd0fe3e` (Taak, Status: Backlog/Te doen/Bezig/Geblokkeerd/Klaar, Prioriteit, Categorie, Type, Toelichting, Deadline, Voltooid).
- **Technische logboek** "Technische voortgang" (`3faa7928889081a5ada0fc087d8a6a43`): all code, database, infra and test work. Append at the **end**: `## DD maand YYYY — onderwerp` + bullets.
- **Ontwerp logboek** (`3f7a7928889081238339e67fb47357e3`): product decisions, screens, UX, copy and visual style. Insert at the **start**: `## Update DD maand YYYY — onderwerp` with `###` subsections and a `### Status` block.
- "Frontend logboek" is older history; don't add to it unless asked.

Rules (from the project space):
- Keep "ontworpen", "geïmplementeerd" and "getest" explicitly separate. Write down what actually happened, including what was *not* done.
- Set a task to **Klaar** only after its acceptance criteria are tested. Don't change a status the user set without asking; annotate instead (`## Opmerking code-review — <datum>`).
- New bugs go in the task database with Verwacht / Werkelijk / Reproduceren / Oorzaak / Voorstel.
- At the end of a work session: update task statuses and both logbooks where relevant.

## Working rules

- Never create `.bak`, `.backup`, `.before-*` copies or update zips; history is in git (`/opt/sportconnect`, branch `main`, remote `origin` = private repo https://github.com/atlantezzz/sportconnect; `gh` is logged in as atlantezzz). `frontend/` is a plain folder in this repo, not a separate repo.
- Never run `docker compose down -v` or anything else that removes the `postgres_data` volume.
- After a change, verify it (the `verify` skill) before saying it works; report failures with output.
- Test accounts: credentials in `~/.claude/sportconnect-test-account.env` (`SC_TEST_*` = user id 5 "Claude Testaccount", `SC_TEST2_*` = user id 6, friends with 5). Mark test data with `[TEST]` and clean it up (`backend/scripts/verwijder_testdata.sql`).
