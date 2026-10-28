from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request

from app.config import LOCAL_TIMEZONE
from app.db import ACTIVITY_NOT_PAST_SQL, get_connection
from app.notifications import create_notification
from app.schemas import ActivityCreate, ActivityUpdate, OrganizerTransfer
from app.security import get_session_user_id

router = APIRouter()


def _require_future(starttijd: datetime):
    # starttijd is Dutch local time without a time zone (as sent by the forms).
    now = datetime.now(ZoneInfo(LOCAL_TIMEZONE)).replace(tzinfo=None)
    start = starttijd.astimezone(ZoneInfo(LOCAL_TIMEZONE)).replace(tzinfo=None) if starttijd.tzinfo else starttijd
    if start <= now:
        raise HTTPException(status_code=422, detail="Kies een datum en starttijd in de toekomst.")


@router.get("/sports")
def get_sports():
    with get_connection() as conn:
        return conn.execute('SELECT sport_id, naam, beschrijving FROM "SPORT" ORDER BY naam').fetchall()


# Columns and joins shared by the activity list and the single-activity endpoint.
_ACTIVITY_SELECT_SQL = '''
    SELECT
        a.activiteit_id, a.maker_id, a.titel, a.beschrijving, a.starttijd,
        a.niveau, a.locatie_naam, a.woonplaats, a.straatnaam, a.huisnummer,
        a.postcode, a.land, a.breedtegraad, a.lengtegraad, a.externe_locatie_id,
        a.maximaal_aantal_deelnemers, a.status,
        s.naam AS sport,
        maker.naam AS organisator_naam,
        ARRAY(
            SELECT g.naam
            FROM "ACTIVITEIT_DEELNEMER" ad
            JOIN "GEBRUIKER" g ON g.gebruiker_id = ad.gebruiker_id
            WHERE ad.activiteit_id = a.activiteit_id
            ORDER BY CASE WHEN ad.rol = 'organisator' THEN 0 ELSE 1 END, ad.deelname_vanaf
        ) AS deelnemers,
        -- same order as deelnemers, so names and ids can be paired
        ARRAY(
            SELECT ad.gebruiker_id
            FROM "ACTIVITEIT_DEELNEMER" ad
            WHERE ad.activiteit_id = a.activiteit_id
            ORDER BY CASE WHEN ad.rol = 'organisator' THEN 0 ELSE 1 END, ad.deelname_vanaf
        ) AS deelnemer_ids,
        (
            SELECT COUNT(*) FROM "ACTIVITEIT_DEELNEMER" ad
            WHERE ad.activiteit_id = a.activiteit_id
        )
        + CASE WHEN EXISTS (
                SELECT 1 FROM "ACTIVITEIT_DEELNEMER" ad
                WHERE ad.activiteit_id = a.activiteit_id AND ad.gebruiker_id = a.maker_id
            ) THEN 0 ELSE 1 END AS aantal_deelnemers
    FROM "ACTIVITEIT" a
    JOIN "SPORT" s ON s.sport_id = a.sport_id
    JOIN "GEBRUIKER" maker ON maker.gebruiker_id = a.maker_id
'''

# Cancelled activities stay visible only to their organizer and participants.
_VISIBLE_TO_USER_SQL = '''
    (
        a.status <> 'GEANNULEERD'
     OR a.maker_id = %(user_id)s
     OR EXISTS (
            SELECT 1 FROM "ACTIVITEIT_DEELNEMER" ad
            WHERE ad.activiteit_id = a.activiteit_id AND ad.gebruiker_id = %(user_id)s
        )
    )
'''


@router.get("/activities")
def get_activities(request: Request):
    """Current activities for logged-in users.

    Activities that started more than a few hours ago are left out. Cancelled
    activities are only returned to their organizer and participants.
    """
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        return conn.execute(
            f'{_ACTIVITY_SELECT_SQL} WHERE {ACTIVITY_NOT_PAST_SQL} AND {_VISIBLE_TO_USER_SQL} ORDER BY a.starttijd',
            {"user_id": user_id},
        ).fetchall()


