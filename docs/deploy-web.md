# Webbexport på en Node-host

Detta är ett lokalt granskningsbart hostingunderlag. Inget hostingprojekt,
domän eller service har skapats och ingen app har publicerats med detta paket.
Servern använder enbart Node-standardbiblioteket och befintlig Expo-export.

## Bygg- och startkommandon

Ange dessa publika klientvariabler i den valda tjänstens byggmiljö **före export**:

- `EXPO_PUBLIC_SUPABASE_URL`: det godkända Supabase-projektets HTTPS-URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: projektets publika anon/publishable-klientnyckel.
- `EXPO_PUBLIC_QA_DEMO_MODE=0` för den verkliga appen.

Expo bäddar in klientvariabler vid byggning. Ändrade runtimevariabler ändrar inte
en redan byggd `dist`. Servernycklar hör inte hemma bland `EXPO_PUBLIC_*`.
`EXPO_NO_DOTENV=1` gör att byggningen inte hämtar en utvecklares lokala `.env`.

Byggkommando för en godkänd Node-tjänst:

```sh
npm ci && EXPO_NO_DOTENV=1 npm run build:web
```

Startkommando:

```sh
node scripts/serve-web.mjs
```

Tjänsten tillhandahåller `PORT`; servern lyssnar på `0.0.0.0` och använder annars
8080. Saknad, tom, oläsbar eller utanför exporten länkad `dist/index.html`
stoppar start före lyssning. Healthcheck-path är `/healthz`.

Healthsvaret innehåller SHA-256 för den HTML som servern faktiskt skickar.
`exportIndexSha256` är ett exportfingeravtryck, inte ett påstående om Git-SHA,
JavaScript-buntarnas innehåll eller en godkänd användarresa.

## Railway

Befintlig kontoläsning fungerar, men ingen StableFlow-service är vald. En ny
service, kostnad/domän och extern publicering behöver ett uttryckligt beslut.
Sätt kommandona ovan och `/healthz` i den godkända tjänstens inställningar.

Enligt [Railways dokumentation](https://docs.railway.com/config-as-code)
2026-10-07 kan nya tjänster inte använda `railway.json`/`railway.toml`.
Äldre tjänsters Config as Code-stöd upphör 2026-12-01. Detta paket lägger därför
inte till en sådan fil och gör inga automatiska providerändringar.

När en HTTPS-origin har valts behöver Supabase tillåta samma origins `/confirm`
och `/reset`, och inbjudningsfunktionen behöver samma godkända `APP_URL`.
Detta dokument ändrar ingen Auth- eller mejlproviderkonfiguration.

## Lokal QA

1. Kör `node --test scripts/web-serving.test.mjs`. Proven startar och stoppar
   servern på slumpmässiga loopbackportar med syntetisk export; de använder inga
   appsessioner, provideranrop eller verkliga konton.
2. Bygg en separat lokal preview med syntetiska publika variabler:
   `EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=https://synthetic.supabase.invalid EXPO_PUBLIC_SUPABASE_ANON_KEY=synthetic-client-key npm run build:web`.
3. Starta `PORT=8082 node scripts/serve-web.mjs`. Öppna
   `http://localhost:8082/` i ett nytt privat fönster och kontrollera inloggningsvyn.
   Logga inte in eller skapa konto i detta prov. Exporten är en produktionsbyggning;
   `?qaDemo=1` aktiverar ingen demo där. Demo-UI provas separat på Metro/localhost.
4. Öppna `/confirm`, `/reset` och `/horses/synthetic-id` direkt på samma localhost.
   De ska få appens HTML och visa saknad länkinformation eller inloggningsvyn;
   en saknad `/_expo/missing.js` ska ge HTTP 404. Använd inga riktiga länktoken.
5. Läs `/healthz`. Jämför `exportIndexSha256` med `shasum -a 256 dist/index.html`.
   Prova HEAD och en saknad asset; inga sökvägar eller URL-token ska visas i loggen.
6. Stoppa preview med Ctrl-C. Bygg om med den godkända tjänstens klientvariabler
   före en framtida godkänd distribution. Den syntetiska exporten är bara lokal QA.
