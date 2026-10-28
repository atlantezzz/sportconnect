# SportConnect

SportConnect is een Nederlandse webapp om samen te sporten. Je vindt sportactiviteiten bij jou in de buurt op een kaart, meldt je aan, organiseert zelf activiteiten en spreekt af via een groepschat per activiteit. Daarnaast kun je vrienden toevoegen, privéberichten sturen en meldingen ontvangen.

De app is in ontwikkeling en draait nu alleen lokaal op de server. Publieke toegang via https://sportconnect.fit (Cloudflare Tunnel) is gepland maar nog niet ingericht.

## Functies

- **Kaart en activiteiten**: activiteiten zoeken en filteren op sport, plaats en type (alles, eigen, aangemeld, van vrienden); activiteiten aanmaken, wijzigen, annuleren en het organisatorschap overdragen.
- **Groepschat** per activiteit voor deelnemers en organisator.
- **Vrienden en privéberichten**: gebruikers zoeken, vriendschapsverzoeken, privégesprekken tussen vrienden.
- **Meldingen** in de app, met voorkeuren per categorie.
- **Profiel**: naam, woonplaats, leeftijd, bio, profielfoto, favoriete en verborgen sporten, en privacykeuzes (openbaar profiel, privéberichten toestaan).
- **Licht en donker thema**.

## Techniek

| Onderdeel | Gebruikt |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, react-leaflet |
| Backend | FastAPI (Python), psycopg 3 met ruwe SQL, argon2 voor wachtwoorden |
| Database | PostgreSQL 17 |
| Adressen | Geoapify (autocomplete en geocoding, via de frontend-proxy) |
| Draaien | Docker Compose |

De browser praat alleen met de frontend. De routes in `frontend/src/app/api/**/route.ts` sturen verzoeken met de sessiecookie door naar de FastAPI-backend.

## Mappen

```
backend/app/main.py      FastAPI-backend (alle endpoints in één bestand)
frontend/src/app/        Pagina's en API-proxyroutes (Next.js App Router)
frontend/src/components/ Gedeelde componenten (header, kaart, formulieren, chat)
migrations/              SQL-migraties
compose.yml              Services: db, api (:8000) en frontend (:3000)
```

## Starten

Nodig: Docker met Docker Compose.

1. Maak een `.env` in de hoofdmap met deze variabelen (staat niet in Git):

   ```
   POSTGRES_PASSWORD=...
   SESSION_SECRET=...
   GEOAPIFY_API_KEY=...
   ```

2. Start alles:

   ```bash
   docker compose up -d --build
   ```

3. Open http://localhost:3000. De poorten 3000 en 8000 zijn alleen op `127.0.0.1` bereikbaar.

Inloggen werkt alleen via `localhost` of HTTPS, omdat de sessiecookie `Secure` is (`COOKIE_SECURE=true`).

Na een codewijziging herbouw je alleen wat veranderd is: `docker compose up -d --build api` of `docker compose up -d --build frontend`.

## Database

- Migraties staan in `migrations/` en voer je met de hand uit:
  `docker exec -i sportconnect-db psql -U sportconnect -d sportconnect -v ON_ERROR_STOP=1 < migrations/NNN_naam.sql`
- Let op: `001_initial_schema.sql` loopt achter op de echte database. Twee tabellen (`SPORTCONNECT_VRIENDSCHAP`, `SPORTCONNECT_PRIVATBERICHT`) worden door de backend zelf aangemaakt.
- Maak vóór een migratie een back-up in `backups/db/` (die map staat niet in Git).
- Verwijder nooit het volume `postgres_data` (dus geen `docker compose down -v`).

## Controleren

```bash
cd frontend
npx tsc --noEmit -p .                    # typecheck
npx eslint src                           # lint
curl -s http://127.0.0.1:8000/health     # backend
curl -s http://127.0.0.1:8000/db-health  # database
```

## Projectbeheer

Taken, bugs en het logboek staan in Notion (in het Nederlands). Afspraken voor wie aan de code werkt, ook voor Claude Code, staan in `CLAUDE.md`.
