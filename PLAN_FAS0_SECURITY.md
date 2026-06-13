<!-- /autoplan restore point: /Users/admin/.gstack/projects/SveaHallinder-stableFlow2.0/balanced-mvp-1.1.0-autoplan-restore-20260613-172335.md -->
# Fas 0 — Säkerhet & RLS-härdning

**Mål:** Stäng varje server-side auktoriserings-, integritets- och secrets-hål så att klienten inte längre är säkerhetsgränsen. Inget annat spelar roll om en gäst kan läsa allas telefonnummer, rotera join_code eller enumerera chatt-historik.

**Scope:** Endast `supabase/schema.sql`, `supabase/migrations/*`, push-trigger-migrationen, samt klientanrop som måste bytas från direkt tabell-skrivning till RPC. Inga nya features.

---

## Sekvensering (beslutad via /autoplan, 2026-06-13)

CEO-fasens två oberoende röster (Claude + Codex) var samstämmiga: full Fas 0 före acquisition är överinvestering — produkten kan inte skaffa användare idag (signup gated på kod, inbjudningar levereras aldrig). Beslut: **splitta**.

### Fas 0A — Safe Pilot Gate `[S]` ← BYGGS NU
De hål som biter även med ~5 betrodda pilotstall. Måste vara stängda innან externa stall släpps in.
- **Hål #1** `stables_update` / join_code-escalation
- **Hål #4** Chat `conversation_members_insert` self-insert + saknade message-policies
- **Hål #6** Service-role-nyckel i plaintext GUC

→ Därefter promotas **acquisition-loopen** (self-serve signup + riktig invite-leverans, tidigare Fas 2) som nästa arbete, så efterfrågan kan bevisas med pilotstall.

### Fas 0B — Full RLS-härdning `[L]` ← FÖRE PUBLIK ÖPPNING
Körs efter att vi vet vilka roller/grupper/flöden som överlever verklig användning (annars byggs det om).
- **Hål #2** `profiles_select` PII/GDPR-vy-refactor (cross-stable-läckan biter först vid 2:a stallet/publikt)
- **Hål #3** `posts_select` grupp-privacy (kräver produktbeslut B — kan ändra schemat)
- **Hål #5** `assignments_update` → claim/decline-RPC
- **Hål #7** `posts_delete` admin-moderering (sammanfaller med Fas 3 ändå)
- **Hål #8** Full roll × tabell × operation paritetsaudit + pgTAP-matris

**Definition of done (0A):** Hål #1/#4/#6 stängda + riktad SQL-testsvit som verifierar att guest/staff/rider nekas escalation, att en icke-medlem inte kan self-inserta i en konversation, och att service-nyckeln inte längre exponeras i `pg_settings`. Grön mot staging med `seed_qa.sql`.

---

## Fas 0A — Implementation (review-härdad via /autoplan dual-voice)

### #1 `stables_update` → owner-only, behåll creator-fallback
```sql
drop policy if exists "stables_update" on public.stables;
create policy "stables_update" on public.stables
  for update using (created_by = auth.uid() or public.is_stable_owner(id))
  with check  (created_by = auth.uid() or public.is_stable_owner(id));
```
- **Måste vara `id`, inte `stable_id`** (stables-tabellens PK heter `id`).
- **Behåll `created_by = auth.uid()`** — annars låses skaparen ute om owner-medlemskaps-insert (`AppDataContext:4027`) faltade.
- Owner-only avgör **Öppen fråga A**: staff/admin tappar settings-redigering i 0A (kolumn-granularitet i 0B). join_code skyddas eftersom den ligger på samma rad.
- **Verifiera först:** att `persistStableUpdate` (`AppDataContext:3820`) bara anropas från owner-UI, annars börjar staff-edits faila med 42501.

