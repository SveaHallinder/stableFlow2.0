-- Fas 0B — profiles PII / GDPR. Kör mot staging efter migrationer + supabase/seed_qa.sql.
--
-- Använder seedens 5 roller (lösenord QaTest1234!):
--   admin/owner, staff (access=edit), rider (medryttare), horse owner, guest (view).
-- Sätt anroparens identitet med request.jwt.claims (Supabase-mönster) eller kör i
-- SQL-editorn inloggad som respektive roll. Justera UUID:n till seedens user-id:n.
--
-- Mål: bas-tabellen profiles är self-only; co-member-namn/avatar via
-- get_member_directory(); phone bara för self eller admin i delat stall.

\set ON_ERROR_STOP off

-- ── 1) Bas-tabell self-only ───────────────────────────────────────────────────
-- 1a. Som STAFF: läs en ANNAN medlems profilrad direkt → ska ge 0 RADER.
--     set local role authenticated; set local request.jwt.claims = '{"sub":"<STAFF_UID>"}';
--     select count(*) from public.profiles where id = '<RIDER_UID>';      -- förväntat: 0
--
-- 1b. Som STAFF: läs EGEN profil → ska ge 1 rad.
--     select count(*) from public.profiles where id = '<STAFF_UID>';      -- förväntat: 1

-- ── 2) Directory döljer phone för icke-admin ──────────────────────────────────
-- 2a. Som STAFF (ej admin): co-members syns med namn/avatar men phone = NULL.
--     set local request.jwt.claims = '{"sub":"<STAFF_UID>"}';
--     select id, full_name, avatar_url, phone from public.get_member_directory()
--       where id = '<RIDER_UID>';
--       -- förväntat: 1 rad, full_name/avatar_url ifyllda, phone IS NULL
--
-- 2b. Som STAFF: egen rad i directory har phone ifylld (self ser sitt eget nummer).
--     select phone from public.get_member_directory() where id = '<STAFF_UID>';
--       -- förväntat: phone = seedens staff-telefon (ej null)

-- ── 3) Directory visar phone för admin ────────────────────────────────────────
-- 3a. Som ADMIN: co-members phone ifylld.
--     set local request.jwt.claims = '{"sub":"<ADMIN_UID>"}';
--     select phone from public.get_member_directory() where id = '<RIDER_UID>';
--       -- förväntat: phone = seedens rider-telefon (ej null)

-- ── 4) Ingen läcka mellan stall ───────────────────────────────────────────────
-- 4a. En användare som INTE delar stall med anroparen får inte synas i directory.
--     (Seed:a ev. en extern användare, eller verifiera att antalet rader ==
--      antal distinkta co-members i anroparens stall + 1 för self.)
--     select count(*) from public.get_member_directory();   -- == co-members + self

-- ── 5) Regression: namn/avatar renderas fortfarande ───────────────────────────
-- 5a. Directory returnerar full_name ELLER username för varje co-member (aldrig tomt
--     för en seedad användare) så att klientens userMap inte tappar namn.
--     select count(*) from public.get_member_directory()
--       where coalesce(nullif(full_name,''), nullif(username,'')) is null;  -- förväntat: 0
