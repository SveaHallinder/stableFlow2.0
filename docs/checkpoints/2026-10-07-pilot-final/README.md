# StableFlow: slutkontroll av lokalt pilotpaket

Målet är att stallmedlemmar ska kunna gå med i rätt stall och sköta dagens pass,
hästar, hagar, foder och kommunikation från dator och telefon. Detta paket rättar
de sista verifierade felvägarna i häst-, inbjudnings- och kontoflödena samt appens
native-länkar. Det kompletterar [hagarnas ID-modell](../2026-10-06-paddock-ids/README.md).

Utgångspunkt: `7edf504506465c358667e62283128fdf148496aa`.
Verifierad kodcommit: `c21bff5ab8aacafb699e40d553d39774834c4600`.
GitHub-gren: `codex/stableflow-pilot-20261005`,
[utkast-PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2),
målgren `balanced-mvp-1.1.0`.

## Beteende

- Hästsparning omfattar nu både bildförberedelse och databaskvittens inom
  15 sekunder, även om transporten ignorerar avbrytning. Borttagning har samma
  tidsgräns. Sena svar ändrar inte lokal hästlista eller formulär och visar inget
  godkänt sparbesked. Utkastet ligger kvar; uppdatera hästlistan före återförsök.
- En bekräftad inbjudan behåller den normaliserade mottagaradressen när formuläret
  töms. Kvittot skiljer personlig inbjudningskod från stallkod och visar vägen via
  samma e-postadress, Skapa konto och Har inbjudan. Mottagare, instruktioner och
  samtliga stallkoder kan kopieras tillsammans. Misslyckad kopiering ger tydligt
  fel och markerbar text. Kvittot lovar inte att ett mejl har levererats.
- Kontoradering knyter begäran till det konto användaren bekräftade. Edge-funktionen
  jämför `expected_user_id` med verifierad JWT-identitet före administrativa
  läsningar och kräver samma UID från Auth-raderingen. Klienten kräver
  `{ deleted: true, user_id: samma_UID }` innan lokal avslutning.
- Raderingskvittens och felkropp omfattas av 15 sekunder. Efter verifierad radering
  rensas de faktiska lokala Auth-nycklarna inom 10 sekunder och frånvaron kontrolleras.
  Avslutningen väntar inte på ett fjärrutloggningsanrop eller pushavregistrering.
  Misslyckad lokal rensning får ett eget återförsök som endast rensar sessionen,
  även efter att man lämnat och återöppnat kontosidan. Ett annat inloggat konto
  bevaras genom samma SDK-lås och ett gemensamt mutationslås för sessionslagring.
  Sena sessionshändelser och lagringsskrivningar för det bekräftat raderade kontot
  stoppas i samma appkörning. Vanlig inloggning och utloggning använder sina
  befintliga API:er; skyddet revokerar inte redan utgivna JWT på servern.
- iOS och Android registrerar nu `stableflow`, som appens befintliga confirm- och
  reset-länkar redan använder. Befintliga scheman är kvar. Ingen ny native-build,
  signering, EAS-konfiguration eller pushaktivering ingår.

Inga nya dependencies, ändringar av databasschemat eller providerinstallationer
ingår i detta paket. En låst SecureStore-operation kan inte avbrytas säkert från
JavaScript. Efter dess tidsgräns avslutas UI-väntan och lagringsanrop ger tydligt
fel tills OS-operationen svarar eller appen startas om. En omstart bevisar inte
att rensningen lyckades; därför visas inget falskt utloggningsbesked vid lagringsfel.

## Verifiering

Slutkontroller på frysta produkt-/regressionsfiler 2026-10-07:

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 374/374, inga överhoppade |
| `npm run lint` | exit 0 |
| `tsc --noEmit` | exit 0 |
| `npm run build:web` | exit 0, export i `dist` |
| Isolerade UI-prov | 68/68 i 12 specs på localhost |

Kontopaketet passerade även 45/45 riktade prov i ett separat oberoende omtag.
Två egna SDK-reproduktioner verifierade den första raderingskvittensen när ett
annat konto redan är aktivt samt faktisk lösenordsinloggning med två SDK-klienter
under pågående rensning. Båda bevarar det nya kontots UI och persistenta session.
Granskningen passerade utan kvarvarande verifierade P1/P2. Hästskrivningar,
inbjudningsdata, kvitto och native-scheman är också granskade. Alla 18 ändrade
kod-/regressionsfiler hade samma granskade hash före och efter slutkontrollerna;
den enda ytterligare ändringen är detta checkpointdokument.

UI-urvalet omfattar kontoradering/återställning, bild-/hästskrivningens sena svar,
inbjudningskvitto och acceptans, roller, medlemslayout, kalender och pass, sök,
kontaktvyer, hag-ID, konfliktmeddelanden samt saknad DB-installation. De nya
kontoproven körs vid 390 px och kvittot vid 390 och 1280 px. Det är lokala
Chromium-prov; inget fysiskt telefonprov eller native-build har genomförts.

Databasproven passerade de befintliga schema-/migreringskontrollerna, 48
hag-/roll-/RPC-kontroller på hela schemat, den exakt godkända backfill-fixturen,
nio stopp för ogodkänt underlag och tolv verkliga tvåanslutningsfall för RC/RR,
kvittensretry, borttagning/skapa och passiva hästkaskader. Ingen testning mot
driftdatabasen eller verklig positionsmappning ingår.

```sh
npm test
npm run lint
./node_modules/.bin/tsc --noEmit
npm run build:web
```