@router.get("/activities/joined")
def get_joined_activities(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        rows = conn.execute(
            '''
            SELECT activiteit_id FROM "ACTIVITEIT_DEELNEMER" WHERE gebruiker_id = %s
            UNION
            SELECT activiteit_id FROM "ACTIVITEIT" WHERE maker_id = %s
            ''',
            (user_id, user_id),
        ).fetchall()
    return [row["activiteit_id"] for row in rows]


@router.get("/activities/{activity_id}")
def get_activity(activity_id: int, request: Request):
    """One activity, with the same visibility rules as the list."""
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            f'{_ACTIVITY_SELECT_SQL} WHERE a.activiteit_id = %(activity_id)s AND {ACTIVITY_NOT_PAST_SQL} AND {_VISIBLE_TO_USER_SQL}',
            {"user_id": user_id, "activity_id": activity_id},
        ).fetchone()

    if not activity:
        raise HTTPException(status_code=404, detail="Deze activiteit bestaat niet (meer).")
    return activity


@router.post("/activities", status_code=201)
def create_activity(request: Request, activity: ActivityCreate):
    # De organisator wordt uitsluitend uit de ondertekende sessie gehaald.
    maker_id = get_session_user_id(request)
    _require_future(activity.starttijd)

    with get_connection() as conn:
        if not conn.execute('SELECT 1 FROM "GEBRUIKER" WHERE gebruiker_id = %s', (maker_id,)).fetchone():
            raise HTTPException(status_code=401, detail="Account niet gevonden. Log opnieuw in.")
        if not conn.execute('SELECT 1 FROM "SPORT" WHERE sport_id = %s', (activity.sport_id,)).fetchone():
            raise HTTPException(status_code=400, detail="De opgegeven sport bestaat niet.")

        row = conn.execute(
            '''
            INSERT INTO "ACTIVITEIT" (
                maker_id, sport_id, titel, beschrijving, starttijd, niveau,
                locatie_naam, woonplaats, straatnaam, huisnummer,
                postcode, land, breedtegraad, lengtegraad,
                externe_locatie_id, maximaal_aantal_deelnemers,
                status, aangemaakt_op, bijgewerkt_op
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s,
                'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING activiteit_id, titel, sport_id, starttijd, niveau,
                      maximaal_aantal_deelnemers, status
            ''',
            (
                maker_id, activity.sport_id, activity.titel, activity.beschrijving,
                activity.starttijd, activity.niveau, activity.locatie_naam,
                activity.woonplaats, activity.straatnaam, activity.huisnummer,
                activity.postcode, activity.land, activity.breedtegraad,
                activity.lengtegraad, activity.externe_locatie_id,
                activity.maximaal_aantal_deelnemers,
            ),
        ).fetchone()
        conn.execute(
            '''
            INSERT INTO "ACTIVITEIT_DEELNEMER" (activiteit_id, gebruiker_id, deelname_vanaf, rol)
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'organisator')
            ON CONFLICT (activiteit_id, gebruiker_id) DO NOTHING
            ''',
            (row["activiteit_id"], maker_id),
        )
    return row


@router.put("/activities/{activity_id}")
def update_activity(activity_id: int, request: Request, changes: ActivityUpdate):
    user_id = get_session_user_id(request)

    # Only overwrite fields the client actually sent; omitted fields are kept.
    sent_fields = changes.model_dump(exclude_unset=True)
    if "niveau" in sent_fields and sent_fields["niveau"] is None:
        raise HTTPException(status_code=422, detail="Kies een niveau.")
    _require_future(changes.starttijd)

    with get_connection() as conn:
        activity = conn.execute(
            'SELECT maker_id, status FROM "ACTIVITEIT" WHERE activiteit_id = %s FOR UPDATE',
            (activity_id,),
        ).fetchone()
        if not activity:
            raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")
        if activity["maker_id"] != user_id:
            raise HTTPException(status_code=403, detail="Alleen de huidige organisator kan dit wijzigen.")
        if activity["status"] != "OPEN":
            raise HTTPException(status_code=409, detail="Alleen open activiteiten kunnen worden gewijzigd.")

        participant_count = conn.execute(
            '''
            SELECT COUNT(*) AS total FROM (
                SELECT gebruiker_id FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s
                UNION
                SELECT maker_id FROM "ACTIVITEIT" WHERE activiteit_id = %s
            ) participants
            ''',
            (activity_id, activity_id),
        ).fetchone()["total"]
        if changes.maximaal_aantal_deelnemers < participant_count:
            raise HTTPException(
                status_code=400,
                detail=f"De capaciteit kan niet lager zijn dan het huidige aantal deelnemers ({participant_count}).",
            )

        # Column names come from ActivityUpdate, never from user input.
        set_clause = ", ".join(f"{column} = %s" for column in sent_fields)
        updated = conn.execute(
            f'''
            UPDATE "ACTIVITEIT"
            SET {set_clause}, bijgewerkt_op = CURRENT_TIMESTAMP
            WHERE activiteit_id = %s
            RETURNING activiteit_id, titel, beschrijving, starttijd, niveau, locatie_naam,
                      woonplaats, straatnaam, huisnummer, postcode, land, breedtegraad,
                      lengtegraad, externe_locatie_id, maximaal_aantal_deelnemers, status
            ''',
            (*sent_fields.values(), activity_id),
        ).fetchone()

        recipients = conn.execute(
            'SELECT DISTINCT gebruiker_id FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s AND gebruiker_id <> %s',
            (activity_id, user_id),
        ).fetchall()
        for recipient in recipients:
            create_notification(
                conn,
                recipient["gebruiker_id"],
                "activity_changes",
                "Activiteit gewijzigd",
                f'De activiteit "{updated["titel"]}" is gewijzigd.',
                activiteit_id=activity_id,
            )
    return updated


