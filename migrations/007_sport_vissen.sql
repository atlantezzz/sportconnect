-- Nieuwe sport: vissen.
BEGIN;

INSERT INTO "SPORT" (naam, beschrijving)
VALUES ('Vissen', 'Samen vissen')
ON CONFLICT (naam) DO NOTHING;

COMMIT;
