import hashlib
import re
import secrets

from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from psycopg.errors import UniqueViolation

from app.ages import validate_birth_date
from app.config import APP_URL
from app.db import AGE_SQL, get_connection
from app.mailer import send_password_changed_email, send_password_reset_email, send_welcome_email
from app.schemas import LoginInput, PasswordChange, PasswordResetConfirm, PasswordResetRequest, RegisterInput
from app.security import (
    clear_session_cookie,
    client_ip,
    enforce_rate_limit,
    failed_login_limiter,
    get_session_user_id,
    login_ip_limiter,
    password_hasher,
    register_ip_limiter,
    reset_email_limiter,
    reset_ip_limiter,
    set_session_cookie,
)

router = APIRouter()


def public_user(user: dict) -> dict:
    return {
        "gebruiker_id": user["gebruiker_id"],
        "naam": user["naam"],
        "email": user["email"],
        "leeftijd": user["leeftijd"],
        "woonplaats": user["woonplaats"],
        "land": user["land"],
    }


USER_COLUMNS = f"g.gebruiker_id, g.naam, g.email, {AGE_SQL} AS leeftijd, g.woonplaats, g.land, g.sessie_versie"


@router.post("/auth/register", status_code=201)
def register(data: RegisterInput, request: Request, response: Response, background: BackgroundTasks):
    ip = client_ip(request)
    enforce_rate_limit(register_ip_limiter, ip)

    email = data.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="Vul een geldig e-mailadres in.")

    naam = data.naam.strip()
    woonplaats = data.woonplaats.strip()
    land = data.land.strip()
    if not naam or not woonplaats or not land:
        raise HTTPException(status_code=422, detail="Naam, woonplaats en land zijn verplicht.")

    leeftijd = validate_birth_date(data.geboortedatum)
    register_ip_limiter.hit(ip)
    password_hash = password_hasher.hash(data.wachtwoord)

    try:
        with get_connection() as conn:
            created = conn.execute(
                '''
                INSERT INTO "GEBRUIKER" (
                    naam, leeftijd, geboortedatum, email, wachtwoord_hash,
                    woonplaats, land, aangemaakt_op, bijgewerkt_op
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING gebruiker_id
                ''',
                (naam, leeftijd, data.geboortedatum, email, password_hash, woonplaats, land),
            ).fetchone()
            user = conn.execute(
                f'SELECT {USER_COLUMNS} FROM "GEBRUIKER" g WHERE g.gebruiker_id = %s',
                (created["gebruiker_id"],),
            ).fetchone()
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="Er bestaat al een account met dit e-mailadres.")

    set_session_cookie(response, user["gebruiker_id"], user["sessie_versie"])
    background.add_task(send_welcome_email, email, naam)
    return {"user": public_user(user)}


@router.post("/auth/login")
def login(data: LoginInput, request: Request, response: Response):
    email = data.email.strip().lower()
    ip = client_ip(request)
    enforce_rate_limit(login_ip_limiter, ip)
    enforce_rate_limit(failed_login_limiter, email)
    login_ip_limiter.hit(ip)

    with get_connection() as conn:
        user = conn.execute(
            f'SELECT {USER_COLUMNS}, g.wachtwoord_hash FROM "GEBRUIKER" g WHERE g.email = %s',
            (email,),
        ).fetchone()

    try:
        if not user:
            raise VerifyMismatchError()
        password_hasher.verify(user["wachtwoord_hash"], data.wachtwoord)
    except (VerifyMismatchError, VerificationError):
        failed_login_limiter.hit(email)
        raise HTTPException(status_code=401, detail="E-mailadres of wachtwoord is onjuist.")

    failed_login_limiter.reset(email)
    set_session_cookie(response, user["gebruiker_id"], user["sessie_versie"])
    return {"user": public_user(user)}


