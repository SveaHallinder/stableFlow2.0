# StableFlow: kvalitetskontroll 2026-10-06

Målet är en pilot där stallmedlemmar kan gå med, få rätt åtkomst och sköta dagens
pass, hästar och hagar från dator eller telefon. Det nya kodpaketet är lokalt
verifierat. Skarp release återstår tills namnbytesfelet och de externa
acceptanspunkterna nedan är lösta.

Utgångspunkt: `7e8da7a2fb6ec9a60aac2d09ac11eb9557a28f6c`.
Verifierad kodcommit: `929561e5aff7836d310673370f2c66571927ede4`.
Den tidigare pilotverifieringen finns i `../2026-10-05-pilot/README.md`.
Denna kontroll gäller nya kodrättningar och lokala UI-fixtures.

## Rättningar

- Idags nästa egna pass hämtas från valt stall, som kalendern redan gör.
- Mina och Lediga hittar kommande matchande pass även efter sju andra passdagar.
  Vyn visar fortfarande högst sju matchande dagar.
- Gäster får inga passknappar när motsvarande skrivbehörighet saknas.
- Personal med Redigera når hästhantering; fullständiga stallinställningar behåller
  administratörskontrollen. Behörigheten gäller valt stall. Läsbehörighetens copy
  gäller hästens grunduppgifter och påstår inte att tillåten foder-/statuskoll är låst.
- Hästsparning kräver att servern bekräftar varje skickat fält, även borttagna
  värden. Ett gammalt svar får inte ge ett falskt sparbesked.
- Kontoradering återställer formuläret efter fel och kräver uttrycklig
  raderingskvittens från både Auth och Edge. Ett synkront lås stoppar dubbelklick,
  anropet avbryts efter 15 sekunder och sista ägaren blockeras enligt det befintliga
  databasvillkoret. UI beskriver att innehåll kan finnas kvar.

Inga nya dependencies eller ändringar av driftschemat ingår i dessa rättningar.

## Verifiering

Slutkontroller mot samma frysta produktfiler 2026-10-06:

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 286/286, inga överhoppade |
| `npm run lint` | exit 0 |
| `tsc --noEmit` | exit 0 |
| `npm run build:web` | exit 0, export i `dist` |
| Isolerade UI-prov | 48/48 på localhost |

UI-urvalet omfattar de nya kalender-, roll- och kontofallen samt tidigare
inbjudning, DB-konfliktmeddelanden, medlemslayout, höstflöden och användbarhet.
Kontoraderingsprov använder lokala stubs; inget riktigt konto har raderats.
Driftkontrollen denna dag läste endast metadata och aggregerade antal.
Oberoende granskning av rättningarna i de 13 kod-/regressionsfilerna: PASS utan
verifierade P1/P2 i de nya ändringarna;
43 riktade AST-prov och sex kontroller av roller mellan olika stall passerade.
Filhasharna jämfördes efter granskningen och var oförändrade inför commit.
Den efterföljande copyrättningen i `app/(tabs)/stable-horses.tsx` granskades också
oberoende. Alla kontroller i tabellen kördes därefter på den slutliga koden.

ID-förslagets separata lokala databasprov passerade 26/26 och kördes även av den
oberoende granskaren. Saknade eller gamla mappningar stoppar före DDL; originaltext,
null och verkliga tabbar bevaras. Förslaget är fortfarande granskningsunderlag och
ingår inte i appens färdiga UI-rättningar.

```sh
npm test
npm run lint
./node_modules/.bin/tsc --noEmit
npm run build:web
./node_modules/.bin/playwright test -c scripts/e2e/playwright.config.mjs pilot-db-conflicts.spec.mjs pilot-member-layout.spec.mjs invite-acceptance.spec.mjs autumn-ui.spec.mjs stable-usability.spec.mjs daily-work-quality.spec.mjs horse-management-quality.spec.mjs account-delete-quality.spec.mjs --output=/tmp/stableflow-quality-fixture-ui-results
```

Starta localhost med `npm run dev -- --web --port 8081` före UI-proven. Kör inte
hela e2e-mappen som denna kontroll; andra specs använder riktiga QA-konton.
Körningsunderlag: `/tmp/stableflow-quality-{tests,lint,typecheck,build}-final-copy-20261006.log`
och `/tmp/stableflow-quality-ui-final-copy-20261006.log`. Dessa lokala loggar kan
försvinna vid datorrensning; detta dokument bevarar resultat och provomfattning.

