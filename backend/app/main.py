import os
import re
from datetime import datetime, timedelta

import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import FastAPI, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.errors import UniqueViolation

app = FastAPI(title="SportConnect API")

DATABASE_URL = os.environ["DATABASE_URL"]
SESSION_SECRET = os.environ["SESSION_SECRET"]
SESSION_COOKIE = "sportconnect_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

password_hasher = PasswordHasher()
serializer = URLSafeTimedSerializer(
    SESSION_SECRET,
    salt="sportconnect-session",
)


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def create_session_token(user_id: int) -> str:
    return serializer.dumps({"user_id": user_id})


def get_session_user_id(request: Request) -> int:
    token = request.cookies.get(SESSION_COOKIE)

    if not token:
        raise HTTPException(status_code=401, detail="Je bent niet ingelogd.")

    try:
        data = serializer.loads(token, max_age=SESSION_MAX_AGE)
        user_id = data.get("user_id")

        if not isinstance(user_id, int) or user_id <= 0:
            raise HTTPException(
                status_code=401,
                detail="Ongeldige sessie. Log opnieuw in.",
            )

        return user_id
    except (BadSignature, SignatureExpired):
        raise HTTPException(
            status_code=401,
            detail="Je sessie is verlopen. Log opnieuw in.",
        )


def set_session_cookie(response: Response, user_id: int):
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(user_id),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def public_user(user: dict) -> dict:
    return {
        "gebruiker_id": user["gebruiker_id"],
        "naam": user["naam"],
        "email": user["email"],
        "leeftijd": user["leeftijd"],
        "woonplaats": user["woonplaats"],
        "land": user["land"],
    }


class RegisterInput(BaseModel):
    naam: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    wachtwoord: str = Field(min_length=8, max_length=128)
    leeftijd: int = Field(ge=13, le=120)
    woonplaats: str = Field(min_length=2, max_length=100)
    land: str = Field(min_length=2, max_length=100)


