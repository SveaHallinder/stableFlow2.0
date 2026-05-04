# Balanced MVP — Staging QA Checklist

Run after applying all migrations and `supabase/seed_qa.sql`. Plan QA Script steg 1–9 (one row per scenario), 5 roles. Fyll i Status med `OK` / `Funkar ej` / `Blocker` / `Småfix`. Anteckna repro under Notering.

---

## Förberedelser (en gång)

### 1. Skapa 5 confirmade auth-användare i Supabase Auth dashboard

Email måste matcha `seed_qa.sql` exakt. Sätt lösenord direkt och bekräfta email-adressen (eller stäng av email confirmation tillfälligt på staging).

| Roll        | Email                              | Lösenord (välj ett)       |
| ----------- | ---------------------------------- | ------------------------- |
| admin       | `stableflow-admin@example.test`    | _________________________ |
| staff       | `stableflow-staff@example.test`    | _________________________ |
| horse owner | `stableflow-owner@example.test`    | _________________________ |
| medryttare  | `stableflow-rider@example.test`    | _________________________ |
| guest       | `stableflow-guest@example.test`    | _________________________ |

### 2. Kör seed:en

```sql
-- I Supabase SQL editor:
-- (klistra in supabase/seed_qa.sql och kör)
```

Förväntad output: `Success. No rows returned.`

Om felet `Create all confirmed auth users before running supabase/seed_qa.sql.` visas → någon email saknas i auth.users.

### 3. Verifiera seedat data

```sql
select id, name from public.stables where name = 'StableFlow QA Stable';
select id, name, owner_user_id from public.horses where name = 'StableFlow QA Horse';
select user_id, role, access, rider_role from public.stable_members
  where stable_id = (select id from public.stables where name = 'StableFlow QA Stable');
```

Du ska se: 1 stall, 1 häst (ägd av owner-användaren), 5 medlemskap.

---

## QA-matris

> Lägg gärna till skärmdump-filnamn i Notering-kolumnen för buggar.

### Steg 1 — Setup verifierat

| Kontroll                                              | Status | Notering |
| ----------------------------------------------------- | ------ | -------- |
| Alla 5 auth-användare kan logga in                    |        |          |
| `seed_qa.sql` körde utan exception                    |        |          |
| stable_members-raden för respektive roll har rätt access |        |          |

### Steg 2 — Admin på Idag

Login som **admin**. Öppna `/`.

| Kontroll                                                                | Status | Notering |
| ----------------------------------------------------------------------- | ------ | -------- |
| Idag-rubriken är "Stallstatus först" / "Saknar ansvarig" syns           |        |          |
| Insights-grid visar Stallstatus, Saknar ansvarig, Ej klart, Foder/hage, Alerts |        |          |
| Roll-pill visar "Admin" / "Ägare" |        |          |
| Foder nu-kortet visas och listar Saga                                  |        |          |
| Viktigt-kortet är dolt (inga aktiva alerts ännu — ok) eller visar 0 aktiva |        |          |

### Steg 3 — Staff och medryttare på Idag

Login som **staff**, sedan **medryttare**. Öppna `/`.

| Kontroll                                                          | Roll       | Status | Notering |
| ----------------------------------------------------------------- | ---------- | ------ | -------- |
| Idag-rubrik är "Dina uppgifter först" eller motsvarande           | staff      |        |          |
| Insights visar Mina uppgifter, Nästa pass, Lediga pass, Alerts    | staff      |        |          |
| Default-passet (Morning/Evening) syns för aktuell veckodag        | staff      |        |          |
| Idag-rubrik prioriterar mina uppgifter och lediga pass            | medryttare |        |          |
| Foder nu-kortet visar bara Saga (kopplad häst via horse_ids)      | medryttare |        |          |

### Steg 4 — Horse owner på Idag

Login som **horse owner**. Öppna `/`.

| Kontroll                                                                | Status | Notering |
| ----------------------------------------------------------------------- | ------ | -------- |
| Idag-rubriken är "Dina hästar först"                                    |        |          |
| Insights visar Mina hästar, Foder/status/hage, Ridning/vård, Alerts     |        |          |
| Saga visas under "Öppna Saga"                                            |        |          |

