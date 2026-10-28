---
name: add-feature
description: The end-to-end pattern for SportConnect features - FastAPI endpoint, Next.js proxy route, frontend fetch, notifications, Dutch messages. Use when adding or changing an API endpoint or a feature that touches both backend and frontend.
---

# Adding a feature

Most features go through these layers in order. Copy the style of nearby code.

## 1. Backend: `backend/app/routers/<area>.py`

Add the endpoint to the router for its area (`@router.get/post/...`); a new area gets its own module, included in `app/main.py`. Request models go in `app/schemas.py`. Add tests in `backend/tests/` and run `backend/run-tests.sh`.

```python
class ThingInput(BaseModel):
    inhoud: str = Field(min_length=1, max_length=4000)   # always bound string lengths

@app.post("/things/{thing_id}")
def do_thing(thing_id: int, data: ThingInput, request: Request):
    user_id = get_session_user_id(request)               # 401 if not logged in
    with get_connection() as conn:
        row = conn.execute('SELECT ... FROM "TABEL" WHERE x = %s FOR UPDATE', (thing_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Niet gevonden.")
        if row["maker_id"] != user_id:
            raise HTTPException(status_code=403, detail="Geen toegang.")
        ...
        create_notification(conn, other_id, "activity_changes", "Titel", "Tekst.", activiteit_id=...)
    return {...}
```

- Always use parameterized SQL (`%s`), never f-strings.
- Check authorization per resource (organizer = `ACTIVITEIT.maker_id`; member = row in `ACTIVITEIT_DEELNEMER`).
- Use `FOR UPDATE` on read-then-write flows (join, capacity, transfer).
- Status codes: 400 bad request, 401 not logged in, 403 not allowed, 404 missing, 409 conflict/state, 422 validation.
- GET endpoints must not write. Note that `_get_activity_chat` currently does; don't copy that.
- For updates, only change the fields the client sent (`model_dump(exclude_unset=True)`). `PUT /activities` has a bug from overwriting everything.
- Paginated lists need `limit` plus a cursor (`before_id`/`after_id`) and must return the newest items, not the oldest.

## 2. Proxy: `frontend/src/app/api/<path>/route.ts`

Follow the existing `cancel/route.ts` shape:
- `await context.params`, check ids with `/^\d+$/`
- forward the `cookie` header and `cache: "no-store"`
- return `{ detail }` with status 502 when the backend is unreachable

(If a catch-all proxy has replaced these per-route files, use that instead and skip this step.)

## 3. Frontend

- Client components (`"use client"`), `fetch("/api/...")`, show `result.detail ?? "<Dutch fallback>"` on error.
- Show errors inline (`role="alert"` paragraph), not with `window.alert`.
- Disable submit buttons while a request is in progress to prevent double submits.
- Remember the `100000 + id` offset on the home page (`page.tsx`).
- Polling: clear intervals and listeners in the effect cleanup, and pause with `document.hidden`.

## 4. Verify

Use the `verify` skill: type check, lint, deploy, then smoke-test both the happy path and the 401/403 paths with the test account.
