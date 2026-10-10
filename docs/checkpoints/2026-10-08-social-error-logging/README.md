# Sociala skrivfel: begränsad diagnostik

Sex skrivvägar loggar nu endast en felklass eller `Unknown`, tillsammans med sitt befintliga feature-prefix. Supabase-felens `message`, `details` och `hint` skickas inte längre vidare till dessa konsolloggar. Användarens feltext, utkast, återförsöks-ID, timeout och kvittenshantering är oförändrade.

Ändrade filer:

- `context/AppDataContext.tsx`: diagnostik för stallhändelse, viktig notis, inlägg, gillning, kommentar och chattmeddelande.
- `scripts/social-error-logging.test.mjs`: sex regressioner mot installerad Supabase-SDK med helt syntetisk transport.
- Den här checkpointen.

## Kontroller före commit

- Samma sex SDK-prov: **0/6** på basen `11b8ff239ff1857a71a31f20f8821de085951695`, **6/6** efter ändringen.
- Oberoende granskning: sex SDK-prov och åtta egna felklass-/DELETE-/PATCH-prov passerar. Alla övriga källbytes i Context är identiska med basen.
- Lint, TypeScript och webbexport avslutas med kod **0**.
- Offline UI: **11/11** för privata chattar, fel vid medlemsuppdatering, refresh och dagliga stallflöden. Inga externa skrivningar.
- Hela lokala Node-sviten: **545 tester, 543 passerar, 2 misslyckas, 0 skippade**. Båda felen uppstår när `initdb` stoppas av värddatorns `SHMALL`-gräns, före SQL-körning. Inga systeminställningar eller andra PostgreSQL-processer ändras.
- Det första riktade UI-kommandot matchade inga tester; ovanstående 11/11 kommer från det korrigerade kommandot nedan.

GitHub-körningarna på exakt publicerad commit är slutgrind för hela Node-sviten: **545/545**, inga fel eller skippade tester, samt befintliga **106** offline UI-prov. Aktuellt resultat finns i pull requestens Checks. Ett tidigare grönt resultat räknas inte som kvittens för en ny commit.

## QA, sex steg

1. Starta lokalt med `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 node node_modules/expo/bin/cli start --web --localhost --port 8081` om servern inte redan kör.
2. Öppna `http://localhost:8081/` och kontrollera att inloggningssidan eller ditt befintliga stall visas. I Idag-vyn ska hagkortet visa `1 hage · 1 häst` när stallet har dessa antal, och passkortet ska visa `1 ledigt pass` när ett pass är ledigt; andra antal använder plural.
3. Kör `node --test scripts/social-error-logging.test.mjs`; alla sex prov ska passera utan externa anrop.
4. Kör `npm run test:e2e -- chat-and-refresh-quality.spec.mjs core-stable-workflow.spec.mjs`; alla elva UI-prov ska passera med bevarade fel-/återförsöksflöden.
5. Kör `npm run lint`, `node node_modules/typescript/bin/tsc --noEmit` och `npm run build:web`; alla ska avslutas med kod 0.
6. Kontrollera båda GitHub-körningarna på den nya commitens SHA. Kräv 545 Node-prov och 106 UI-prov, samtliga gröna; lokala PostgreSQL-startfel ovan ersätter inte detta krav.

## Språk i Idag-vyn

`app/(tabs)/index.tsx` rättar även kortens singular: `1 hagar · 1 hästar` blir `1 hage · 1 häst`, och `1 lediga pass` blir `1 ledigt pass`. Endast orden ändras; räknare, behörigheter, tomt läge och varningen för obekräftade hästkopplingar är oförändrade.

Loggfixens commit `562d5f8286b6e69cb057ba145231fa30207141ee` och språkändringens `37c187a6da633a153682a5a28fe741e8d8605a64` har passerat båda GitHub-körningarna: 545 Node-prov, inga fel/skippade, och 106 offline UI-prov vardera.

## Riktad lint av regressionstestet

En extra kontroll av den nya testfilen hittade `no-undef` för `URL` på rad 8. Testet importerar nu `URL` uttryckligen från befintliga Node `node:url`. Riktad lint och samma sex SDK-prov passerar. Ingen dependency, produktfunktion eller schemaändring ingår. Den nya commitens fulla CI ska kontrolleras på dess egen SHA.

## Återstående slutprov och beslut

Detta är en avgränsad loggfix. Hela produkten är ännu inte slutgodkänd. De separata schemaförslagen för oläststatus, skrivgränser, hagkopplingar, bildåtkomst och kontoradering samt den nya native-datumväljardependencyn har egna gransknings- och godkännandegrindar. Seriehantering och vårdpåminnelser behöver fortfarande konkreta produktbeslut och implementation.

Riktiga inbjudningar, lösenordsåterställning, fysisk telefon, native distribution och push kräver sina faktiska slutprov. Enbart simulator, syntetiska UI-prov eller mottaget återställningsmejl räknas inte som dessa kvittenser. Extern publicering väntar enligt användarens uttryckliga besked.