UI-urvalet körs på localhost med syntetiska svar och demo-fixtures. En separat
lokal Playwright-konfiguration blockerar ointerceptad extern trafik, och de nya
kontofallen använder den installerade Auth-SDK:n och den riktiga lagringsadaptern.
Inga riktiga konton raderas och inga mejl eller pushnotiser skickas i dessa prov.
Kör inte hela e2e-mappen som denna kontroll: andra specs använder riktiga QA-konton.
Databastesterna i `npm test` använder en egen tillfällig PostgreSQL-instans över
Unix-socket med TCP avstängt och syntetiska data. De läser ingen extern DB-URL.

Den samlade UI-körningen använde
`/tmp/stableflow-pilot-final-playwright-20261007.config.mjs`, som importerar
repo-konfigurationen och sätter en nekande lokal proxy för externa anrop;
localhost är undantaget och service workers blockerade. Det skyddar även tidigare
fixtures som har smalare requestintercept än de nya tre specarna.
Körningsunderlag: `/tmp/stableflow-pilot-final-{tests,lint,typecheck,build,ui}-20261007.log`,
`/tmp/stableflow-account-independent-final-review-20261007.json` samt
`/tmp/stableflow-pilot-final-reviewed-20261007.json`.
Loggar och lokala artefakter kan försvinna vid datorrensning; detta dokument
bevarar resultat och omfattning.

## Kort UI-QA

1. Starta `npm run dev -- --web --port 8081` och öppna
   `http://localhost:8081/?qaDemo=1`. På telefon på samma nät används den senast
   kontrollerade adressen `http://192.168.8.108:8081/?qaDemo=1`. Kontrollera ny
   adress med `ipconfig getifaddr en0` om nätet byts.
2. Öppna Idag och Schema. Jämför Mina pass för valt stall, ta ett ledigt pass och
   markera det klart. Foderkoll per häst och avslutat fodringspass kvitteras separat.
3. Öppna Hästar och Hantera hästar. Byt namn på en demohäst och kontrollera dess
   hagkoppling i listan, profilen, Idag och sök. Demoändringar försvinner vid omladdning.
4. Öppna Stall och Bjud in medlem med en syntetisk adress som
   `recipient@example.test`. Kontrollera kvittots adress, personlig kod,
   inloggningsinstruktioner och Kopiera inbjudan med instruktioner.
5. Kör de isolerade UI-proven nedan för sena hästsvar, ofullständig kvittens,
   lagringsfel efter kontoradering, navigation tillbaka och byte till annat konto.
   Kontrollera återförsök utan en andra serverradering. Alla backendanrop i dessa
   tre specs är lokala fixtures; radera inget riktigt konto för detta prov.
6. Kör `node --test scripts/native-auth-redirects.test.mjs`. Registrerade URL-scheman
   ska matcha confirm/reset. Ett faktiskt telefonprov kräver en byggd native-app;
   XML- och redirectproven ersätter inte det provet.

```sh
E2E_URL=http://localhost:8081 ./node_modules/.bin/playwright test -c scripts/e2e/playwright.config.mjs scripts/e2e/invite-receipt.spec.mjs scripts/e2e/horse-save-timeout.spec.mjs scripts/e2e/account-delete-quality.spec.mjs --output=/tmp/stableflow-pilot-final-ui-qa
```

## Återstående driftaktivering

Läsande kontroller av det kända Supabase-projektet 2026-10-07 verifierade att
projektet är aktivt och att `paddock_horses` och den nya hagsparnings-RPC:n saknas.
Sex äldre namnpositioner behöver uttryckligen godkända häst-ID. Ett privat
underlag innehåller fem kandidater och en omatchad position; inga verkliga
identifierare, namn eller godkända mappningar har lagts i det publika repot.
Ingen migration har installerats i denna körning.

`delete-account` saknas fortfarande i drift. Kontoradering behöver beslut före
schemaändring och distribution: `stables.created_by` är NOT NULL trots FK med
SET NULL; `farms.created_by` är NOT NULL utan FK och gårdpolicies följer skaparen;
driftens inlägg/kommentarer använder CASCADE där källschemat använder SET NULL.
CASCADE för ett inlägg kan även radera andra personers svar och gillanden.
Ägaröverlåtelse, raderingsomfattning och redan utgivna JWT behöver accepteras före
ett verkligt raderingsprov. Ingen sådan radering eller schemaändring har körts.

`send-invite` är installerad och dess källa matchar repot, men ingen
inbjudningstrigger, mejlproviderkonfiguration eller testmottagare har bekräftats.
Verklig leverans är därför inte slutprovad. Hostingkontona kräver fortfarande
inloggning och val av befintligt projekt/HTTPS-host. Det tidigare Vercel-hindret
från 2026-10-05 är historiskt underlag och har inte verifierats på nytt som ett
aktuellt kontohinder. EAS-projektet och native/push är inte aktiverade här.

Användaren har en fysisk telefon. Telefonsystem, verklig inbjudningsmottagare,
hostingprojekt och slutprovet med dator plus telefon återstår. Koden är provbar
på localhost; dessa externa acceptanspunkter ska inte räknas som färdig drift.

## Ändrade filer

```text
android/app/src/main/AndroidManifest.xml
app/settings/account.tsx
components/InviteReceipt.tsx
context/AppDataContext.tsx
context/AuthContext.tsx
docs/checkpoints/2026-10-07-pilot-final/README.md
ios/StableFlow/Info.plist
lib/supabase.ts
scripts/account-delete-auth.test.mjs
scripts/account-delete-ui.test.mjs
scripts/delete-account.test.mjs
scripts/e2e/account-delete-quality.spec.mjs
scripts/e2e/horse-save-timeout.spec.mjs
scripts/e2e/invite-receipt.spec.mjs
scripts/horse-save.test.mjs
scripts/invite-receipt.test.mjs
scripts/invite-save.test.mjs
scripts/native-auth-redirects.test.mjs
supabase/functions/delete-account/index.ts
```
