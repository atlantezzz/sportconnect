from fastapi import APIRouter, HTTPException, Request

from app.ages import validate_birth_date
from app.db import AGE_SQL, get_connection
from app.notifications import create_notification
from app.schemas import PROFILE_NULLABLE_FIELDS, ProfileUpdate, SportPreferencesInput
from app.security import get_session_user_id

router = APIRouter()

# "GEBRUIKER_SPORTVOORKEUR".voorkeursniveau values
SPORT_LEVEL_FAVORITE = 3
SPORT_LEVEL_HIDDEN = 1


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
    # The birth date itself is never returned, only the age.
    profile = conn.execute(
        f'''
        SELECT g.gebruiker_id, g.naam, g.email, {AGE_SQL} AS leeftijd,
               g.geboortedatum IS NOT NULL AS heeft_geboortedatum,
               g.woonplaats, g.land, g.bio, g.profielfoto, g.profiel_openbaar,
               g.priveberichten_toestaan, g.favoriete_sporten_tonen
        FROM "GEBRUIKER" g
        WHERE g.gebruiker_id = %s
        ''',
        (user_id,),
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=401, detail="Account niet gevonden.")
    return {**profile, "sporten": _sport_preferences(conn, user_id)}


@router.get("/profile")
def get_profile(request: Request):
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        return _own_profile(conn, user_id)


@router.put("/profile")
def update_profile(changes: ProfileUpdate, request: Request):
    user_id = get_session_user_id(request)

    # Only fields the client sent are changed; null only clears optional fields.
    sent_fields = changes.model_dump(exclude_unset=True)
    for column, value in sent_fields.items():
        if isinstance(value, str):
            value = sent_fields[column] = value.strip() or None
        if value is None and column not in PROFILE_NULLABLE_FIELDS:
            raise HTTPException(status_code=422, detail="Naam, woonplaats, geboortedatum en privacykeuzes mogen niet leeg zijn.")
    if "geboortedatum" in sent_fields:
        # Keep the legacy "leeftijd" column in step with the birth date.
        sent_fields["leeftijd"] = validate_birth_date(sent_fields["geboortedatum"])

    with get_connection() as conn:
        if sent_fields:
            # Column names come from ProfileUpdate, never from user input.
            set_clause = ", ".join(f"{column} = %s" for column in sent_fields)
            conn.execute(
                f'UPDATE "GEBRUIKER" SET {set_clause}, bijgewerkt_op = CURRENT_TIMESTAMP WHERE gebruiker_id = %s',
                (*sent_fields.values(), user_id),
            )
        return _own_profile(conn, user_id)


@router.put("/profile/sport-preferences")
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


# A viewer is notified at most once per day per profile.
PROFILE_VIEW_DEDUP_HOURS = 24


@router.get("/users/{profile_user_id}")
def get_public_profile(profile_user_id: int, request: Request):
    """Another user's profile, limited by their privacy settings.

    Private profiles show only the name to non-friends. Viewing someone else's
    profile notifies them (category profile_views), at most once a day per viewer.
    """
    viewer_id = get_session_user_id(request)
    is_self = viewer_id == profile_user_id

    with get_connection() as conn:
        user = conn.execute(
            f'''
            SELECT g.gebruiker_id, g.naam, {AGE_SQL} AS leeftijd, g.woonplaats, g.bio,
                   g.profielfoto, g.profiel_openbaar, g.favoriete_sporten_tonen,
                   g.priveberichten_toestaan, g.aangemaakt_op
            FROM "GEBRUIKER" g
            WHERE g.gebruiker_id = %s
            ''',
            (profile_user_id,),
        ).fetchone()

        blocked = not is_self and conn.execute(
            '''
            SELECT 1 FROM "GEBRUIKER_BLOKKADE"
            WHERE (blokkeerder_id = %s AND geblokkeerde_id = %s)
               OR (blokkeerder_id = %s AND geblokkeerde_id = %s)
            ''',
            (profile_user_id, viewer_id, viewer_id, profile_user_id),
        ).fetchone()

        # Same answer for "doesn't exist" and "blocked", so nothing leaks.
        if not user or blocked:
            raise HTTPException(status_code=404, detail="Profiel niet gevonden.")

        low, high = sorted((viewer_id, profile_user_id))
        friendship = None if is_self else conn.execute(
            'SELECT status, aangevraagd_door FROM "SPORTCONNECT_VRIENDSCHAP" '
            'WHERE gebruiker_laag_id = %s AND gebruiker_hoog_id = %s',
            (low, high),
        ).fetchone()
        is_friend = bool(friendship and friendship["status"] == "accepted")
        visible = is_self or is_friend or user["profiel_openbaar"]

        profile = {
            "gebruiker_id": user["gebruiker_id"],
            "naam": user["naam"],
            "eigen_profiel": is_self,
            "afgeschermd": not visible,
            "vriendschapsstatus": friendship["status"] if friendship else None,
            "verzoek_van_mij": bool(friendship and friendship["aangevraagd_door"] == viewer_id),
            "kan_bericht_sturen": is_friend and user["priveberichten_toestaan"],
        }
        if visible:
            sports = _sport_preferences(conn, profile_user_id)
            profile.update({
                "leeftijd": user["leeftijd"],
                "woonplaats": user["woonplaats"],
                "bio": user["bio"],
                "profielfoto": user["profielfoto"],
                "lid_sinds": user["aangemaakt_op"].date().isoformat() if user["aangemaakt_op"] else None,
                "favoriete_sporten": sports["favoriet"] if (is_self or user["favoriete_sporten_tonen"]) else [],
            })

        if not is_self:
            target = f"/users/{viewer_id}"
            recent = conn.execute(
                f'''
                SELECT 1 FROM "NOTIFICATIE"
                WHERE gebruiker_id = %s AND type = 'profile_views' AND doel_url = %s
                  AND aangemaakt_op > CURRENT_TIMESTAMP - INTERVAL '{PROFILE_VIEW_DEDUP_HOURS} hours'
                ''',
                (profile_user_id, target),
            ).fetchone()
            if not recent:
                viewer = conn.execute(
                    'SELECT naam FROM "GEBRUIKER" WHERE gebruiker_id = %s', (viewer_id,)
                ).fetchone()
                create_notification(
                    conn,
                    profile_user_id,
                    "profile_views",
                    "Profielbezoek",
                    f"{viewer['naam'] if viewer else 'Iemand'} heeft je profiel bekeken.",
                    doel_url=target,
                )

    return profile
