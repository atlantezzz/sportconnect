# SportConnect

Dutch web app for finding and organising sport activities together (map, activities, group chat, friends, private messages, notifications). Owner is a native Dutch speaker; we talk in English, but **everything users see must be Dutch** (informal "je/jij").

## Stack & layout

- `backend/app/main.py` — FastAPI, single file, raw SQL via psycopg 3 (`dict_row`). No ORM.
- `frontend/` — Next.js 16 (App Router, Turbopack, Tailwind 4), React 19, react-leaflet. Read `frontend/AGENTS.md`: this Next.js version differs from training data; check `frontend/node_modules/next/dist/docs/` before using unfamiliar APIs.
- `frontend/src/app/api/**/route.ts` — thin proxies that forward the browser's cookie to the backend (`API_INTERNAL_URL`, default `http://api:8000`). The browser never talks to FastAPI directly.
- `migrations/` — SQL schema. **Out of date** with the live DB (see the `db-migration` skill).
- `compose.yml` — services `db` (postgres:17), `api` (:8000), `frontend` (:3000); both ports bound to 127.0.0.1. Secrets in `.env` (POSTGRES_PASSWORD, SESSION_SECRET, GEOAPIFY_API_KEY) — never print or copy it.
- Planned public URL: https://sportconnect.fit via a Cloudflare Tunnel to `localhost:3000` (not set up yet).

## Conventions

- DB tables are quoted uppercase Dutch (`"ACTIVITEIT"`, `"GEBRUIKER"`), columns Dutch snake_case (`activiteit_id`, `starttijd`). API JSON uses the same Dutch keys, except `/notifications`, which uses English camelCase.
- The current user always comes from `get_session_user_id(request)` (signed cookie `sportconnect_session`), never from the request body.
- Errors: `raise HTTPException(status_code=..., detail="<Dutch sentence>.")`; the frontend reads `data.detail`.
- Writes inside `with get_connection() as conn:` commit when the block exits; explicit `conn.commit()` is optional.
- Notify users via `create_notification(conn, user_id, categorie, titel, inhoud, activiteit_id=..., doel_url=...)`; categories are in `NOTIFICATION_CATEGORIES`.
- Activity status values: `OPEN`, `GEANNULEERD`.

## Known quirks (don't "fix" silently; mention them)

- Frontend activity IDs are `100000 + activiteit_id` (leftover from sample data); subtract before calling the API.
- `SPORTCONNECT_VRIENDSCHAP` and `SPORTCONNECT_PRIVATBERICHT` are created at runtime by `ensure_*_table()`, not by a migration.
- `PUT /activities/{id}` only updates fields present in the body (omitted = unchanged, explicit `null` = cleared); `titel`, `starttijd` and `maximaal_aantal_deelnemers` are always required. The settings page doesn't send address/coordinates, so changing the location name there leaves the old pin in place.
- Sport list and emoji/colours are hardcoded in `frontend/src/data/activities.ts` and must match the `"SPORT"` table names.
- Theme (`data-theme` on `<html>`, localStorage `sportconnect-theme`) and the `/api/auth/me` check are duplicated in each page.

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
- Public access via Cloudflare / sportconnect.fit is out of scope until the user explicitly asks.
- At the end of a work session: update task statuses and both logbooks where relevant.

## Working rules

- Never create `.bak`, `.backup`, `.before-*` copies or update zips; the project is moving to git for history.
- Never run `docker compose down -v` or anything else that removes the `postgres_data` volume.
- After a change, verify it (the `verify` skill) before saying it works; report failures with output.
- Test account: credentials in `~/.claude/sportconnect-test-account.env` (user id 5, "Claude Testaccount"). Mark test data with `[TEST]` and clean it up.
