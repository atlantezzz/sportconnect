from fastapi import FastAPI

from app.db import get_connection
from app.routers import activities, auth, chat, friends, messages, notifications, profile

app = FastAPI(title="SportConnect API")

for module in (auth, profile, friends, messages, activities, chat, notifications):
    app.include_router(module.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db-health")
def database_health():
    with get_connection() as conn:
        row = conn.execute("SELECT current_database() AS database").fetchone()
    return {"status": "connected", "database": row["database"]}
