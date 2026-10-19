# StableFlow — staging och slutprov

Aktuell status: [releaseöversikt 2026-10-10](docs/checkpoints/2026-10-10-release/README.md). Hela appen är ännu inte slutaccepterad. Extern publicering väntar.

## Rätt miljö och godkänd ändringslista

Befintligt StableFlow-projekt är **`zbcghmpjslasnxqcodqa`** och innehåller befintliga data. Kontrollera projektidentiteten före varje provideråtgärd. Ett annat anslutet Supabase-projekt får inte användas som ersättning.

Läs migrationshistoriken med `supabase migration list` endast när CLI redan är länkat till rätt projekt. Vid saknad inloggning sker den lokalt med `supabase login`; eventuell länkning använder `supabase link --project-ref zbcghmpjslasnxqcodqa`. Ange hemligheter i det lokala verktygets avsedda inmatning, aldrig i chatten, kommandoraden eller Git.

En lista över väntande migrationer är **inte** ett godkännande att installera dem. Använd en namngiven, granskad och uttryckligen godkänd ändringslista, grön CI på samma produktcommit samt dokumenterad ordning och efterkontroll. Kör varken generell `supabase db push`, hela `schema.sql` eller `seed_qa.sql` mot befintligt projekt som standardsteg. Paketet med 38 filer, sex migrationer och separat driftkonfiguration väntar fortfarande på godkännande.

Deploy av en edge-funktion, Auth-konfiguration, Vault/secrets och Cron är separata driftändringar. Redan installerade versioner framgår av releaseunderlaget; installera inte om dem utan konkret behov. Kontrollera endast avsedda redirect-adresser och mallar. Stäng inte av e-postbekräftelse för att få ett prov grönt.

## Lokala prov och verkliga testkonton

`npm run test:e2e` använder den blockerande offlinekonfigurationen. Gröna syntetiska webbprov bekräftar inte mejlleverans, Hosted RLS, fysisk telefon eller push. Lokalt UI-prov finns i [design-qa.md](docs/design-qa.md).

Den separata `scripts/e2e/staging-qa.spec.mjs` använder fem fördefinierade rollkonton. Den ska bara köras mot ett avgränsat, godkänt teststall med uttryckligt godkännande för konton och seeddata. Sviten avbryter före browserstart om `E2E_QA_PASSWORD` saknas eller bara innehåller blanksteg; inget lösenordsfallback finns. Förse testprocessen med ett nytt starkt testlösenord genom `E2E_QA_PASSWORD` från lokal hemlighetshantering, utan att skriva värdet i dokumentation, shellhistorik eller loggar. Bekräfta att variabeln är satt innan körning. Testkonton, lösenord och städning ska vara beslutade innan seed eller registrering utförs.

Starta rätt lokala appmiljö utan QA-demo för verkliga backendprov och ange dess adress i `E2E_URL`. Kör sedan den avgränsade filen explicit:

```sh
./node_modules/.bin/playwright test scripts/e2e/staging-qa.spec.mjs --config scripts/e2e/playwright.config.mjs
```

Kontrollera testernas förväntningar mot aktuell UI innan de används som slutacceptans. Skicka riktiga inbjudningar eller återställningsmejl bara till en godkänd mottagare och dokumentera faktisk mottagning, länköppning och avslutat flöde separat. Ingen riktig kontoradering ingår i standardprovet.

## Slutprov

Följ de sex stegen i [releaseöversikten](docs/checkpoints/2026-10-10-release/README.md). Dator och användarens enda iPhone används för de verkliga proverna. Kostnader, betalmedlemskap och extern publicering är inte godkända av denna runbook. Rapportera utförda prov och kvarstående steg; ersätt inte ett saknat telefon- eller mejlprov med lokala testresultat.