## Kort UI-QA

1. Öppna `http://localhost:8081/?qaDemo=1`. Jämför Mina pass-kortet med Mina i
   Schema. De ska avse samma valda stall. På telefon på samma nät används dagens
   LAN-adress `http://172.20.10.5:8081/?qaDemo=1`; adressen kan ändras när nätet byts.
2. Schema: ta Lunchfodring, markera det klart och släpp Morgonfodring. Öppna
   Hantera och kontrollera passeditorn.
3. Kör de isolerade roll-/kalenderproven med UI-kommandot ovan: Mina och Lediga ska hitta dag åtta;
   gästen saknar skrivknappar; personal med Redigera når hästformuläret på mobil
   och dator men nekas fulla stallinställningar.
4. Konto i lokal demo: första Radera-klicket ber om bekräftelse; Avbryt återställer.
   Kör kontospecen för nätfel, sista ägaren och utebliven kvittens. Timeout provas
   med `node --test scripts/account-delete-ui.test.mjs` och en kontrollerad klocka.
   Dessa anrop är interceptade testanrop; radera inget riktigt konto för detta prov.
5. Öppna Hästar och en hästprofil. Kontrollera sökning, foderkoll och dagstatus.
   Demoändringar försvinner vid omladdning.

## Kvar före skarp release

- Namnbyte kan tappa en hagkoppling eftersom den nuvarande kopplingen använder
  hästnamn. En ensam namntrigger räcker inte: ett senare gammalt hagutkast kan
  återinföra det gamla namnet, och dubbla hästnamn är tvetydiga. Detta är ett
  verifierat kvarstående fel; ID-kopplingsförslaget är inte aktiverat.
  [Förslag och aktiveringskrav](README-horse-reference.md) samt
  [exakt SQL-draft](horse-paddock-reference-proposal.sql) följer för granskning.
  En förenklad namninventering i drift gav sex poster: fem matchningar, en omatchad
  och ingen tvetydig enligt just den matchningen. Granskningen visade att SQL:s
  blankteckenshantering skiljer sig från appens. Alla sex originalpositioner ska
  därför kopplas till uttryckligen godkända häst-ID; ingen automatisk namnmatchning
  eller bortkastad originaltext får användas.
- Kontoborttagning är ännu inte accepterad mot drift. Metadata lästes utan
  skrivning 2026-10-06: `stables.created_by` har NOT NULL och en FK till
  `profiles(id) ON DELETE SET NULL`. `farms.created_by` har NOT NULL utan FK;
  gårdpolicies är skaparbegränsade. Dessutom raderar driftens FK inlägg och
  kommentarer via CASCADE medan källschemat använder SET NULL. Raderingsomfattning
  och gårdöverlåtelse behöver ett uttryckligt beslut före en schema-/releaseåtgärd.
  Den nya `delete-account`-koden har inte distribuerats till Supabase i denna körning.
- Mejlaktivering, verklig inbjudningsleverans, publik webbhosting och native/push
  har samma återstående krav som pilotkontrollen 2026-10-05. Ingen mottagaradress
  har angetts och inga riktiga mejl eller pushnotiser har skickats här.
- GitHub Pages undersöktes som hostingalternativ, men är inte lämpligt för denna
  inloggade kommersiella app enligt dess
  [användningsgränser](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
  Ingen Pages-site skapades. Enligt
  [Expos hostingdokumentation](https://docs.expo.dev/guides/publishing-websites/)
  behöver den nuvarande single-page-exporten en host som hanterar appens routes.
- Det fysiska slutprovet återstår: dator och användarens enda telefon.

Stallregel som ännu inte har förtydligats: ett avslutat fodringspass och varje
hästs foderkoll kvitteras separat i den befintliga appen. Ingen automatisk
kvittering av alla hästar har införts utan det beslutet.
Behovet av tillfälliga hästar utan profil behöver också förtydligas före ID-övergången.

Schemaförslag får inte köras utan godkännande enligt användarens instruktion:
"Inga schemaändringar utan att fråga". Lokala UI-prov och kodbygge bevisar inte
att dessa releasepunkter är färdiga.