### #4 Chat — RPC + SECURITY DEFINER-helper (största delen av 0A)
1. **`is_conversation_member(p_conversation_id uuid)`** — SECURITY DEFINER, `set row_security = off` (mönster från `is_stable_member`, schema.sql:139) för att undvika RLS-rekursion.
2. **`create_private_conversation(p_other_user_id uuid)`** — SECURITY DEFINER. Skapar `stable_id=null`-konversation + båda member-raderna atomiskt. **Guard:** caller och other måste dela minst ett stall (stänger spam-edge). Byt klienten (`AppDataContext:5929-5950`) till denna RPC.
3. `conversation_members_insert`: neka direkta insert (allt går via RPC), eller tillåt bara self-insert i konversation du redan skapat.
4. `conversation_members_select`: tillåt rader för konversationer du är medlem i, via `is_conversation_member(conversation_id)` — annars faller chatt-titlar tillbaka till "Konversation" (`AppDataContext:4536`).
5. `messages_update` / `messages_delete`: författare på egen + owner/admin för moderering (ingen klient-edit-väg idag → bryter inget).

### #6 Service-role-nyckel → Vault (ordnat byte)
- Edge-funktionen sträng-jämför inkommande header mot `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:208`) → triggern MÅSTE fortsätta skicka giltig nyckel.
- Ordning: (1) skapa Vault-secret som matchar edge-env, (2) uppdatera `notify_push` att läsa Vault med explicit warning vid miss, (3) verifiera push end-to-end på staging, (4) ta bort plaintext-GUC, (5) uppdatera `staging_setup.sql:13-14` + `scripts/staging-setup.test.mjs:26-27`.
- Överväg en dedikerad shared secret istället för full service-role-nyckel (funktionen skapar redan egen klient från env, så header-nyckeln behöver inte vara service-role).

### Ship-ordning (annars white-screen för pilotanvändare)
1. **Additivt först (ingen breakage):** deploya RPC:er + `is_conversation_member`-helper + Vault-secret + edge-redeploy. #1 och #6 är oberoende, kan gå först.
2. **Klientbyte:** växla `createPrivateConversation` → `create_private_conversation`-RPC. Samma deploy som steg 3.
3. **Strama sist:** `conversation_members_insert`-restriktion + `stables_update`-owner-only.

