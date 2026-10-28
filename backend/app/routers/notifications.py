from fastapi import APIRouter, HTTPException, Request

from app.db import get_connection
from app.notifications import NOTIFICATION_CATEGORIES
from app.security import get_session_user_id

router = APIRouter()


@router.get("/notifications")
def get_notifications(request: Request, limit: int = 30):
    user_id = get_session_user_id(request)
    limit = max(1, min(limit, 100))

    with get_connection() as conn:
        rows = conn.execute(
            'SELECT notificatie_id, type, titel, inhoud, activiteit_id, '
            "doel_url, gelezen_op, aangemaakt_op AT TIME ZONE 'UTC' AS aangemaakt_op "
            'FROM "NOTIFICATIE" '
            'WHERE gebruiker_id = %s '
            'ORDER BY aangemaakt_op DESC LIMIT %s',
            (user_id, limit),
        ).fetchall()

    return [
        {
            "id": str(row["notificatie_id"]),
            "type": row["type"],
            "title": row["titel"],
            "body": row["inhoud"] or "",
            "activityId": row["activiteit_id"],
            "targetUrl": row["doel_url"],
            "read": row["gelezen_op"] is not None,
            "createdAt": row["aangemaakt_op"].isoformat() if row["aangemaakt_op"] else None,
        }
        for row in rows
    ]


@router.post("/notifications/read-all")
def mark_all_notifications_read(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        result = conn.execute(
            'UPDATE "NOTIFICATIE" SET gelezen_op = CURRENT_TIMESTAMP '
            'WHERE gebruiker_id = %s AND gelezen_op IS NULL',
            (user_id,),
        )
    return {"status": "ok", "updated": result.rowcount}


@router.get("/notification-preferences")
def get_notification_preferences(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        rows = conn.execute(
            'SELECT categorie, ingeschakeld '
            'FROM "GEBRUIKER_NOTIFICATIEVOORKEUR" '
            'WHERE gebruiker_id = %s AND kanaal = %s',
            (user_id, "in_app"),
        ).fetchall()

    saved = {row["categorie"]: row["ingeschakeld"] for row in rows}
    return {category: saved.get(category, True) for category in sorted(NOTIFICATION_CATEGORIES)}


@router.put("/notification-preferences")
def update_notification_preferences(payload: dict, request: Request):
    user_id = get_session_user_id(request)

    if set(payload) - NOTIFICATION_CATEGORIES:
        raise HTTPException(status_code=400, detail="Onbekende notificatiecategorie.")
    if any(not isinstance(value, bool) for value in payload.values()):
        raise HTTPException(status_code=400, detail="Voorkeuren moeten true of false zijn.")

    with get_connection() as conn:
        for category, enabled in payload.items():
            conn.execute(
                'INSERT INTO "GEBRUIKER_NOTIFICATIEVOORKEUR" '
                '(gebruiker_id, categorie, kanaal, ingeschakeld) '
                'VALUES (%s, %s, %s, %s) '
                'ON CONFLICT (gebruiker_id, categorie, kanaal) '
                'DO UPDATE SET ingeschakeld = EXCLUDED.ingeschakeld',
                (user_id, category, "in_app", enabled),
            )
    return {"status": "ok"}
