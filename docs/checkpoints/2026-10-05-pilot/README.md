# StableFlow pilot — 2026-10-05

Målet är en användbar stallapp: Idag, hästar/foder, schema, medlemmar och
inbjudningar fungerar med rätt behörigheter även när två personer arbetar samtidigt.
Kod och databasens skydd är verifierade. Publik webb, mejlleverans och fysisk
telefonacceptans återstår; detta är därför inte en färdig produktionsrelease.

Verifierad kodcommit: `17c4da03bf6465dc903897b55523009c49d7d9b3`.
Granskningsgren: `codex/stableflow-pilot-20261005`.
[PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2) är ett utkast mot
`balanced-mvp-1.1.0`; den är inte mergad. `main` har inte ändrats.

## Vad som är byggt och infört

- Inbjuden e-post kan skapa konto utan kod. Sparad stallkod är bunden till rätt
  e-post och hanteras även om kontot har en separat mejlinbjudan till ett annat stall.
  Nätfel behåller utkastet. Tom eller utgången bekräftelselänk påstår inte framgång.
- Ridhuskonflikter, samtidig ändring och sista stallägarens borttagning/nedgradering
  ger begripliga fel. Det godkända databasskyddet installerades den 1 oktober och
  återkontrollerades den 5 oktober. Historiska stall har lämnats orörda.
- Medlemslistan fungerar vid 390, 1024 och 1280 px, inklusive kontaktuppgifter,
  roller, profilsida och tydligt tomt sökresultat.
- Schemas fem filter radbryts på mobil. Klick på Vård och återgång till Stallschema
  skjuter inte längre hela vyn åt sidan; ett beteendetest reproducerade felet före rättningen.
- `send-invite` är installerad i Supabaseprojekt `zbcghmpjslasnxqcodqa`, med
  JWT-kontroll och ytterligare service-role-kontroll. Granskad källfil matchar den
  installerade editortexten. Anonyma anrop och anon-nyckel nekades med HTTP 401.
  Installation är inte bevis på mejlleverans.
- Ingen ny dependency. Endast tidigare godkänt ridhus-/ägarskydd har införts i
  driftschemat. Förslaget nedan om mejltrigger har inte installerats.

## Färska kontroller

| Kontroll | Resultat | Omfattning |
| --- | --- | --- |
| `npm test` | 252/252, inga hoppade | Inklusive lokal databas: 20 schema- och 71 arkiverade kontroller |
| `npm run lint` | exit 0 | Även riktad lint på ändrade UI-testfiler |
| `npx tsc --noEmit` | exit 0 | TypeScript |
| `npm run build:web` | exit 0 | Webbexport till `dist` |
| Riktade UI-prov | 33/33 | Inbjudningar, konflikter, höstflöde, användbarhet, medlemslayout och mobilens schemafilter; fixtures/mockad server |
| Oberoende layoutprov | 3/3 | 390, 1024, 1280 px |
| Inloggat UI mot riktig databas | 3/3 | Foderkoll sparas och överlever omladdning; gäst saknar skrivknappar; exakt en vinner ett samtidigt passanspråk |
| Live SQL | 88/88 | 20 ridhus/ägare, 46 pass/foder-behörigheter, 22 inbjudningsacceptans; ROLLBACK |
| Live samtidighet | 8/8 | Två anslutningar, Read Committed/Repeatable Read; verklig låsväntan observerad |

Efter databasproven hade samtliga 38 kontrollerade tabeller samma antal och
radhash som före proven; alla isolerade testposter var borttagna. Efter de riktiga
UI-proven var samtliga 36 publika tabeller och `auth.identities` oförändrade.
`auth.users` ändrades av QA-inloggningarna, utan ändrat antal konton.
Pass och foderposter återställdes och kontrollerades. Inga mejl, chattar eller
pushnotiser skickades.
Passanspråket återkördes efter mobilrättningen: 1/1 passerade. Ett tidigare
omprov föll på konkurrerande Playwright-rapportmappar; separata output-mappar
löste testkollisionen och inga QA-poster blev kvar.

## Testa nu via UI

