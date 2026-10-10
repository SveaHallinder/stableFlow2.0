# StableFlow: återställningsmejl och GitHub-kontroll

Detta paket fortsätter [webbpilotens senaste kontroll](../2026-10-07-auth-and-offline-qa/README.md).
Utgångspunkt: `376a5f2c0161374a1f44cc49647aff7831f1dd07`.
Verifierad kodcommit: `86a076290122e54390741296fd967382f6e0ca8c`.
Gren: `codex/stableflow-pilot-20261005`,
[utkast-PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2).

## Beteende

- Glömt lösenord släpper Skickar även när installerad Auth-SDK kastar vid lokal
  lagringsrensning efter ett serverfel. E-postadressen finns kvar och kan skickas
  på nytt. Felet visas beständigt i formuläret med tillgänglighetsrollen alert.
- Serverfel visar svensk återförsökstext. HTTP 429 förklarar att användaren behöver
  vänta före ett nytt försök. Rå providertext visas inte; featureloggen innehåller
  endast felklass eller Unknown. Saknad konfiguration visar en användbar feltext.
- Bekräftelsen visas endast efter lyckat SDK-svar och säger att länken kommer om
  adressen har ett konto. Det är ingen verifiering av verklig mejlleverans.
- GitHub-kontrollen använder syntetisk Supabase-konfiguration, befintlig npm-låsfil
  och en lokal utvecklingsserver för de uttryckligen tillåtna offline-UI-proven.
  Den installerar inte appen hos en provider och använder inga driftkonton.
- En färsk checkout behöver Expo-genererade routertyper före TypeScript-kontrollen.
  Ordinarie utvecklingsserver genererar dem; workflow väntar på både servern och
  typfilen. Ingen ändring av appens navigation eller tsconfig behövdes.

Ingen ny appdependency, låsfil eller schemaändring ingår. CI:s exakta filer och
lokala resultat redovisas nedan; faktisk GitHub-körning redovisas i PR:ens Checks.

## Verifiering

Slutkontroller på frysta produkt- och regressionsfiler:

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 402/402, fail 0, skip 0 |
| `npm run lint` | exit 0 |
| ESLint på de fyra ändrade produkt-/test-/konfigfilerna | exit 0 |
| `tsc --noEmit` | exit 0 |
| `npm run build:web` | exit 0, export i dist |
| `npm run test:e2e` | 81/81 i 16 specs |
| CI-workflow: YAML, Bash och lokala pipelinekommandon | verifierade; Linux/GitHub redovisas i Checks |
| `git diff --check` | exit 0 |

Fyra nya Node-regressioner misslyckades före fixen och passerar efter den.
Ett av dem använder installerad Auth-SDK och reproducerar ett faktiskt kastat
lagringsfel efter ett syntetiskt serverfel, följt av lyckat återförsök.
Den oberoende granskningen passerade 4/4 Nodeprov och 2/2 UI-prov vid 390 och
1280 px med oförändrade källhashar och utan verifierade P1/P2. Alla nätanrop är
fixtures eller blockerade; inga verkliga återställningsmejl skickades.

En separat mobilrunda granskade Idag, pass, hästprofil, foder och hagar vid
390 × 844 px med touch. Tio skärmbilder sparades, inga nya användarhinder eller
externa anrop noterades. Det är Chromium-QA; fysisk telefonacceptans är separat.

CI-förberedelsen verifierade syntetisk webbexport och hela tidigare urvalet
79/79 UI-prov på baseline 376a5f2. Färsk checkout utan routertyper gav först
TypeScript-fel; vanlig dev-Metro genererade typen och TypeScript passerade sedan.
GitHub-runnerns faktiska körning är en egen kontroll, inte bevisad av lokala prov.

## Kort QA-script

1. Starta `npm run dev -- --web --port 8081` och öppna
   `http://localhost:8081/?qaDemo=1`. På telefon på samma Wi-Fi används datorns
   adress från `ipconfig getifaddr en0`; senast kontrollerad adress var
   `http://192.168.34.76:8081/?qaDemo=1` den 2026-10-07.
2. Kör `npm run test:e2e -- auth-forgot-password.spec.mjs`. Kontrollera fel utan
   låst Skickar, kvarvarande e-post, tydlig väntetext för HTTP 429 och lyckat
   återförsök. Dessa prov skickar inga riktiga mejl.
3. Kör `npm run test:e2e -- auth-reset.spec.mjs auth-submit-recovery.spec.mjs` för
   återställningslänk, fönsterfokus, stallfel och inloggningens återförsök.
4. Ta och slutför ett ledigt demopass. Följ foderkoll och hagstatus mellan Idag,
   Hästar och Hagar via appens navigation. Demoändringar försvinner vid omladdning.
5. Kör `npm test`, `npm run lint`, `./node_modules/.bin/tsc --noEmit`,
   `npm run build:web` och `npm run test:e2e`. Nodeprov ska inte hoppas över.
6. Öppna PR:ens Checks och verifiera kontrollen för den senaste pushade committen.
   GitHub-kontrollens resultat ersätter inte telefonslutprov eller driftacceptans.

## Native och drift

En ny läsande inventering fann en ansluten iPhone samt Xcode och iOS-simulator.
Inga giltiga signeringsidentiteter hittades. De två förberedda native-diffarna
passerar fortfarande git apply --check; den tidigare isolerade Pods-installationen
är borta och måste skapas på nytt för ett bygga/starta-prov. ReachabilitySwift-
beslutet väntar enligt användarens AGENTS-regel "Ingen ny dependency utan att
fråga". Ingen nativefil, telefoninstallation, signering eller appstart ingår här.

Den förberedda utvecklingsprofilen använder expo-dev-client som inte finns bland
projektets installerade dependencies. Minsta lokala simulatorväg är befintligt
bare Debug-bygge efter godkänt Pods-förslag. Befintligt EAS-placeholder behöver
inte bytas för detta lokala steg eftersom nativeuppdateringar är avstängda.

Godkänd hagmappning/schemainstallation, verklig inbjudningsleverans, beslut om
raderingsomfattning, hosting och slutprov på telefon kvarstår enligt tidigare
checkpoint. En uppdaterad telefonlänk bevisar serveråtkomst från datorn; användaren
har tillfrågats om det faktiska telefonprovet och inget godkänt svar har registrerats
för det provet i denna checkpoint.

## Ändrade filer

```text
.github/workflows/ci.yml
app/(auth)/forgot-password.tsx
scripts/auth-forgot-password.test.mjs
scripts/e2e/auth-forgot-password.spec.mjs
scripts/e2e/playwright.offline.config.mjs
docs/checkpoints/2026-10-07-forgot-password-and-ci/README.md
```