### Accepterad risk i 0A (deferrad, ok för betrodd pilot)
- **Dubbel-claim / assignment-rewrite** (Hål #5) kvarstår — riders kan mutera pass. Acceptabelt med ~5 betrodda stall; stängs i 0B/Fas 1.
- **PII (telefon/plats)** syns för stallkamrater (Hål #2) — cross-stable-läckan biter först vid 2:a stallet; 0B före publikt.

### Testsvit (0A) — `supabase/tests/rls_fas0a.sql`
- `stables_update`: staff med `access='edit'` UPDATE → 42501; owner UPDATE → OK; creator-utan-membership UPDATE → OK (lockout-regression).
- chat: icke-medlem self-insert i conversation → 42501; icke-medlem läser messages → 0 rader; `create_private_conversation` mellan två stallkamrater → båda raderna skapas (RPC-regression som annars brickar chatt); RPC mot främling utan delat stall → fel.
- push: `select current_setting('app.settings.service_role_key', true)` → null efter migration; `pg_settings` saknar nyckeln.

---

## Hålen som ska stängas (kodgrundat) — fullständig katalog (0A + 0B)

### 1. `stables_update` — privilege escalation `[KRITISK]`
**Nu** (`schema.sql:812-821`): vilken medlem som helst (inkl. guest) får `UPDATE` på stall-raden → kan ändra namn, `settings`, `ride_types` och **rotera `join_code`**.
**Fix:** Byt `using`-villkoret till `public.is_stable_owner(stable_id)` (eller `can_edit_stable` om personal ska få ändra settings men inte join_code — se öppen fråga A). Lägg `with check` likadant.
**Verifiering:** guest/staff UPDATE → `42501`; owner UPDATE → OK.

### 2. `profiles_select` — PII/GDPR-läcka `[KRITISK]`
**Nu** (`schema.sql:769-782`): varje med-medlem i valfritt delat stall ser `full_name`, **`phone`**, `username`, `location`. En guest kan skörda alla telefonnummer.
**Fix:** RLS är row-level och kan inte dölja kolumner. Två alternativ:
- **(rekommenderat)** Skapa `public.profiles_public` vy (id, full_name, username, avatar_url) + `security_invoker`/RPC för med-medlemmar; behåll full `profiles`-select endast för `auth.uid() = id`. Byt alla klient-läsningar av andras profiler till vyn/RPC.
- Kolumn-`GRANT`: revoke select på `profiles` för authenticated, grant select på säkra kolumner — krångligare med RLS.
**Verifiering:** staff läser annans profil → får ej `phone`; läser egen → får allt.

### 3. `posts_select` — grupp-privacy `[KRITISK / produktbeslut]`
**Nu** (`schema.sql:1127`): `posts_select = is_stable_member(stable_id)`. Grupp/ägar-scoping finns **bara i klienten** (`feed.tsx:170-195`), och `loadMorePosts` saknar grupp-filter helt.
**Viktig upptäckt:** Det finns **ingen per-användare gruppmedlemskaps-tabell**. `groups` (`schema.sql:684`) har bara `type` (stable/farm/horse/custom) + stable/farm/horse-koppling, och `posts.group_ids` är en `text[]`. Klientfiltret scopar bara på stall/gård — inte på individ. → "Privata gruppinlägg" är i praktiken **inte privata idag**, ens i designen.
**Fix beror på Öppen fråga B:**
- Om grupper = bara ämnestaggar inom stall → RLS är "korrekt nog"; dokumentera att privat postning inte finns och ta bort vilseledande UI.
- Om vi vill ha **riktig** privacy (t.ex. hästägare ser bara sin hästs grupp) → inför `group_members` (eller härled via `horses.owner_user_id` för horse-grupper) och skriv om `posts_select` att respektera det. Fixa även `loadMorePosts`-filtret.

### 4. Chatt: `conversation_members_insert` + saknade message-policies `[KRITISK]`
**Nu** (`schema.sql:1218-1219`): insert kollar bara `auth.uid() = user_id` → en användare kan **self-inserta** i en gissad `conversation_id` och sen läsa historiken (`messages_select` släpper in alla conversation_members). `messages` saknar **UPDATE/DELETE-policy helt** → ingen kan redigera/radera, och ingen modereringsväg.
**Fix:**
- `conversation_members_insert`: tillåt bara om `auth.uid()` är `created_by_user_id` på konversationen, ELLER redan medlem (för gruppinbjudan av befintlig medlem). Annars sker member-tillägg via `SECURITY DEFINER`-RPC (`add_conversation_member`).
- `conversation_members_select`: tillåt att se andra medlemmar i **egna** konversationer (idag bara egna rader → kan ej rendera deltagarnamn) — via vy/RPC, ej bred profiles-läsning.
- Lägg `messages_update`/`messages_delete`: författare på egen + stall-owner/admin för moderering.
**Verifiering:** self-insert i främmande conversation → `42501`; författare raderar egen → OK; admin raderar i sitt stalls konversation → OK.

### 5. `assignments_update` — riders kan skriva om vad som helst `[HÖG]`
**Nu** (`schema.sql:972-973`): `using (can_edit_stable OR can_claim_assignments)`. RLS kan inte begränsa *vilka kolumner* en rider ändrar, så en rider kan skriva om `label`/`time`/`status` på vems pass som helst, inte bara claima/decline:a.
**Fix (rekommenderat):** Inför `SECURITY DEFINER`-RPC:er `claim_assignment(id)` / `decline_assignment(id)` / `complete_assignment(id)` som bara muterar `assigned_to`/`status`/`declined_by` med rätt guards. Ta bort `can_claim_assignments` ur `assignments_update` (lämna bara `can_edit_stable`). Byt klientens claim/decline/complete till RPC.
**Verifiering:** rider UPDATE label direkt → nekas; rider anropar claim_assignment → OK; rider claimar redan-taget pass → fel (server-authoritative, löser även dubbelclaim).

### 6. Service-role-nyckel i plaintext GUC `[HÖG]`
**Nu** (`20250313_push_notification_triggers.sql:20-22`): `notify_push` läser `current_setting('app.settings.service_role_key')` och skickar den i payload-header. Nyckeln ligger i plaintext DB-GUC och loggas potentiellt.
**Fix:** Flytta nyckeln till Supabase Vault (`vault.decrypted_secrets`) eller edge-function-secret; låt triggern hämta via `vault`-läsning i `SECURITY DEFINER`. Verifiera att den inte längre dyker upp i `pg_settings`/loggar.

### 7. `posts_delete` — admin kan inte moderera `[MEDEL, tas i Fas 1 men RLS-delen här]`
**Nu** (`schema.sql:1133`): bara författaren. Admin/owner saknar delete-gren → modereringsväg saknas.
**Fix:** Lägg `or public.can_manage_groups(stable_id)` (eller is_stable_owner) i `posts_delete`. (Klientens rows-affected-check görs i Fas 1.)

### 8. RLS-paritetsaudit mot `resolvePermissions` `[HÖG]`
All auktorisering förlitar sig idag delvis på klient-JS (`resolvePermissions` i AppDataContext). 
**Fix:** För varje `persist*`-väg (assignments, feed_plans, feed_checks, horse_day_statuses, care_events, stable_invites, stable_members) — bekräfta att RLS oberoende enforce:ar stall + roll, så en crafted klient inte kan skriva cross-stable. Dokumentera matrisen roll × tabell × operation.

---

## Öppna frågor (för review-gate)
- **A:** Ska personal (staff) få ändra stall-`settings`/`ride_types`, eller bara owner? (Avgör `stables_update` → `is_stable_owner` vs `can_edit_stable`.)
- **B:** Är grupper riktig per-användare-privacy eller bara ämnestaggar inom stall? (Avgör om vi inför `group_members` eller bara dokumenterar/städar UI.)
- **C:** Moderering — vem får radera andras inlägg/meddelanden: bara owner, eller owner+admin?

## Test- & utrullningsstrategi
1. Skriv en SQL/pgTAP-svit (`supabase/tests/rls_fas0.sql`) som loggar in som var och en av de 5 seed-rollerna och asserterar tillåtet/nekat per hål ovan.
2. Kör mot lokal/staging Supabase med `seed_qa.sql`. Alla assertions gröna.
3. Migrationer som idempotenta `drop policy if exists` + `create policy` (matchar befintlig stil), en migration per hål för granskbar diff.
4. Klientändringar (RPC-byten för claim/profiles/conversation-members) bakom samma PR så RLS-åtstramningen inte bryter UI.
5. `npm run lint`, `tsc --noEmit`, e2e-svit grön före merge.

## Risker
- Att strama RLS utan att byta klient-läsningar → vита skärmar/tomma listor. Mitigering: RPC-byten i samma PR + e2e.
- `profiles_public`-vy kan missa fält som UI förväntar sig → inventera alla profil-läsningar först.
- Vault-flytt av service-key kräver redeploy av edge function + trigger-omskrivning → testa push end-to-end på staging.

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail (/autoplan)

| # | Fas | Beslut | Klass | Princip | Motivering | Förkastat |
|---|-----|--------|-------|---------|------------|-----------|
| 1 | CEO | Splitta Fas 0 → 0A pilot-gate + acquisition, defer resten till 0B | User Challenge | — (user beslutade) | Båda röster: full Fas 0 före acquisition är överinvestering på 0-användarprodukt | Full Fas 0 först |
| 2 | Eng | `stables_update` = owner-only (`is_stable_owner(id)`), ej `can_edit_stable` | Mechanical | P1 completeness | join_code på samma rad; edit-access skulle annars rotera koden. Avgör Öppen fråga A | can_edit_stable |
| 3 | Eng | Behåll `created_by = auth.uid()` i stables_update | Mechanical | P1/P5 | Annars lockout om owner-membership-insert faltat | Ren owner-only |
| 4 | Eng | #4 via `create_private_conversation`-RPC + `is_conversation_member`-helper | Mechanical | P5 explicit | Batch-insert av båda raderna kräver atomisk RPC; helper undviker RLS-rekursion | Ren policy-ändring |
| 5 | Eng | RPC kräver delat stall-medlemskap | Taste | P2 boil lakes (in blast radius) | Stänger spam-edge (tvinga chatt på vilken profil som helst) | Tillåt valfri user_id |
| 6 | Eng | Defer dubbel-claim (#5) + PII (#2) till 0B | Mechanical | P3 pragmatic | Acceptabel risk med ~5 betrodda pilotstall | Inkludera i 0A |

### TASTE-beslut till final gate
- **#5 (owner-only stable-edit i 0A):** staff/admin tappar settings-redigering tills 0B. Alternativ: kolumn-granularitet redan i 0A (mer jobb). Rek: defer till 0B.