class LoginInput(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    wachtwoord: str = Field(min_length=1, max_length=128)


class ActivityCreate(BaseModel):
    sport_id: int = Field(gt=0)
    titel: str = Field(min_length=3, max_length=120)
    beschrijving: str | None = None
    starttijd: datetime
    locatie_naam: str | None = None
    woonplaats: str | None = None
    straatnaam: str | None = Field(default=None, max_length=200)
    huisnummer: str | None = Field(default=None, max_length=30)
    postcode: str | None = Field(default=None, max_length=20)
    land: str | None = Field(default=None, max_length=100)
    breedtegraad: float | None = Field(default=None, ge=-90, le=90)
    lengtegraad: float | None = Field(default=None, ge=-180, le=180)
    externe_locatie_id: str | None = Field(default=None, max_length=255)
    maximaal_aantal_deelnemers: int = Field(ge=2, le=50)




class ActivityUpdate(BaseModel):
    titel: str = Field(min_length=3, max_length=120)
    beschrijving: str | None = None
    starttijd: datetime
    locatie_naam: str | None = None
    woonplaats: str | None = None
    straatnaam: str | None = Field(default=None, max_length=200)
    huisnummer: str | None = Field(default=None, max_length=30)
    postcode: str | None = Field(default=None, max_length=20)
    land: str | None = Field(default=None, max_length=100)
    breedtegraad: float | None = Field(default=None, ge=-90, le=90)
    lengtegraad: float | None = Field(default=None, ge=-180, le=180)
    externe_locatie_id: str | None = Field(default=None, max_length=255)
    maximaal_aantal_deelnemers: int = Field(ge=2, le=50)


class OrganizerTransfer(BaseModel):
    nieuwe_organisator_id: int = Field(gt=0)


# Base64 data URL of a raster image; ~1.5 MB file → ~2 MB of text. No SVG (can carry scripts).
PROFILE_PHOTO_PATTERN = r"^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$"


class ProfileUpdate(BaseModel):
    naam: str | None = Field(default=None, min_length=2, max_length=100)
    woonplaats: str | None = Field(default=None, min_length=2, max_length=100)
    leeftijd: int | None = Field(default=None, ge=13, le=120)
    bio: str | None = Field(default=None, max_length=500)
    profielfoto: str | None = Field(default=None, max_length=2_100_000, pattern=PROFILE_PHOTO_PATTERN)
    profiel_openbaar: bool | None = None
    priveberichten_toestaan: bool | None = None
    favoriete_sporten_tonen: bool | None = None


# Columns that may be cleared with an explicit null.
PROFILE_NULLABLE_FIELDS = {"bio", "profielfoto"}


class SportPreferencesInput(BaseModel):
    favoriet: list[str] = Field(default_factory=list, max_length=50)
    verborgen: list[str] = Field(default_factory=list, max_length=50)


# "GEBRUIKER_SPORTVOORKEUR".voorkeursniveau values
SPORT_LEVEL_FAVORITE = 3
SPORT_LEVEL_HIDDEN = 1






class FriendRequestInput(BaseModel):
    gebruiker_id: int = Field(gt=0)


class FriendResponseInput(BaseModel):
    verzoek_id: int = Field(gt=0)
    accepteren: bool


class PrivateMessageInput(BaseModel):
    inhoud: str = Field(min_length=1, max_length=4000)


class ChatMessageInput(BaseModel):
    inhoud: str = Field(min_length=1, max_length=4000)


def _get_activity_chat(conn, activity_id: int, user_id: int, allow_cancelled: bool = True):
    activity = conn.execute(
        """
        SELECT activiteit_id, maker_id, titel, starttijd, locatie_naam,
               woonplaats, status
        FROM "ACTIVITEIT"
        WHERE activiteit_id = %s
        """,
        (activity_id,),
    ).fetchone()

    if not activity:
        raise HTTPException(status_code=404, detail="Activiteit niet gevonden.")

    # De organisator heeft toegang, ook als oude records geen deelnemersrij hebben.
    is_member = conn.execute(
        """
        SELECT 1
        FROM "ACTIVITEIT_DEELNEMER"
        WHERE activiteit_id = %s AND gebruiker_id = %s
        """,
        (activity_id, user_id),
    ).fetchone()

    if activity["maker_id"] != user_id and not is_member:
        raise HTTPException(
            status_code=403,
            detail="Alleen deelnemers en de organisator hebben toegang tot deze groepschat.",
        )

    if not allow_cancelled and activity["status"] != "OPEN":
        raise HTTPException(
            status_code=409,
            detail="Deze activiteit is gesloten. Nieuwe berichten zijn niet toegestaan.",
        )

    chat = conn.execute(
        """
        INSERT INTO "GROEPSCHAT" (activiteit_id, aangemaakt_op, verloopt_op)
        VALUES (%s, CURRENT_TIMESTAMP, %s)
        ON CONFLICT (activiteit_id) DO NOTHING
        RETURNING chat_id
        """,
        (activity_id, activity["starttijd"] + timedelta(days=7)),
    ).fetchone()

    if chat:
        chat_id = chat["chat_id"]
    else:
        chat = conn.execute(
            """
            SELECT chat_id
            FROM "GROEPSCHAT"
            WHERE activiteit_id = %s
            """,
            (activity_id,),
        ).fetchone()
        if not chat:
            raise HTTPException(status_code=500, detail="De groepschat kon niet worden aangemaakt.")
        chat_id = chat["chat_id"]

    # Nieuwe deelnemers krijgen de volledige historie. Een oude chatlidrij wordt
    # opnieuw actief gemaakt als iemand zich opnieuw aanmeldt.
    conn.execute(
        """
        INSERT INTO "CHATLID" (chat_id, gebruiker_id, toegevoegd_op, verlaten_op)
        VALUES (%s, %s, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT (chat_id, gebruiker_id)
        DO UPDATE SET verlaten_op = NULL
        """,
        (chat_id, user_id),
    )

    return activity, chat_id


@app.get("/activities/{activity_id}/chat")
def get_activity_chat(activity_id: int, request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        activity, chat_id = _get_activity_chat(conn, activity_id, user_id)
    return {"chat_id": chat_id, "activiteit": activity}


@app.get("/activities/{activity_id}/chat/messages")
def get_activity_chat_messages(
    activity_id: int,
    request: Request,
    after_id: int = 0,
    limit: int = 100,
):
    user_id = get_session_user_id(request)
    if after_id < 0:
        raise HTTPException(status_code=422, detail="after_id mag niet negatief zijn.")
    limit = max(1, min(limit, 100))

    with get_connection() as conn:
        _activity, chat_id = _get_activity_chat(conn, activity_id, user_id)
        # after_id = 0: the newest `limit` messages; otherwise the next ones after after_id (polling).
        # Either way the result is sorted oldest -> newest.
        order = "DESC" if after_id == 0 else "ASC"
        rows = conn.execute(
            f"""
            SELECT * FROM (
                SELECT
                    b.bericht_id,
                    b.inhoud,
                    b.verzonden_op,
                    cl.gebruiker_id,
                    g.naam AS afzender_naam
                FROM "BERICHT" b
                JOIN "CHATLID" cl ON cl.chatlid_id = b.chatlid_id
                JOIN "GEBRUIKER" g ON g.gebruiker_id = cl.gebruiker_id
                WHERE b.chat_id = %s
                  AND b.bericht_id > %s
                ORDER BY b.bericht_id {order}
                LIMIT %s
            ) page
            ORDER BY bericht_id ASC
            """,
            (chat_id, after_id, limit),
        ).fetchall()

    return {"messages": rows}


@app.post("/activities/{activity_id}/chat/messages", status_code=201)
def post_activity_chat_message(
    activity_id: int,
    request: Request,
    data: ChatMessageInput,
):
    user_id = get_session_user_id(request)
    inhoud = data.inhoud.strip()
    if not inhoud:
        raise HTTPException(status_code=422, detail="Een bericht mag niet leeg zijn.")

    with get_connection() as conn:
        activity, chat_id = _get_activity_chat(
            conn, activity_id, user_id, allow_cancelled=False
        )
        member = conn.execute(
            """
            SELECT chatlid_id
            FROM "CHATLID"
            WHERE chat_id = %s AND gebruiker_id = %s
            """,
            (chat_id, user_id),
        ).fetchone()
        if not member:
            raise HTTPException(status_code=403, detail="Je bent geen lid van deze chat.")

        message = conn.execute(
            """
            INSERT INTO "BERICHT" (chat_id, chatlid_id, inhoud, verzonden_op)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING bericht_id, inhoud, verzonden_op
            """,
            (chat_id, member["chatlid_id"], inhoud),
        ).fetchone()

        sender = conn.execute(
            'SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s',
            (user_id,),
        ).fetchone()

        recipients = conn.execute(
            'SELECT DISTINCT gebruiker_id FROM "CHATLID" '
            'WHERE chat_id = %s AND gebruiker_id <> %s',
            (chat_id, user_id),
        ).fetchall()

        sender_name = sender["naam"] if sender else "Een deelnemer"
        for recipient in recipients:
            create_notification(
                conn,
                recipient["gebruiker_id"],
                "group_chat",
                "Nieuw groepschatbericht",
                f"{sender_name} heeft een bericht geplaatst.",
                activiteit_id=activity_id,
                bericht_id=message["bericht_id"],
            )

    return {
        **message,
        "gebruiker_id": user_id,
        "afzender_naam": sender["naam"] if sender else "Gebruiker",
    }



# SPORTCONNECT_NOTIFICATION_API_V1
NOTIFICATION_CATEGORIES = {
    "participants",
    "activity_changes",
    "group_chat",
    "private_messages",
    "friend_requests",
    "reminders",
}


def create_notification(
    conn,
    gebruiker_id: int,
    categorie: str,
    titel: str,
    inhoud: str = "",
    activiteit_id=None,
    bericht_id=None,
    doel_url=None,
):
    if categorie not in NOTIFICATION_CATEGORIES:
        raise ValueError("Onbekende notificatiecategorie")

    preference = conn.execute(
        'SELECT ingeschakeld FROM "GEBRUIKER_NOTIFICATIEVOORKEUR" '
        'WHERE gebruiker_id = %s AND categorie = %s AND kanaal = %s',
        (gebruiker_id, categorie, "in_app"),
    ).fetchone()

    # Geen voorkeur opgeslagen betekent standaard ingeschakeld.
    if preference is not None and not preference["ingeschakeld"]:
        return

    if doel_url is None:
        if activiteit_id is not None:
            doel_url = f"/activities/{activiteit_id}/chat"
        elif categorie == "friend_requests":
            doel_url = "/friends"

    conn.execute(
        'INSERT INTO "NOTIFICATIE" '
        '(gebruiker_id, type, titel, inhoud, activiteit_id, bericht_id, doel_url, aangemaakt_op) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)',
        (gebruiker_id, categorie, titel, inhoud, activiteit_id, bericht_id, doel_url),
    )


@app.get("/notifications")
def get_notifications(request: Request, limit: int = 30):
    user_id = get_session_user_id(request)
    limit = max(1, min(limit, 100))

    with get_connection() as conn:
        rows = conn.execute(
            'SELECT notificatie_id, type, titel, inhoud, activiteit_id, '
            'doel_url, gelezen_op, aangemaakt_op FROM "NOTIFICATIE" '
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
            "createdAt": row["aangemaakt_op"].isoformat()
                if row["aangemaakt_op"] else None,
        }
        for row in rows
    ]


@app.post("/notifications/read-all")
def mark_all_notifications_read(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        result = conn.execute(
            'UPDATE "NOTIFICATIE" SET gelezen_op = CURRENT_TIMESTAMP '
            'WHERE gebruiker_id = %s AND gelezen_op IS NULL',
            (user_id,),
        )
        conn.commit()
    return {"status": "ok", "updated": result.rowcount}


@app.get("/notification-preferences")
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
    return {
        category: saved.get(category, True)
        for category in sorted(NOTIFICATION_CATEGORIES)
    }


@app.put("/notification-preferences")
def update_notification_preferences(payload: dict, request: Request):
    user_id = get_session_user_id(request)

    unknown = set(payload) - NOTIFICATION_CATEGORIES
    if unknown:
        raise HTTPException(status_code=400, detail="Onbekende notificatiecategorie")

    if any(not isinstance(value, bool) for value in payload.values()):
        raise HTTPException(status_code=400, detail="Voorkeuren moeten true of false zijn")

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
        conn.commit()

    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-health")
def database_health():
    with get_connection() as conn:
        row = conn.execute(
            "SELECT current_database() AS database"
        ).fetchone()

    return {"status": "connected", "database": row["database"]}


@app.post("/auth/register", status_code=201)
def register(data: RegisterInput, response: Response):
    email = data.email.strip().lower()

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(
            status_code=422,
            detail="Vul een geldig e-mailadres in.",
        )

    naam = data.naam.strip()
    woonplaats = data.woonplaats.strip()
    land = data.land.strip()

    if not naam or not woonplaats or not land:
        raise HTTPException(
            status_code=422,
            detail="Naam, woonplaats en land zijn verplicht.",
        )

    password_hash = password_hasher.hash(data.wachtwoord)

    try:
        with get_connection() as conn:
            user = conn.execute(
                '''
                INSERT INTO "GEBRUIKER" (
                    naam, leeftijd, email, wachtwoord_hash,
                    woonplaats, land, aangemaakt_op, bijgewerkt_op
                )
                VALUES (%s, %s, %s, %s, %s, %s,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING gebruiker_id, naam, email, leeftijd, woonplaats, land
                ''',
                (
                    naam,
                    data.leeftijd,
                    email,
                    password_hash,
                    woonplaats,
                    land,
                ),
            ).fetchone()
    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="Er bestaat al een account met dit e-mailadres.",
        )

    set_session_cookie(response, user["gebruiker_id"])
    return {"user": public_user(user)}


@app.post("/auth/login")
def login(data: LoginInput, response: Response):
    email = data.email.strip().lower()

    with get_connection() as conn:
        user = conn.execute(
            '''
            SELECT gebruiker_id, naam, email, leeftijd, woonplaats,
                   land, wachtwoord_hash
            FROM "GEBRUIKER"
            WHERE email = %s
            ''',
            (email,),
        ).fetchone()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="E-mailadres of wachtwoord is onjuist.",
        )

    try:
        password_hasher.verify(user["wachtwoord_hash"], data.wachtwoord)
    except (VerifyMismatchError, VerificationError):
        raise HTTPException(
            status_code=401,
            detail="E-mailadres of wachtwoord is onjuist.",
        )

    set_session_cookie(response, user["gebruiker_id"])
    return {"user": public_user(user)}


