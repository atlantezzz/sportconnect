-- Activiteitenlijst en kaart filteren en sorteren op starttijd.
BEGIN;

CREATE INDEX IF NOT EXISTS "idx_activiteit_starttijd" ON "ACTIVITEIT" (starttijd);

COMMIT;
