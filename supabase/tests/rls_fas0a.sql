-- Fas 0A — RLS-testsvit. Kör mot staging efter migrationer + supabase/seed_qa.sql.
--
-- Använder seedens 5 roller (lösenord QaTest1234!):
--   admin/owner, staff (access=edit), rider (medryttare), horse owner, guest (view).
-- Kör som respektive användare genom att sätta request.jwt.claims (Supabase-mönster)
-- ELLER kör via supabase SQL editor inloggad som varje roll. Nedan: psql-stil med
-- set_config för auth.uid(). Justera UUID:n till seedens faktiska user-id:n.
--
-- Varje block ska resultera i RAISED EXCEPTION (förbjudet) eller rad (tillåtet)
-- enligt kommentaren. Wrappa i DO-block så ett fel inte stoppar resten.

\set ON_ERROR_STOP off

-- ── Hål #1: stables_update owner-only ─────────────────────────────────────────
-- Förbered: hämta stall-id och user-id:n
-- select id from public.stables where name = 'StableFlow QA Stable';

-- 1a. STAFF (access=edit) UPDATE stable → ska NEKAS (0 rader / 42501).
--     set local role authenticated; set local request.jwt.claims = '{"sub":"<STAFF_UID>"}';
--     update public.stables set title = title where id = '<STABLE_ID>';   -- förväntat: 0 rows
--
-- 1b. OWNER UPDATE → ska TILLÅTAS (1 row).
-- 1c. CREATOR utan owner-membership (lockout-regression) → ska TILLÅTAS (1 row),
--     eftersom created_by = auth.uid()-grenen finns kvar.

-- ── Hål #4: chatt-membership ──────────────────────────────────────────────────
-- 4a. Icke-medlem self-insert i främmande konversation → NEKAS.
--     Skapa konversation som user A, försök sen som user C (ej medlem):
--       insert into public.conversation_members (conversation_id, user_id)
--       values ('<A_CONV_ID>', '<C_UID>');   -- förväntat: ny policy nekar (with check false)
--
-- 4b. Icke-medlem läser messages i främmande konversation → 0 rader.
--       select count(*) from public.messages where conversation_id = '<A_CONV_ID>';  -- 0 som C
--
-- 4c. Privat-chatt-flöde mellan två stallkamrater fungerar (brick-regression):
--       som A: insert conversation (created_by_user_id = A) → id;
--               insert members [(conv,A),(conv,B)];   -- BÅDA raderna ska lyckas
--       Verifiera: select count(*) from conversation_members where conversation_id = conv; -- 2
--
-- 4d. A försöker lägga till en FRÄMLING (delar ej stall) i sin konversation → NEKAS
--     (shares_stable_with = false).
--
-- 4e. Medlem ser co-member-rader (för namn): som B,
--       select count(*) from conversation_members where conversation_id = conv;  -- 2 (ej 1)
--
-- 4f. Författare raderar eget meddelande → OK; annan icke-owner raderar → NEKAS;
--     stall-owner raderar i sitt stalls konversation → OK (moderering).

-- ── Hål #6: service-role-nyckel ej i plaintext ────────────────────────────────
-- 6a. Efter att Vault-secret satts och GUC reset:ats:
--       select current_setting('app.settings.service_role_key', true);  -- null
-- 6b. Nyckeln finns inte kvar i pg_settings:
--       select count(*) from pg_settings where name = 'app.settings.service_role_key'; -- 0
-- 6c. Vault-secret finns:
--       select count(*) from vault.secrets where name = 'service_role_key';  -- 1

\set ON_ERROR_STOP on
-- NOTE: konkreta UID/STABLE_ID fylls i från seed_qa.sql-utdata vid körning.
-- Detta är test-specen; gör om till pgTAP (plan/ok/is) eller Playwright-DB-asserts
-- i CI-steget (se ~/.gstack/.../test-plan).