@app.get("/auth/me")
def current_user(request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        user = conn.execute(
            '''
            SELECT gebruiker_id, naam, email, leeftijd, woonplaats, land
            FROM "GEBRUIKER"
            WHERE gebruiker_id = %s
            ''',
            (user_id,),
        ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Account niet gevonden.")

    return {"user": public_user(user)}


@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
    )
    return {"status": "ok"}


def _sport_preferences(conn, user_id: int) -> dict:
    rows = conn.execute(
        '''
        SELECT s.naam, v.voorkeursniveau
        FROM "GEBRUIKER_SPORTVOORKEUR" v
        JOIN "SPORT" s ON s.sport_id = v.sport_id
        WHERE v.gebruiker_id = %s
        ORDER BY s.naam
        ''',
        (user_id,),
    ).fetchall()
    return {
        "favoriet": [r["naam"] for r in rows if r["voorkeursniveau"] == SPORT_LEVEL_FAVORITE],
        "verborgen": [r["naam"] for r in rows if r["voorkeursniveau"] == SPORT_LEVEL_HIDDEN],
    }


def _own_profile(conn, user_id: int) -> dict:
    profile = conn.execute(
        '''
        SELECT gebruiker_id, naam, email, leeftijd, woonplaats, land, bio,
               profielfoto, profiel_openbaar, priveberichten_toestaan,
               favoriete_sporten_tonen
        FROM "GEBRUIKER"
        WHERE gebruiker_id = %s
        ''',
        (user_id,),
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=401, detail="Account niet gevonden.")
    return {**profile, "sporten": _sport_preferences(conn, user_id)}


@app.get("/profile")
def get_profile(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        return _own_profile(conn, user_id)


@app.put("/profile")
def update_profile(changes: ProfileUpdate, request: Request):
    user_id = get_session_user_id(request)

    # Only fields the client sent are changed; null only clears optional fields.
    sent_fields = changes.model_dump(exclude_unset=True)
    for column, value in sent_fields.items():
        if isinstance(value, str):
            value = sent_fields[column] = value.strip() or None
        if value is None and column not in PROFILE_NULLABLE_FIELDS:
            raise HTTPException(status_code=422, detail="Naam, woonplaats, leeftijd en privacykeuzes mogen niet leeg zijn.")

    with get_connection() as conn:
        if sent_fields:
            # Column names come from ProfileUpdate, never from user input.
            set_clause = ", ".join(f"{column} = %s" for column in sent_fields)
            conn.execute(
                f'UPDATE "GEBRUIKER" SET {set_clause}, bijgewerkt_op = CURRENT_TIMESTAMP WHERE gebruiker_id = %s',
                (*sent_fields.values(), user_id),
            )
        return _own_profile(conn, user_id)


@app.put("/profile/sport-preferences")
def update_sport_preferences(preferences: SportPreferencesInput, request: Request):
    user_id = get_session_user_id(request)
    favorite = set(preferences.favoriet)
    hidden = set(preferences.verborgen)
    if favorite & hidden:
        raise HTTPException(status_code=422, detail="Een sport kan niet tegelijk favoriet en verborgen zijn.")

    with get_connection() as conn:
        sport_ids = {
            row["naam"]: row["sport_id"]
            for row in conn.execute(
                'SELECT sport_id, naam FROM "SPORT" WHERE naam = ANY(%s)',
                (list(favorite | hidden),),
            ).fetchall()
        }
        unknown = (favorite | hidden) - sport_ids.keys()
        if unknown:
            raise HTTPException(status_code=422, detail=f"Onbekende sport: {', '.join(sorted(unknown))}.")

        conn.execute('DELETE FROM "GEBRUIKER_SPORTVOORKEUR" WHERE gebruiker_id = %s', (user_id,))
        for names, level in ((favorite, SPORT_LEVEL_FAVORITE), (hidden, SPORT_LEVEL_HIDDEN)):
            for name in names:
                conn.execute(
                    'INSERT INTO "GEBRUIKER_SPORTVOORKEUR" (gebruiker_id, sport_id, voorkeursniveau) VALUES (%s, %s, %s)',
                    (user_id, sport_ids[name], level),
                )
        return _sport_preferences(conn, user_id)



def ensure_friendship_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS "SPORTCONNECT_VRIENDSCHAP" (
            vriendschap_id BIGSERIAL PRIMARY KEY,
            gebruiker_laag_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
            gebruiker_hoog_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
            aangevraagd_door BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
            status VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined')),
            aangemaakt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            bijgewerkt_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (gebruiker_laag_id < gebruiker_hoog_id),
            UNIQUE (gebruiker_laag_id, gebruiker_hoog_id)
        )
    """)
    conn.commit()


@app.get("/friends")
def get_friends(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        ensure_friendship_table(conn)
        friends = conn.execute("""
            SELECT g.gebruiker_id, g.naam, g.woonplaats
            FROM "SPORTCONNECT_VRIENDSCHAP" v
            JOIN "GEBRUIKER" g ON g.gebruiker_id =
                CASE WHEN v.gebruiker_laag_id = %s THEN v.gebruiker_hoog_id ELSE v.gebruiker_laag_id END
            WHERE (v.gebruiker_laag_id = %s OR v.gebruiker_hoog_id = %s)
              AND v.status = 'accepted'
            ORDER BY g.naam
        """, (user_id, user_id, user_id)).fetchall()
        requests_in = conn.execute("""
            SELECT v.vriendschap_id AS verzoek_id, g.gebruiker_id, g.naam, g.woonplaats, v.aangemaakt_op
            FROM "SPORTCONNECT_VRIENDSCHAP" v
            JOIN "GEBRUIKER" g ON g.gebruiker_id = v.aangevraagd_door
            WHERE (v.gebruiker_laag_id = %s OR v.gebruiker_hoog_id = %s)
              AND v.status = 'pending' AND v.aangevraagd_door <> %s
            ORDER BY v.aangemaakt_op DESC
        """, (user_id, user_id, user_id)).fetchall()
        requests_out = conn.execute("""
            SELECT v.vriendschap_id AS verzoek_id, g.gebruiker_id, g.naam, g.woonplaats, v.aangemaakt_op
            FROM "SPORTCONNECT_VRIENDSCHAP" v
            JOIN "GEBRUIKER" g ON g.gebruiker_id =
                CASE WHEN v.gebruiker_laag_id = %s THEN v.gebruiker_hoog_id ELSE v.gebruiker_laag_id END
            WHERE (v.gebruiker_laag_id = %s OR v.gebruiker_hoog_id = %s)
              AND v.status = 'pending' AND v.aangevraagd_door = %s
            ORDER BY v.aangemaakt_op DESC
        """, (user_id, user_id, user_id, user_id)).fetchall()
    return {"friends": friends, "incoming": requests_in, "outgoing": requests_out}


@app.get("/friends/search")
def search_users(request: Request, q: str = ""):
    user_id = get_session_user_id(request)
    query = q.strip()
    if len(query) < 2:
        return {"users": []}
    with get_connection() as conn:
        ensure_friendship_table(conn)
        rows = conn.execute("""
            SELECT g.gebruiker_id, g.naam,
                   -- private profiles only show their town to friends
                   CASE WHEN g.profiel_openbaar OR v.status = 'accepted' THEN g.woonplaats END AS woonplaats,
                   v.status AS vriendschapsstatus,
                   CASE WHEN v.aangevraagd_door = %s THEN 'sent' ELSE 'received' END AS richting
            FROM "GEBRUIKER" g
            LEFT JOIN "SPORTCONNECT_VRIENDSCHAP" v
              ON (v.gebruiker_laag_id = LEAST(g.gebruiker_id, %s)
              AND v.gebruiker_hoog_id = GREATEST(g.gebruiker_id, %s))
            WHERE g.gebruiker_id <> %s
              AND g.naam ILIKE %s
            ORDER BY g.naam
            LIMIT 20
        """, (user_id, user_id, user_id, user_id, f"%{query}%")).fetchall()
    return {"users": rows}


@app.post("/friends/request")
def request_friendship(payload: FriendRequestInput, request: Request):
    user_id = get_session_user_id(request)
    if payload.gebruiker_id == user_id:
        raise HTTPException(status_code=400, detail="Je kunt jezelf niet toevoegen.")
    low, high = sorted((user_id, payload.gebruiker_id))
    with get_connection() as conn:
        ensure_friendship_table(conn)
        exists = conn.execute('SELECT gebruiker_id FROM "GEBRUIKER" WHERE gebruiker_id = %s', (payload.gebruiker_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Gebruiker niet gevonden.")
        existing = conn.execute('SELECT status FROM "SPORTCONNECT_VRIENDSCHAP" WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s', (low, high)).fetchone()
        if existing:
            if existing["status"] == "accepted":
                raise HTTPException(status_code=409, detail="Jullie zijn al vrienden.")
            if existing["status"] == "pending":
                raise HTTPException(status_code=409, detail="Er staat al een vriendschapsverzoek open.")
            conn.execute('DELETE FROM "SPORTCONNECT_VRIENDSCHAP" WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s', (low, high))
        conn.execute('INSERT INTO "SPORTCONNECT_VRIENDSCHAP" (gebruiker_laag_id, gebruiker_hoog_id, aangevraagd_door, status) VALUES (%s, %s, %s, \'pending\')', (low, high, user_id))
        requester = conn.execute(
            'SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s',
            (user_id,),
        ).fetchone()
        create_notification(
            conn,
            payload.gebruiker_id,
            "friend_requests",
            "Nieuw vriendschapsverzoek",
            f'{requester["naam"] if requester else "Een gebruiker"} wil vrienden met je worden.',
        )
        conn.commit()
    return {"status": "pending"}


@app.post("/friends/respond")
def respond_friendship(payload: FriendResponseInput, request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        ensure_friendship_table(conn)
        row = conn.execute('SELECT * FROM "SPORTCONNECT_VRIENDSCHAP" WHERE vriendschap_id = %s', (payload.verzoek_id,)).fetchone()
        if not row or row["status"] != "pending":
            raise HTTPException(status_code=404, detail="Verzoek niet gevonden.")
        if user_id == row["aangevraagd_door"]:
            raise HTTPException(status_code=403, detail="Je kunt je eigen verzoek niet beantwoorden.")
        if user_id not in (row["gebruiker_laag_id"], row["gebruiker_hoog_id"]):
            raise HTTPException(status_code=403, detail="Geen toegang tot dit verzoek.")
        conn.execute('UPDATE "SPORTCONNECT_VRIENDSCHAP" SET status = %s, bijgewerkt_op = NOW() WHERE vriendschap_id = %s', ("accepted" if payload.accepteren else "declined", payload.verzoek_id))
        conn.commit()
    return {"status": "accepted" if payload.accepteren else "declined"}


@app.delete("/friends/{friend_user_id}")
def remove_friend(friend_user_id: int, request: Request):
    user_id = get_session_user_id(request)
    if friend_user_id == user_id:
        raise HTTPException(status_code=400, detail="Ongeldige gebruiker.")
    low, high = sorted((user_id, friend_user_id))
    with get_connection() as conn:
        ensure_friendship_table(conn)
        conn.execute('DELETE FROM "SPORTCONNECT_VRIENDSCHAP" WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s', (low, high))
        conn.commit()
    return {"status": "removed"}



def ensure_private_messages_table(conn):
    conn.execute('''
        CREATE TABLE IF NOT EXISTS "SPORTCONNECT_PRIVATBERICHT" (
            bericht_id BIGSERIAL PRIMARY KEY,
            afzender_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
            ontvanger_id BIGINT NOT NULL REFERENCES "GEBRUIKER"(gebruiker_id) ON DELETE CASCADE,
            inhoud TEXT NOT NULL CHECK (char_length(trim(inhoud)) BETWEEN 1 AND 4000),
            verzonden_op TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (afzender_id <> ontvanger_id)
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS "idx_sc_privmsg_pair" ON "SPORTCONNECT_PRIVATBERICHT" (afzender_id, ontvanger_id, bericht_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS "idx_sc_privmsg_reverse_pair" ON "SPORTCONNECT_PRIVATBERICHT" (ontvanger_id, afzender_id, bericht_id)')
    conn.commit()

def require_friendship(conn, user_id: int, friend_user_id: int):
    low, high = sorted((user_id, friend_user_id))
    row = conn.execute('''
        SELECT status FROM "SPORTCONNECT_VRIENDSCHAP"
        WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s
    ''', (low, high)).fetchone()
    if not row or row["status"] != "accepted":
        raise HTTPException(status_code=403, detail="Privéberichten zijn alleen beschikbaar tussen vrienden.")

@app.get("/messages/{friend_user_id}")
def get_private_messages(friend_user_id: int, request: Request, after_id: int = 0, limit: int = 100):
    user_id = get_session_user_id(request)
    if friend_user_id == user_id:
        raise HTTPException(status_code=400, detail="Je kunt geen gesprek met jezelf openen.")
    with get_connection() as conn:
        ensure_friendship_table(conn)
        require_friendship(conn, user_id, friend_user_id)
        ensure_private_messages_table(conn)
        friend = conn.execute('SELECT gebruiker_id, naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (friend_user_id,)).fetchone()
        if not friend:
            raise HTTPException(status_code=404, detail="Gebruiker niet gevonden.")
        # after_id = 0: the newest `limit` messages; otherwise the next ones after after_id (polling).
        # Either way the result is sorted oldest -> newest.
        newest_first = after_id <= 0
        messages = conn.execute(f'''
            SELECT * FROM (
                SELECT b.bericht_id, b.afzender_id, b.ontvanger_id, b.inhoud, b.verzonden_op, g.naam AS afzender_naam
                FROM "SPORTCONNECT_PRIVATBERICHT" b
                JOIN "GEBRUIKER" g ON g.gebruiker_id = b.afzender_id
                WHERE ((b.afzender_id = %s AND b.ontvanger_id = %s) OR (b.afzender_id = %s AND b.ontvanger_id = %s))
                  AND b.bericht_id > %s
                ORDER BY b.bericht_id {"DESC" if newest_first else "ASC"} LIMIT %s
            ) page
            ORDER BY bericht_id ASC
        ''', (user_id, friend_user_id, friend_user_id, user_id, max(0, after_id), max(1, min(limit, 200)))).fetchall()
    return {"friend": friend, "messages": messages}

@app.post("/messages/{friend_user_id}")
def send_private_message(friend_user_id: int, payload: PrivateMessageInput, request: Request):
    user_id = get_session_user_id(request)
    inhoud = payload.inhoud.strip()
    if not inhoud:
        raise HTTPException(status_code=422, detail="Een bericht mag niet leeg zijn.")
    if friend_user_id == user_id:
        raise HTTPException(status_code=400, detail="Je kunt geen bericht naar jezelf sturen.")
    with get_connection() as conn:
        ensure_friendship_table(conn)
        require_friendship(conn, user_id, friend_user_id)
        ensure_private_messages_table(conn)
        recipient = conn.execute('SELECT gebruiker_id, priveberichten_toestaan FROM "GEBRUIKER" WHERE gebruiker_id = %s', (friend_user_id,)).fetchone()
        if not recipient:
            raise HTTPException(status_code=404, detail="Gebruiker niet gevonden.")
        if not recipient["priveberichten_toestaan"]:
            raise HTTPException(status_code=403, detail="Deze gebruiker ontvangt op dit moment geen privéberichten.")
        message = conn.execute('''
            INSERT INTO "SPORTCONNECT_PRIVATBERICHT" (afzender_id, ontvanger_id, inhoud)
            VALUES (%s, %s, %s)
            RETURNING bericht_id, afzender_id, ontvanger_id, inhoud, verzonden_op
        ''', (user_id, friend_user_id, inhoud)).fetchone()
        sender = conn.execute('SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (user_id,)).fetchone()
        create_notification(
            conn,
            friend_user_id,
            "private_messages",
            "Nieuw privébericht",
            f'{sender["naam"] if sender else "Een gebruiker"} heeft je een bericht gestuurd.',
            doel_url=f"/messages/{user_id}",
        )
        conn.commit()
    return {**message, "afzender_naam": sender["naam"]}



@app.get("/sports")
def get_sports():
    with get_connection() as conn:
        rows = conn.execute(
            'SELECT sport_id, naam, beschrijving FROM "SPORT" ORDER BY naam'
        ).fetchall()

    return rows


@app.get("/activities")
def get_activities():
    with get_connection() as conn:
        rows = conn.execute(
            '''
            SELECT
                a.activiteit_id,
                a.maker_id,
                a.titel,
                a.beschrijving,
                a.starttijd,
                a.locatie_naam,
                a.woonplaats,
                a.straatnaam,
                a.huisnummer,
                a.postcode,
                a.land,
                a.breedtegraad,
                a.lengtegraad,
                a.externe_locatie_id,
                a.maximaal_aantal_deelnemers,
                a.status,
                s.naam AS sport,
                (
                    SELECT g.naam
                    FROM "GEBRUIKER" g
                    WHERE g.gebruiker_id = a.maker_id
                ) AS organisator_naam,
                ARRAY(
                    SELECT g.naam
                    FROM "ACTIVITEIT_DEELNEMER" ad
                    JOIN "GEBRUIKER" g
                      ON g.gebruiker_id = ad.gebruiker_id
                    WHERE ad.activiteit_id = a.activiteit_id
                    ORDER BY
                        CASE WHEN ad.rol = 'organisator' THEN 0 ELSE 1 END,
                        ad.deelname_vanaf
                ) AS deelnemers,
                (
                    SELECT COUNT(*)
                    FROM "ACTIVITEIT_DEELNEMER" ad
                    WHERE ad.activiteit_id = a.activiteit_id
                )
                + CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM "ACTIVITEIT_DEELNEMER" ad
                        WHERE ad.activiteit_id = a.activiteit_id
                          AND ad.gebruiker_id = a.maker_id
                    )
                    THEN 0
                    ELSE 1
                  END AS aantal_deelnemers
            FROM "ACTIVITEIT" a
            JOIN "SPORT" s ON s.sport_id = a.sport_id
            ORDER BY a.starttijd
            '''
        ).fetchall()

    return rows


@app.get("/activities/joined")
def get_joined_activities(request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        rows = conn.execute(
            '''
            SELECT activiteit_id
            FROM "ACTIVITEIT_DEELNEMER"
            WHERE gebruiker_id = %s

            UNION

            SELECT activiteit_id
            FROM "ACTIVITEIT"
            WHERE maker_id = %s
            ''',
            (user_id, user_id),
        ).fetchall()

    return [row["activiteit_id"] for row in rows]


@app.post("/activities/{activity_id}/join")
def join_activity(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            '''
            SELECT maker_id, status, maximaal_aantal_deelnemers
            FROM "ACTIVITEIT"
            WHERE activiteit_id = %s
            FOR UPDATE
            ''',
            (activity_id,),
        ).fetchone()

        if not activity:
            raise HTTPException(
                status_code=404,
                detail="Activiteit niet gevonden.",
            )

        if activity["status"] != "OPEN":
            raise HTTPException(
                status_code=400,
                detail="Deze activiteit is niet beschikbaar.",
            )

        # Registreer de organisator als deelnemer als dat nog niet is gebeurd.
        conn.execute(
            '''
            INSERT INTO "ACTIVITEIT_DEELNEMER" (
                activiteit_id, gebruiker_id, deelname_vanaf, rol
            )
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'organisator')
            ON CONFLICT (activiteit_id, gebruiker_id) DO NOTHING
            ''',
            (activity_id, activity["maker_id"]),
        )

        if activity["maker_id"] == user_id:
            return {"joined": True, "organizer": True}

        existing = conn.execute(
            '''
            SELECT 1
            FROM "ACTIVITEIT_DEELNEMER"
            WHERE activiteit_id = %s AND gebruiker_id = %s
            ''',
            (activity_id, user_id),
        ).fetchone()

        if existing:
            return {"joined": True, "already_joined": True}

        count = conn.execute(
            '''
            SELECT COUNT(*) AS total
            FROM "ACTIVITEIT_DEELNEMER"
            WHERE activiteit_id = %s
            ''',
            (activity_id,),
        ).fetchone()["total"]

        if count >= activity["maximaal_aantal_deelnemers"]:
            raise HTTPException(
                status_code=409,
                detail="Deze activiteit zit vol.",
            )

        conn.execute(
            '''
            INSERT INTO "ACTIVITEIT_DEELNEMER" (
                activiteit_id, gebruiker_id, deelname_vanaf, rol
            )
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'deelnemer')
            ''',
            (activity_id, user_id),
        )

        if activity["maker_id"] != user_id:
            create_notification(
                conn,
                activity["maker_id"],
                "participants",
                "Nieuwe deelnemer",
                "Iemand heeft zich aangemeld voor je activiteit.",
                activiteit_id=activity_id,
            )

    return {"joined": True}


@app.delete("/activities/{activity_id}/join")
def leave_activity(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            '''
            SELECT maker_id, status
            FROM "ACTIVITEIT"
            WHERE activiteit_id = %s
            ''',
            (activity_id,),
        ).fetchone()

        if not activity:
            raise HTTPException(
                status_code=404,
                detail="Activiteit niet gevonden.",
            )

        if activity["maker_id"] == user_id:
            raise HTTPException(
                status_code=400,
                detail="De organisator kan niet zelf afmelden.",
            )

        result = conn.execute(
            '''
            DELETE FROM "ACTIVITEIT_DEELNEMER"
            WHERE activiteit_id = %s
              AND gebruiker_id = %s
              AND rol IS DISTINCT FROM 'organisator'
            ''',
            (activity_id, user_id),
        )

        if result.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Je bent niet aangemeld voor deze activiteit.",
            )

    return {"joined": False}



@app.get("/activities/{activity_id}/members")
def get_activity_members(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            """
            SELECT maker_id
            FROM "ACTIVITEIT"
            WHERE activiteit_id = %s
            """,
            (activity_id,),
        ).fetchone()

        if not activity:
            raise HTTPException(
                status_code=404,
                detail="Activiteit niet gevonden.",
            )

        if activity["maker_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="Alleen de organisator kan deelnemers beheren.",
            )

        members = conn.execute(
            """
            SELECT
                g.gebruiker_id,
                g.naam,
                ad.rol
            FROM "ACTIVITEIT_DEELNEMER" ad
            JOIN "GEBRUIKER" g
              ON g.gebruiker_id = ad.gebruiker_id
            WHERE ad.activiteit_id = %s
            ORDER BY
                CASE WHEN ad.rol = 'organisator' THEN 0 ELSE 1 END,
                ad.deelname_vanaf
            """,
            (activity_id,),
        ).fetchall()

        # Ook oudere activiteiten zonder organisatorrij correct tonen.
        organizer = conn.execute(
            """
            SELECT gebruiker_id, naam
            FROM "GEBRUIKER"
            WHERE gebruiker_id = %s
            """,
            (activity["maker_id"],),
        ).fetchone()

        result = [dict(member) for member in members]
        if organizer and not any(
            member["gebruiker_id"] == activity["maker_id"]
            for member in result
        ):
            result.insert(
                0,
                {
                    "gebruiker_id": organizer["gebruiker_id"],
                    "naam": organizer["naam"],
                    "rol": "organisator",
                },
            )

    return result


@app.put("/activities/{activity_id}")
def update_activity(
    activity_id: int,
    request: Request,
    changes: ActivityUpdate,
):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            """
            SELECT maker_id, status
            FROM "ACTIVITEIT"
            WHERE activiteit_id = %s
            FOR UPDATE
            """,
            (activity_id,),
        ).fetchone()

        if not activity:
            raise HTTPException(
                status_code=404,
                detail="Activiteit niet gevonden.",
            )

        if activity["maker_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="Alleen de huidige organisator kan dit wijzigen.",
            )

        if activity["status"] != "OPEN":
            raise HTTPException(
                status_code=409,
                detail="Alleen open activiteiten kunnen worden gewijzigd.",
            )

        participant_count = conn.execute(
            """
            SELECT COUNT(*) AS total
            FROM (
                SELECT gebruiker_id
                FROM "ACTIVITEIT_DEELNEMER"
                WHERE activiteit_id = %s

                UNION

                SELECT maker_id
                FROM "ACTIVITEIT"
                WHERE activiteit_id = %s
            ) participants
            """,
            (activity_id, activity_id),
        ).fetchone()["total"]

        if changes.maximaal_aantal_deelnemers < participant_count:
            raise HTTPException(
                status_code=400,
                detail=(
                    "De capaciteit kan niet lager zijn dan het huidige "
                    f"aantal deelnemers ({participant_count})."
                ),
            )

        # Only overwrite fields the client actually sent; omitted fields
        # (e.g. address and coordinates from the settings page) are kept.
        # Column names come from ActivityUpdate, never from user input.
        sent_fields = changes.model_dump(exclude_unset=True)
        set_clause = ",\n                ".join(
            f"{column} = %s" for column in sent_fields
        )

        updated = conn.execute(
            f"""
            UPDATE "ACTIVITEIT"
            SET
                {set_clause},
                bijgewerkt_op = CURRENT_TIMESTAMP
            WHERE activiteit_id = %s
            RETURNING
                activiteit_id,
                titel,
                beschrijving,
                starttijd,
                locatie_naam,
                woonplaats,
                straatnaam,
                huisnummer,
                postcode,
                land,
                breedtegraad,
                lengtegraad,
                externe_locatie_id,
                maximaal_aantal_deelnemers,
                status
            """,
            (*sent_fields.values(), activity_id),
        ).fetchone()

        recipients = conn.execute(
            """
            SELECT DISTINCT gebruiker_id
            FROM "ACTIVITEIT_DEELNEMER"
            WHERE activiteit_id = %s
              AND gebruiker_id <> %s
            """,
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


@app.post("/activities/{activity_id}/transfer-organizer")
def transfer_organizer(
    activity_id: int,
    request: Request,
    transfer: OrganizerTransfer,
):
    user_id = get_session_user_id(request)
    new_organizer_id = transfer.nieuwe_organisator_id

    if new_organizer_id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Je bent al de organisator van deze activiteit.",
        )

    with get_connection() as conn:
        activity = conn.execute(
            """
            SELECT maker_id, status
            FROM "ACTIVITEIT"
            WHERE activiteit_id = %s
            FOR UPDATE
            """,
            (activity_id,),
        ).fetchone()

        if not activity:
            raise HTTPException(
                status_code=404,
                detail="Activiteit niet gevonden.",
            )

        if activity["maker_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="Alleen de huidige organisator kan overdragen.",
            )

        if activity["status"] != "OPEN":
            raise HTTPException(
                status_code=409,
                detail="Een gesloten activiteit kan niet worden overgedragen.",
            )

        target = conn.execute(
            """
            SELECT 1
            FROM "ACTIVITEIT_DEELNEMER"
            WHERE activiteit_id = %s
              AND gebruiker_id = %s
            """,
            (activity_id, new_organizer_id),
        ).fetchone()

        if not target:
            raise HTTPException(
                status_code=400,
                detail="De nieuwe organisator moet deelnemer zijn.",
            )

        conn.execute(
            """
            INSERT INTO "ACTIVITEIT_DEELNEMER" (
                activiteit_id, gebruiker_id, deelname_vanaf, rol
            )
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'deelnemer')
            ON CONFLICT (activiteit_id, gebruiker_id) DO NOTHING
            """,
            (activity_id, user_id),
        )

        conn.execute(
            """
            UPDATE "ACTIVITEIT_DEELNEMER"
            SET rol = 'deelnemer'
            WHERE activiteit_id = %s
              AND gebruiker_id = %s
            """,
            (activity_id, user_id),
        )

        conn.execute(
            """
            UPDATE "ACTIVITEIT"
            SET maker_id = %s, bijgewerkt_op = CURRENT_TIMESTAMP
            WHERE activiteit_id = %s
            """,
            (new_organizer_id, activity_id),
        )

        conn.execute(
            """
            INSERT INTO "ACTIVITEIT_DEELNEMER" (
                activiteit_id, gebruiker_id, deelname_vanaf, rol
            )
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'organisator')
            ON CONFLICT (activiteit_id, gebruiker_id)
            DO UPDATE SET rol = 'organisator'
            """,
            (activity_id, new_organizer_id),
        )

    return {
        "transferred": True,
        "nieuwe_organisator_id": new_organizer_id,
    }


@app.post("/activities/{activity_id}/cancel")
def cancel_activity(activity_id: int, request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        activity = conn.execute(
            """
            SELECT maker_id, status
            FROM "ACTIVITEIT"
            WHERE activiteit_id = %s
            FOR UPDATE
            """,
            (activity_id,),
        ).fetchone()

        if not activity:
            raise HTTPException(
                status_code=404,
                detail="Activiteit niet gevonden.",
            )

        if activity["maker_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="Alleen de huidige organisator kan annuleren.",
            )

        if activity["status"] == "GEANNULEERD":
            return {"cancelled": True}

        conn.execute(
            """
            UPDATE "ACTIVITEIT"
            SET status = 'GEANNULEERD',
                bijgewerkt_op = CURRENT_TIMESTAMP
            WHERE activiteit_id = %s
            """,
            (activity_id,),
        )

        recipients = conn.execute(
            """
            SELECT DISTINCT gebruiker_id
            FROM "ACTIVITEIT_DEELNEMER"
            WHERE activiteit_id = %s
              AND gebruiker_id <> %s
            """,
            (activity_id, user_id),
        ).fetchall()

        title_row = conn.execute(
            'SELECT titel FROM "ACTIVITEIT" WHERE activiteit_id = %s',
            (activity_id,),
        ).fetchone()
        activity_title = title_row["titel"] if title_row else "Activiteit"

        for recipient in recipients:
            create_notification(
                conn,
                recipient["gebruiker_id"],
                "activity_changes",
                "Activiteit geannuleerd",
                f'De activiteit "{activity_title}" is geannuleerd.',
                activiteit_id=activity_id,
            )

    return {"cancelled": True}


@app.post("/activities", status_code=201)
def create_activity(request: Request, activity: ActivityCreate):
    # De organisator wordt uitsluitend uit de ondertekende sessie gehaald.
    maker_id = get_session_user_id(request)

    with get_connection() as conn:
        user_exists = conn.execute(
            'SELECT 1 FROM "GEBRUIKER" WHERE gebruiker_id = %s',
            (maker_id,),
        ).fetchone()

        if not user_exists:
            raise HTTPException(
                status_code=401,
                detail="Account niet gevonden. Log opnieuw in.",
            )

        sport_exists = conn.execute(
            'SELECT 1 FROM "SPORT" WHERE sport_id = %s',
            (activity.sport_id,),
        ).fetchone()

        if not sport_exists:
            raise HTTPException(
                status_code=400,
                detail="De opgegeven sport bestaat niet.",
            )

        row = conn.execute(
            '''
            INSERT INTO "ACTIVITEIT" (
                maker_id, sport_id, titel, beschrijving, starttijd,
                locatie_naam, woonplaats, straatnaam, huisnummer,
                postcode, land, breedtegraad, lengtegraad,
                externe_locatie_id, maximaal_aantal_deelnemers,
                status, aangemaakt_op, bijgewerkt_op
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s,
                'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING activiteit_id, titel, sport_id, starttijd,
                      maximaal_aantal_deelnemers, status
            ''',
            (
                maker_id,
                activity.sport_id,
                activity.titel,
                activity.beschrijving,
                activity.starttijd,
                activity.locatie_naam,
                activity.woonplaats,
                activity.straatnaam,
                activity.huisnummer,
                activity.postcode,
                activity.land,
                activity.breedtegraad,
                activity.lengtegraad,
                activity.externe_locatie_id,
                activity.maximaal_aantal_deelnemers,
            ),
        ).fetchone()

        conn.execute(
            """
            INSERT INTO "ACTIVITEIT_DEELNEMER" (
                activiteit_id,
                gebruiker_id,
                deelname_vanaf,
                rol
            )
            VALUES (%s, %s, CURRENT_TIMESTAMP, 'organisator')
            ON CONFLICT (activiteit_id, gebruiker_id) DO NOTHING
            """,
            (row["activiteit_id"], maker_id),
        )

    return row
