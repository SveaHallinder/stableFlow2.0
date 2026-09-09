# Balanced MVP — Staging QA Report

**Datum:** 2026-05-04
**Backend:** Supabase (riktig, alla 6 migrationer applicerade)
**Frontend:** Expo Web på `localhost:8081`
**Testverktyg:** Playwright (`scripts/e2e/staging-qa.spec.mjs`)
**Roller:** 5 confirmerade auth-användare seedade via `supabase/seed_qa.sql` (lösenord `QaTest1234!`)

## Sammanfattning

| Kategori   | Antal |
| ---------- | ----- |
| Funkar     | 11    |
| Funkar ej  | 0     |
| Blocker    | 0     |
| Småfix     | 4     |

Alla 9 QA-script-steg + steg 9b guest-sanity gröna mot riktig backend. Inga blockers.

## Steg-för-steg

| Steg | Roll(er)                       | Vad testas                                                                            | Status |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------- | ------ |
| 1    | admin                          | Auth + seed: login fungerar, sidebar visar `StableFlow QA Stable`                      | OK     |
| 2    | admin                          | Idag prioriterar Stallstatus först + Saknar ansvarig                                   | OK     |
| 3    | staff                          | Idag prioriterar Mina uppgifter / Lediga pass                                          | OK     |
| 3b   | medryttare                     | Idag visar mina uppgifter/mina hästar                                                  | OK     |
| 4    | horse owner                    | Idag prioriterar Dina hästar först                                                     | OK     |
| 5    | admin → owner → staff          | Admin sätter stallplan; owner sätter per-häst override; staff markerar klart           | OK     |
| 6    | staff                          | Hage-status från hästprofil syncar med `/paddocks`                                     | OK     |
| 7    | owner → staff                  | Owner planerar ridpass; staff slutför → ride log skapas                                | OK     |
| 8    | admin                          | Skapar extern kontakt; bokar care event; visas i Schema/Vård; slutför → vårdhistorik   | OK     |
| 9    | admin                          | Skapar Akut alert; syns i Idag Viktigt-kort + Feed-strip men ej som vanlig feed-post   | OK     |
| 9b   | guest                          | Read-only sanity, hästar-listan tillgänglig                                            | OK     |

## Småfix (icke-blockerande, fixade i samma session)

1. **`supabase/seed_qa.sql` lämnade onboarding incomplete.** Admin landade på onboarding-skärmen efter login eftersom seed inte satte `arena.hasArena`, `onboarding.resourcesComplete` eller skapade någon `assignment`. Fixat genom att seed nu uppdaterar `stables.settings` med arena/onboarding-flaggor och insertar två assignments + en paddock om de saknas. Idempotent.

2. **Auth-knappen "Logga in" matchade två element.** Toggle-knappen och submit-knappen delar samma `aria-label`. Locator i e2e bytt till `button[aria-label="Logga in"]` `.last()` (submit ligger sist i DOM).

3. **QuickAction Pressable saknade `accessibilityRole`.** `getByRole('button', { name: 'Händelser' })` hittade inte cardet eftersom Pressable inte sätter role i RN-Web utan explicit `accessibilityRole`. Fixat i `app/(tabs)/index.tsx:QuickActionCard` genom att lägga till `accessibilityRole="button"` + `accessibilityLabel={action.label}`. Förbättrar både e2e-stabilitet och a11y i prod.

4. **Async persist-race i e2e.** `actions.upsertX` är optimistiska (dispatchar lokalt, persist via `void persistX(...)` i bakgrunden). När test stänger context omedelbart efter toast cancellerade Playwright in-flight requests så data försvann. Lagt till `page.waitForTimeout(2000)` efter toast i steg 5/7/8/9 mellan dispatch och navigation/context-stängning. Lokal UX-effekten kvarstår — ingen användarsynlig påverkan.

## Resultat-artefakter

Skärmdumpar per steg i `/tmp/stableflow-e2e-screens/qa-step*.png`:

- `qa-step1-admin-login.png`
- `qa-step2-admin-idag.png`
- `qa-step3-staff-idag.png`
- `qa-step3b-rider-idag.png`
- `qa-step4-owner-idag.png`
- `qa-step5a-admin-default.png`
- `qa-step5b-owner-override.png`
- `qa-step5c-staff-check.png`
- `qa-step6-paddock-sync.png`
- `qa-step7-ride-completed.png`
- `qa-step8a-care-created.png`
- `qa-step8b-care-completed.png`
- `qa-step9-alert-on-feed.png`
- `qa-step9b-guest.png`

## Lokala test-gate efter ändringarna

```
npm test          → 39/39
npm run lint      → ren
npx tsc --noEmit  → ren
git diff --check  → ren
```

## Verdikt

**MVP grön.** Inga blockers, inga öppna funktionsbrister mot plan QA Script. Klart att shippa.
