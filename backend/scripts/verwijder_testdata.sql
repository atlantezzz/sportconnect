-- Verwijdert testdata: activiteiten met een titel die begint met "[TEST]" (met
-- deelnemers, groepschat en meldingen), "[TEST]"-privéberichten en accounts die
-- de testsuite registreert (claude-test-reg-*). De vaste testaccounts blijven bestaan.
-- Gebruik: docker exec -i sportconnect-db psql -U sportconnect -d sportconnect -v ON_ERROR_STOP=1 < backend/scripts/verwijder_testdata.sql
BEGIN;

CREATE TEMP TABLE test_activiteit ON COMMIT DROP AS
    SELECT activiteit_id FROM "ACTIVITEIT" WHERE titel LIKE '[TEST]%';

DELETE FROM "NOTIFICATIE" WHERE activiteit_id IN (SELECT activiteit_id FROM test_activiteit);
DELETE FROM "NOTIFICATIE" WHERE bericht_id IN (
    SELECT b.bericht_id FROM "BERICHT" b JOIN "GROEPSCHAT" gc ON gc.chat_id = b.chat_id
    WHERE gc.activiteit_id IN (SELECT activiteit_id FROM test_activiteit));
DELETE FROM "BERICHT" WHERE chat_id IN (
    SELECT chat_id FROM "GROEPSCHAT" WHERE activiteit_id IN (SELECT activiteit_id FROM test_activiteit));
DELETE FROM "CHATLID" WHERE chat_id IN (
    SELECT chat_id FROM "GROEPSCHAT" WHERE activiteit_id IN (SELECT activiteit_id FROM test_activiteit));
DELETE FROM "GROEPSCHAT" WHERE activiteit_id IN (SELECT activiteit_id FROM test_activiteit);
DELETE FROM "ACTIVITEIT_DEELNEMER" WHERE activiteit_id IN (SELECT activiteit_id FROM test_activiteit);
DELETE FROM "ACTIVITEIT" WHERE activiteit_id IN (SELECT activiteit_id FROM test_activiteit);

DELETE FROM "SPORTCONNECT_PRIVATBERICHT" WHERE inhoud LIKE '[TEST]%';

DELETE FROM "NOTIFICATIE" WHERE gebruiker_id IN (
    SELECT gebruiker_id FROM "GEBRUIKER" WHERE email LIKE 'claude-test-reg-%@sportconnect.fit');
DELETE FROM "GEBRUIKER" WHERE email LIKE 'claude-test-reg-%@sportconnect.fit';

COMMIT;
