---
name: deploy
description: Rebuild and restart SportConnect containers (api, frontend, db), read logs, and check health. Use after changing backend or frontend code, when the site is down, or when asked to deploy, restart, or check logs.
---

# Deploy SportConnect

All commands run from `/opt/sportconnect`. Docker needs root: use `sudo docker ...` (or plain `docker` if the user is in the `docker` group). If sudo asks for a password, stop and ask the user. Don't try to work around it.

## Rebuild only what changed

| Changed | Command |
|---|---|
| `backend/**` | `sudo docker compose up -d --build api` |
| `frontend/**` | `sudo docker compose up -d --build frontend` (Next build takes 1–3 min) |
| `compose.yml` / `.env` | `sudo docker compose up -d` |

The frontend image copies the whole `frontend/` dir. Make sure no stray files (backups, secrets) are in it.

## Check it came up

```bash
sudo docker compose ps
curl -s http://127.0.0.1:8000/health          # {"status":"ok"}
curl -s http://127.0.0.1:8000/db-health       # {"status":"connected",...}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200
sudo docker compose logs --tail=80 api        # or frontend / db
```

If a build fails, show the relevant log lines and don't retry blindly.

## Never

- `docker compose down -v`, `docker volume rm`, or `docker system prune --volumes`: these delete the database.
- Print `.env` or `docker compose config` output (it contains secrets).

## Public access (planned)

Target: Cloudflare Tunnel `sportconnect.fit` → `http://localhost:3000`. `cloudflared` is not installed yet (as of 2026-10-28). `COOKIE_SECURE=true` means login only works over HTTPS or on `localhost`, so it will not work from a plain `http://<ip>:3000`.