Servern körs på [localhost](http://localhost:8081). Demo:
[localhost med testdata](http://localhost:8081/?qaDemo=1).
Telefonlänk på datorns nuvarande nätverk:
[StableFlow-demo](http://172.20.10.5:8081/?qaDemo=1).
Telefonen behöver nå datorn; IP-adressen kan ändras. Ingen fysisk telefon har
sluttestats av agenten. En telefon plus dator räcker för två samtidiga användare.

Starta från arbetskopian med `npm run dev -- --web --port 8081` efter omstart.

### Kort QA-script

1. Öppna demo på telefon och dator. Kontrollera Idag, Hästar och Schema; text
   och knappar ska gå att läsa och nå i båda bredderna. Klicka Vård och tillbaka
   till Stallschema/Lediga; vänsterkanten ska ligga kvar inom skärmen.
2. Öppna Medlemmar. Sök efter ett obefintligt namn: tydligt tomt läge. Rensa,
   öppna QA Medlem och kontrollera profil samt synliga kontakt- och rollknappar.
3. Öppna Saga i Hästar. Kontrollera foderplan och Höstatus; gå tillbaka och
   kontrollera att översikten uppdateras. Demodata återställs vid omladdning.
4. Logga in med befintligt QA-hästägarkonto, registrera foderavvikelse och ladda
   om. Noteringen ska finnas kvar. QA-gäst ska sakna foderknappar på andras hästar.
5. Med två QA-konton på telefon/dator, ta samma särskilt skapade QA-pass.
   Exakt en ska lyckas och den andra ska få ett tydligt konfliktbesked.
6. Efter mejlkonfiguration: använd en uttryckligen godkänd testadress, skapa
   en inbjudan, välj Har inbjudan utan kod, bekräfta e-post och kontrollera rätt
   stall/roll efter omladdning. Återställ endast egna QA-poster.

## Det som kräver konto-/användaruppgifter

- **Webbpublicering:** Vercel nekade `vercel project add stableflow-pilot --scope
  sveahalls-projects` med `Your Team exceeded our fair use limits and has been
  blocked.` Ingen StableFlow-webb har publicerats där. Spärren behöver lösas i det
  befintliga kontot, eller en befintlig godkänd HTTPS-host anges.
- **Mejlleverans:** verklig HTTPS-`APP_URL`, Resend-konfiguration, verifierad
  `INVITE_FROM_EMAIL`, tillåtna Supabase-bekräftelseredirects och en godkänd
  testadress saknas. Hemliga nycklar ska läggas i leverantörens sekretessinställningar,
  aldrig i chatten eller Git.
- **Mejltrigger:** granska [konkret SQL-förslag](invite-delivery-proposal.sql).
  Det skapar två privata funktioner och en insert-trigger; direkt RPC-exekvering
  nekas för klientroller. Privilegierade anrop är bundna till exakt detta
  Supabaseprojekts HTTPS-origin; separat Vault-namn aktiverar inte befintlig push.
  Förslaget har oberoende kodgranskning och 23 lokala SQL-kontroller utan nätanrop,
  inklusive nekad klient-exekvering och en stub för leveranskö.
  Det är ett förslag, inte en installerad migration. Den äldre
  `20260613_fas2_invite_delivery.sql` ska inte köras oförändrad eftersom den lämnar
  en service-role-anropande funktion direkt körbar med standardbehörigheten PUBLIC.
  Godkännande krävs enligt användarens instruktion: "Inga schemaändringar utan att fråga".
- **Native/push:** `app.json` innehåller fortfarande `YOUR_EAS_PROJECT_ID`.
  Kör `eas login` i det befintliga Expo-kontot för att identifiera rätt projekt;
  ett riktigt projekt-ID och fysisk installations-/pushkontroll krävs.
- **Kontoborttagning:** befintligt driftschema har `stables.created_by NOT NULL`
  med `ON DELETE SET NULL`. Kontoborttagning efter ägarbyte är inte accepterad;
  den befintliga konflikten ska inte ändras utan ett separat godkänt schemaförslag.

## Testkommandon och bevis

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build:web
npx playwright test -c scripts/e2e/playwright.config.mjs pilot-db-conflicts.spec.mjs pilot-member-layout.spec.mjs invite-acceptance.spec.mjs autumn-ui.spec.mjs stable-usability.spec.mjs --output=/tmp/stableflow-fixture-ui-results
npx playwright test -c scripts/e2e/playwright.config.mjs feed-owner-permissions.spec.mjs staging-assignment-claim.spec.mjs --output=/tmp/stableflow-real-ui-results
```

De två sista kommandona kräver att localhostservern körs. Det sista använder
befintliga QA-konton mot databasen och återställer sina egna testposter; kontrollera
först att QA-konton inte har push-token och att utskick inte är aktiverade.
Databasproven ska köras mot exakt rätt projekt, med isolerade test-ID:n och
städning; kör inte hela `schema.sql` mot drift.

Bevis från denna körning finns lokalt i `/tmp/stableflow-tests-final-20261005.log`,
`/tmp/stableflow-ui-final-e2e-calendar-frozen-final-20261005.log`,
`/tmp/stableflow-real-ui-acceptance-20261005.log`,
`/tmp/stableflow-live-claim-isolated-20261005.log`,
`/tmp/stableflow-live-acceptance-20261005.json` och
`/tmp/stableflow-live-unchanged-proof-20261005.json`.
Förslagskontrollen finns i `/tmp/stableflow-invite-proposal-final-20261005.json`.
De är körningsunderlag, inte beständiga artefakter efter datorrensning/omstart.
