import threading
import time
from collections import defaultdict, deque

from argon2 import PasswordHasher
from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import COOKIE_SECURE, SESSION_COOKIE, SESSION_MAX_AGE, SESSION_SECRET

password_hasher = PasswordHasher()
serializer = URLSafeTimedSerializer(SESSION_SECRET, salt="sportconnect-session")


def create_session_token(user_id: int) -> str:
    return serializer.dumps({"user_id": user_id})


def get_session_user_id(request: Request) -> int:
    token = request.cookies.get(SESSION_COOKIE)

    if not token:
        raise HTTPException(status_code=401, detail="Je bent niet ingelogd.")

    try:
        data = serializer.loads(token, max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Je sessie is verlopen. Log opnieuw in.")

    user_id = data.get("user_id")
    if not isinstance(user_id, int) or user_id <= 0:
        raise HTTPException(status_code=401, detail="Ongeldige sessie. Log opnieuw in.")
    return user_id


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


def clear_session_cookie(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
    )


def client_ip(request: Request) -> str:
    # The API is only reachable through the Next.js proxy, which forwards the
    # browser's address in X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "onbekend"


class RateLimiter:
    """Sliding-window counter per key, in memory (one API process)."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque:
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        return hits

    def retry_after(self, key: str) -> int:
        """Seconds until a new attempt is allowed; 0 when allowed now."""
        with self._lock:
            now = time.monotonic()
            hits = self._prune(key, now)
            if len(hits) < self.limit:
                return 0
            return max(1, int(hits[0] + self.window - now) + 1)

    def hit(self, key: str):
        with self._lock:
            now = time.monotonic()
            self._prune(key, now).append(now)

    def reset(self, key: str | None = None):
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


# Failed logins per e-mail address, all login attempts per IP, registrations per IP.
failed_login_limiter = RateLimiter(limit=5, window_seconds=15 * 60)
login_ip_limiter = RateLimiter(limit=30, window_seconds=15 * 60)
register_ip_limiter = RateLimiter(limit=5, window_seconds=60 * 60)


def enforce_rate_limit(limiter: RateLimiter, key: str):
    wait = limiter.retry_after(key)
    if wait:
        minutes = max(1, round(wait / 60))
        raise HTTPException(
            status_code=429,
            detail=f"Te veel pogingen. Probeer het over {minutes} {'minuut' if minutes == 1 else 'minuten'} opnieuw.",
            headers={"Retry-After": str(wait)},
        )