@router.get("/auth/me")
def current_user(request: Request):
    user_id = get_session_user_id(request)

    with get_connection() as conn:
        user = conn.execute(
            f'SELECT {USER_COLUMNS} FROM "GEBRUIKER" g WHERE g.gebruiker_id = %s',
            (user_id,),
        ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Account niet gevonden.")
    return {"user": public_user(user)}


@router.post("/auth/logout")
def logout(response: Response):
    clear_session_cookie(response)
    return {"status": "ok"}


RESET_VALID_MINUTES = 60
RESET_REQUESTED_MESSAGE = (
    "Als er een account met dit e-mailadres bestaat, ontvang je binnen een paar minuten "
    "een e-mail met een link om een nieuw wachtwoord in te stellen."
)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/auth/password-reset/request")
def request_password_reset(data: PasswordResetRequest, request: Request, background: BackgroundTasks):
    """Mail a one-time reset link. Always the same answer, so it doesn't reveal which addresses exist."""
    email = data.email.strip().lower()
    ip = client_ip(request)
    enforce_rate_limit(reset_ip_limiter, ip)
    reset_ip_limiter.hit(ip)
    if reset_email_limiter.retry_after(email):
        return {"detail": RESET_REQUESTED_MESSAGE}
    reset_email_limiter.hit(email)

    with get_connection() as conn:
        user = conn.execute(
            'SELECT gebruiker_id, naam, email FROM "GEBRUIKER" WHERE email = %s', (email,)
        ).fetchone()
        if user:
            token = secrets.token_urlsafe(32)
            # Only the newest link works.
            conn.execute(
                'UPDATE "WACHTWOORD_HERSTEL" SET gebruikt_op = NOW() WHERE gebruiker_id = %s AND gebruikt_op IS NULL',
                (user["gebruiker_id"],),
            )
            conn.execute(
                f'''
                INSERT INTO "WACHTWOORD_HERSTEL" (gebruiker_id, token_hash, verloopt_op)
                VALUES (%s, %s, NOW() + INTERVAL '{RESET_VALID_MINUTES} minutes')
                ''',
                (user["gebruiker_id"], _token_hash(token)),
            )
            reset_url = f"{APP_URL}/wachtwoord-herstellen?token={token}"
            background.add_task(send_password_reset_email, user["email"], user["naam"], reset_url, RESET_VALID_MINUTES)

    return {"detail": RESET_REQUESTED_MESSAGE}


@router.post("/auth/password-reset/confirm")
def confirm_password_reset(data: PasswordResetConfirm, request: Request, response: Response, background: BackgroundTasks):
    """Set a new password with a reset link, end all other sessions and log in."""
    ip = client_ip(request)
    enforce_rate_limit(reset_ip_limiter, ip)
    reset_ip_limiter.hit(ip)

    with get_connection() as conn:
        reset = conn.execute(
            '''
            SELECT herstel_id, gebruiker_id FROM "WACHTWOORD_HERSTEL"
            WHERE token_hash = %s AND gebruikt_op IS NULL AND verloopt_op > NOW()
            FOR UPDATE
            ''',
            (_token_hash(data.token),),
        ).fetchone()
        if not reset:
            raise HTTPException(
                status_code=400,
                detail="Deze link is ongeldig of verlopen. Vraag een nieuwe link aan.",
            )

        conn.execute('UPDATE "WACHTWOORD_HERSTEL" SET gebruikt_op = NOW() WHERE gebruiker_id = %s AND gebruikt_op IS NULL',
                     (reset["gebruiker_id"],))
        conn.execute(
            '''
            UPDATE "GEBRUIKER"
            SET wachtwoord_hash = %s, sessie_versie = sessie_versie + 1, bijgewerkt_op = CURRENT_TIMESTAMP
            WHERE gebruiker_id = %s
            ''',
            (password_hasher.hash(data.wachtwoord), reset["gebruiker_id"]),
        )
        user = conn.execute(
            f'SELECT {USER_COLUMNS} FROM "GEBRUIKER" g WHERE g.gebruiker_id = %s',
            (reset["gebruiker_id"],),
        ).fetchone()

    failed_login_limiter.reset(user["email"])
    set_session_cookie(response, user["gebruiker_id"], user["sessie_versie"])
    background.add_task(send_password_changed_email, user["email"], user["naam"])
    return {"user": public_user(user)}


@router.post("/auth/password/change")
def change_password(data: PasswordChange, request: Request, response: Response, background: BackgroundTasks):
    """Change the password with the current one. Other devices are logged out; this one stays logged in."""
    user_id = get_session_user_id(request)
    key = f"user:{user_id}"  # wrong current passwords count like failed logins
    enforce_rate_limit(failed_login_limiter, key)

    with get_connection() as conn:
        user = conn.execute(
            f'SELECT {USER_COLUMNS}, g.wachtwoord_hash FROM "GEBRUIKER" g WHERE g.gebruiker_id = %s FOR UPDATE',
            (user_id,),
        ).fetchone()
        try:
            password_hasher.verify(user["wachtwoord_hash"], data.huidig_wachtwoord)
        except (VerifyMismatchError, VerificationError):
            failed_login_limiter.hit(key)
            raise HTTPException(status_code=400, detail="Je huidige wachtwoord klopt niet.")
        if data.nieuw_wachtwoord == data.huidig_wachtwoord:
            raise HTTPException(status_code=422, detail="Kies een ander wachtwoord dan je huidige.")

        updated = conn.execute(
            '''
            UPDATE "GEBRUIKER"
            SET wachtwoord_hash = %s, sessie_versie = sessie_versie + 1, bijgewerkt_op = CURRENT_TIMESTAMP
            WHERE gebruiker_id = %s
            RETURNING sessie_versie
            ''',
            (password_hasher.hash(data.nieuw_wachtwoord), user_id),
        ).fetchone()
        # Open reset links no longer make sense.
        conn.execute(
            'UPDATE "WACHTWOORD_HERSTEL" SET gebruikt_op = NOW() WHERE gebruiker_id = %s AND gebruikt_op IS NULL',
            (user_id,),
        )

    failed_login_limiter.reset(key)
    set_session_cookie(response, user_id, updated["sessie_versie"])
    background.add_task(send_password_changed_email, user["email"], user["naam"])
    return {"detail": "Je wachtwoord is gewijzigd. Op je andere apparaten ben je uitgelogd."}


@router.post("/auth/logout-everywhere")
def logout_everywhere(request: Request, response: Response):
    """End every session of this account, including the current one."""
    user_id = get_session_user_id(request)
    with get_connection() as conn:
        conn.execute(
            'UPDATE "GEBRUIKER" SET sessie_versie = sessie_versie + 1 WHERE gebruiker_id = %s',
            (user_id,),
        )
    clear_session_cookie(response)
    return {"detail": "Je bent op al je apparaten uitgelogd."}