@router.post("/activities/{activity_id}/join")
def join_activity(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            '''
            SELECT maker_id, status, maximaal_aantal_deelnemers, titel
            FROM "ACTIVITEIT" WHERE activiteit_id = %s FOR UPDATE
            ''',
            (activity_id,),
        ).fetchone()
        if not activity:
            raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")
        if activity["status"] != "OPEN":
            raise HTTPException(status_code=400, detail="Deze activiteit is niet beschikbaar.")

        # Registreer de organisator als deelnemer als dat nog niet is gebeurd.
        conn.execute(
            '''
            INSERT INTO "ACTIVITEIT_DEELNEMER" (activiteit_id, gebruiker_id, deelname_vanaf, rol)
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'organisator')
            ON CONFLICT (activiteit_id, gebruiker_id) DO NOTHING
            ''',
            (activity_id, activity["maker_id"]),
        )
        if activity["maker_id"] == user_id:
            return {"joined": True, "organizer": True}

        existing = conn.execute(
            'SELECT 1 FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s AND gebruiker_id = %s',
            (activity_id, user_id),
        ).fetchone()
        if existing:
            return {"joined": True, "already_joined": True}

        count = conn.execute(
            'SELECT COUNT(*) AS total FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s',
            (activity_id,),
        ).fetchone()["total"]
        if count >= activity["maximaal_aantal_deelnemers"]:
            raise HTTPException(status_code=409, detail="Deze activiteit zit vol.")

        conn.execute(
            '''
            INSERT INTO "ACTIVITEIT_DEELNEMER" (activiteit_id, gebruiker_id, deelname_vanaf, rol)
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'deelnemer')
            ''',
            (activity_id, user_id),
        )
        participant = conn.execute('SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (user_id,)).fetchone()
        create_notification(
            conn,
            activity["maker_id"],
            "participants",
            "Nieuwe deelnemer",
            f'{participant["naam"] if participant else "Iemand"} doet mee met "{activity["titel"]}".',
            activiteit_id=activity_id,
        )
    return {"joined": True}


@router.delete("/activities/{activity_id}/join")
def leave_activity(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            'SELECT maker_id, status FROM "ACTIVITEIT" WHERE activiteit_id = %s',
            (activity_id,),
        ).fetchone()
        if not activity:
            raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")
        if activity["maker_id"] == user_id:
            raise HTTPException(status_code=400, detail="De organisator kan niet zelf afmelden.")

        result = conn.execute(
            '''
            DELETE FROM "ACTIVITEIT_DEELNEMER"
            WHERE activiteit_id = %s AND gebruiker_id = %s AND rol IS DISTINCT FROM 'organisator'
            ''',
            (activity_id, user_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Je bent niet aangemeld voor deze activiteit.")

        # Leaving also means leaving the group chat.
        conn.execute(
            '''
            UPDATE "CHATLID" SET verlaten_op = CURRENT_TIMESTAMP
            WHERE gebruiker_id = %s AND verlaten_op IS NULL
              AND chat_id IN (SELECT chat_id FROM "GROEPSCHAT" WHERE activiteit_id = %s)
            ''',
            (user_id, activity_id),
        )
    return {"joined": False}


@router.get("/activities/{activity_id}/members")
def get_activity_members(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute('SELECT maker_id FROM "ACTIVITEIT" WHERE activiteit_id = %s', (activity_id,)).fetchone()
        if not activity:
            raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")
        if activity["maker_id"] != user_id:
            raise HTTPException(status_code=403, detail="Alleen de organisator kan deelnemers beheren.")

        members = conn.execute(
            '''
            SELECT g.gebruiker_id, g.naam, ad.rol
            FROM "ACTIVITEIT_DEELNEMER" ad
            JOIN "GEBRUIKER" g ON g.gebruiker_id = ad.gebruiker_id
            WHERE ad.activiteit_id = %s
            ORDER BY CASE WHEN ad.rol = 'organisator' THEN 0 ELSE 1 END, ad.deelname_vanaf
            ''',
            (activity_id,),
        ).fetchall()
        # Ook oudere activiteiten zonder organisatorrij correct tonen.
        organizer = conn.execute(
            'SELECT gebruiker_id, naam FROM "GEBRUIKER" WHERE gebruiker_id = %s',
            (activity["maker_id"],),
        ).fetchone()

    result = [dict(member) for member in members]
    if organizer and not any(member["gebruiker_id"] == activity["maker_id"] for member in result):
        result.insert(0, {"gebruiker_id": organizer["gebruiker_id"], "naam": organizer["naam"], "rol": "organisator"})
    return result


@router.post("/activities/{activity_id}/transfer-organizer")
def transfer_organizer(activity_id: int, request: Request, transfer: OrganizerTransfer):
    user_id = get_session_user_id(request)
    new_organizer_id = transfer.nieuwe_organisator_id
    if new_organizer_id == user_id:
        raise HTTPException(status_code=400, detail="Je bent al de organisator van deze activiteit.")

    with get_connection() as conn:
        activity = conn.execute(
            'SELECT maker_id, status FROM "ACTIVITEIT" WHERE activiteit_id = %s FOR UPDATE',
            (activity_id,),
        ).fetchone()
        if not activity:
            raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")
        if activity["maker_id"] != user_id:
            raise HTTPException(status_code=403, detail="Alleen de huidige organisator kan overdragen.")
        if activity["status"] != "OPEN":
            raise HTTPException(status_code=409, detail="Een gesloten activiteit kan niet worden overgedragen.")

        target = conn.execute(
            'SELECT 1 FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s AND gebruiker_id = %s',
            (activity_id, new_organizer_id),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=400, detail="De nieuwe organisator moet deelnemer zijn.")

        conn.execute(
            '''
            INSERT INTO "ACTIVITEIT_DEELNEMER" (activiteit_id, gebruiker_id, deelname_vanaf, rol)
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'deelnemer')
            ON CONFLICT (activiteit_id, gebruiker_id) DO NOTHING
            ''',
            (activity_id, user_id),
        )
        conn.execute(
            'UPDATE "ACTIVITEIT_DEELNEMER" SET rol = \'deelnemer\' WHERE activiteit_id = %s AND gebruiker_id = %s',
            (activity_id, user_id),
        )
        conn.execute(
            'UPDATE "ACTIVITEIT" SET maker_id = %s, bijgewerkt_op = CURRENT_TIMESTAMP WHERE activiteit_id = %s',
            (new_organizer_id, activity_id),
        )
        conn.execute(
            '''
            INSERT INTO "ACTIVITEIT_DEELNEMER" (activiteit_id, gebruiker_id, deelname_vanaf, rol)
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'organisator')
            ON CONFLICT (activiteit_id, gebruiker_id) DO UPDATE SET rol = 'organisator'
            ''',
            (activity_id, new_organizer_id),
        )
    return {"transferred": True, "nieuwe_organisator_id": new_organizer_id}


@router.post("/activities/{activity_id}/cancel")
def cancel_activity(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            'SELECT maker_id, status, titel FROM "ACTIVITEIT" WHERE activiteit_id = %s FOR UPDATE',
            (activity_id,),
        ).fetchone()
        if not activity:
            raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")
        if activity["maker_id"] != user_id:
            raise HTTPException(status_code=403, detail="Alleen de huidige organisator kan annuleren.")
        if activity["status"] == "GEANNULEERD":
            return {"cancelled": True}

        conn.execute(
            'UPDATE "ACTIVITEIT" SET status = \'GEANNULEERD\', bijgewerkt_op = CURRENT_TIMESTAMP WHERE activiteit_id = %s',
            (activity_id,),
        )
        recipients = conn.execute(
            'SELECT DISTINCT gebruiker_id FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id = %s AND gebruiker_id <> %s',
            (activity_id, user_id),
        ).fetchall()
        for recipient in recipients:
            create_notification(
                conn,
                recipient["gebruiker_id"],
                "activity_changes",
                "Activiteit geannuleerd",
                f'De activiteit "{activity["titel"]}" is geannuleerd.',
                activiteit_id=activity_id,
            )
    return {"cancelled": True}