### Steg 5 — Foderplan-flöde (3 roller)

| Kontroll                                                                 | Roll        | Status | Notering |
| ------------------------------------------------------------------------ | ----------- | ------ | -------- |
| Sätt stallstandard för Morgonfoder från hästprofil → "Lägg till stallplan" | admin       |        |          |
| Sätt per-häst override för Saga (t.ex. lunch)                            | horse owner |        |          |
| Markera klart från Idag-Foder nu-kortet                                  | staff       |        |          |
| Foderkoll dyker upp under "Senaste foderkollar" på hästprofil            | staff       |        |          |
| Spara avvikelse → texten syns i historik                                 | staff       |        |          |

### Steg 6 — Hage-status sync

| Kontroll                                                            | Roll  | Status | Notering |
| ------------------------------------------------------------------- | ----- | ------ | -------- |
| Sätt Saga "Ute" + "Hö Klart" från hästprofilens Dagens status       | staff |        |          |
| Öppna `/paddocks` → samma status reflekterad                        | staff |        |          |
| Ändra status från `/paddocks` → ändringen syns på hästprofil        | staff |        |          |

### Steg 7 — Planera ridpass

| Kontroll                                                            | Roll        | Status | Notering |
| ------------------------------------------------------------------- | ----------- | ------ | -------- |
| Skapa planerat ridpass via hästprofilens Ridning/träning             | horse owner |        |          |
| Slutför ridpass + skriv längd & note                                | medryttare  |        |          |
| Ridning-historikraden ("Senaste loggade pass") får nytt entry        | medryttare  |        |          |
| `ride_logs.completed_ride_log_id` på planned_rides är ifylld (DB-kontroll, valfritt) | _ | | |

### Steg 8 — Vårdhändelse

| Kontroll                                                            | Roll  | Status | Notering |
| ------------------------------------------------------------------- | ----- | ------ | -------- |
| Lägg till veterinär-kontakt via `/contacts`                         | admin |        |          |
| Skapa care event för Saga med kontakten kopplad                     | admin |        |          |
| Eventet syns i Schema → Vård-filtret                                | admin |        |          |
| Slutför care event med slutkommentar                                | admin |        |          |
| Eventet flyttas till Vårdhistorik på hästprofilen                   | admin |        |          |

### Steg 9 — Kommunikationsseparering

| Kontroll                                                                  | Roll        | Status | Notering |
| ------------------------------------------------------------------------- | ----------- | ------ | -------- |
| Skapa feed-post via Feed → syns som vanlig social post                    | admin       |        |          |
| Skapa Akut-alert via Idag → Händelser → "Akut"                            | admin       |        |          |
| Akut-alert syns i Idag Viktigt-kortet med "Löst"-knapp                    | admin       |        |          |
| Alert syns även i Feed → "Viktigt i stallet"-strippen, **ej** som vanlig post | admin       |        |          |
| Skicka chatt till medryttare via privat konversation → kommer fram i `/messages` | admin       |        |          |
| Klicka Löst → alertet försvinner från aktiva listan                       | admin       |        |          |

### Steg 9b — Guest read-only sanity

Login som **guest**.

| Kontroll                                                              | Status | Notering |
| --------------------------------------------------------------------- | ------ | -------- |
| `/` visar "Läsbar stallstatus" eller motsvarande                      |        |          |
| Inga edit-knappar på Foder, Status, eller Vårdhändelser                |        |          |
| "Du kan läsa detta, men inte ändra." syns där relevant                |        |          |
| Försök markera klart-foder → får felmeddelande/access denial          |        |          |

---

## Sammanställning

```
Funkar:    ___ / ___
Funkar ej: ___ / ___
Blocker:   ___
Småfix:    ___
```

Vid grönt: säg till mig "QA grönt" så kör jag ship-flödet (rensa test-results, bump version, commit, PR, deploy, smoke, release).

Vid blocker: dela repro/skärmdumpar så fixar jag.
