# StableFlow: hagar kopplade till häst-ID

Målet är att stallmedlemmar ska kunna sköta pass, hästar, hagar, foder, ridning och
kommunikation från dator och telefon. Detta paket slutför ID-kopplingen mellan
hästar och hagar i appen och förbereder motsvarande databasövergång.

Utgångspunkt: `2d22f36c1e4e7c265a22113a920b0d960b396286`.
Verifierad kodcommit: `fca7d51596d20f8f70474f78af69773471ff4150`.
GitHub-gren: `codex/stableflow-pilot-20261005`,
[utkast-PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2),
målgren `balanced-mvp-1.1.0`. PR:n behålls som utkast; ingen merge eller
produktionsaktivering ingår. Koden integreras med fast-forward i det lokala
arbetsrepot efter kontroller av dess ursprungliga commit och rena arbetsyta.

## Beteende

- Hagar, hästlista, hästprofil, Idag, sök och utskrift använder hästens ID och
  aktuella namn. Ett namnbyte tappar inte kopplingen. Samma häst kan visas i flera
  hagar; två hästar med samma namn kan väljas separat, med box och ägare som stöd.
  Dagstatuslistan och dess knappar särskiljer också samnamniga hästar.
- Alla fyra formulär väljer hästar från sitt stall. Valda knappar har korrekt
  `aria-pressed` på webben. Administratörs- och läsbehörigheter behålls.
- Spara och Ta bort kräver serverns fullständiga kvittens. Gamla formulär skickar
  den version de öppnades med och får ett tydligt konfliktmeddelande. Val och
  formulär ligger kvar vid fel; inga ändringar visas som sparade i förväg.
- Ett oförändrat sparförsök återanvänder request-ID och förberedd bild efter
  förlorad kvittens. Ändrat innehåll får ett nytt request-ID. Bildförberedelse,
  sparning och borttagning är begränsade till 15 sekunder även om transporten
  inte reagerar på avbrytning.
- Servern sparar hagen och dess hästval atomiskt. Uppdatering och borttagning
  jämför version under lås. Borttagna hag-ID sparas privat så att ett gammalt
  skapa-försök inte återupplivar hagen. Låset gäller det enskilda hag-ID:t.
- Originalets äldre namnarray, inklusive null och blanktecken, sparas oförändrad.
  Den är ett historiskt underlag. Ingen automatisk namnmatchning eller skrivning
  från gamla klienter ingår. Direkt tabellskrivning nekas även för oförändrade
  namnarrayer; klienten använder behörighetskontrollerade RPC-funktioner.
- Om ID-relationen saknas laddas äldre uppgifter för läsning. Hagskrivning stängs
  av och kopplingar/antal visas som obekräftade. Saknad RPC stänger också av
  hagändringar efter första felet utan att radera utkast eller andra grupper.
  Nätfel och behörighetsfel maskeras inte som en äldre databasversion.
- När en häst har tagits bort kan tidigare hämtade ID-kopplingar vara obekräftade
  tills haglistan uppdateras. Saknade hästar får inte ge en falsk tom hage eller
  ett godkänt sparbesked. Databasen uppdaterar koppling och version vid kaskaden.

Inga dependencies har tillkommit. Användarens "GOGOOGOOOOO" efter modellfrågan
togs som godkännande att bygga ID-modellen och dess lokala migration/tester.
Inga produktionsmappningar eller DDL-åtgärder har körts i detta paket.

## Verifiering

Kontroller mot de frysta produktfilerna 2026-10-06:

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 338/338, inga överhoppade |
| `npm run lint` | exit 0 |
| `tsc --noEmit` | exit 0 |
| `npm run build:web` | exit 0, export i `dist` |
| Isolerade UI-prov | 60/60: 12 hagprov och 48 tidigare regressionsfall |

DB-provet som ingår i `npm test` passerade 48 SQL-kontroller på hela schemat och
samma 48 på den uttryckligen mappade migrationen, nio stopp för ogodkänt eller
inaktuellt migreringsunderlag samt tolv verkliga tvåanslutningsfall. Fallen täcker
Read Committed och Repeatable Read, gamla utkast, kvittensretry, radering,
passiva hästkaskader och väntande skapa-försök efter skapa+radera i samma transaktion.
Det befintliga guard-provet passerade också sina 20 schema- och 71 migreringskontroller.

Spar-/läslogiken och de fyra formulären är oberoende granskade, inklusive den
rättade installationsgaten och knappsemantiken på webben. Den separata DB-granskningen
passerade utan konkreta P1/P2-fynd. Den sista dagstatusrättningen granskades
oberoende och verifierades med faktiska UI-labeluttryck. Samtliga slutkontroller
kördes därefter på frysta produktfiler; de granskade filhasharna jämfördes före
commit. De två hag-specarna använder riktiga produktionscallbacks med syntetisk
Auth och lokala HTTP-svar, samt lokala demo-fixtures för läsvyer. Testerna
blockerar externa writes och WebSockets före navigation. Det är lokala
Chromium-prov, med hagfallen vid 390 px; inget fysiskt telefonprov har gjorts.

Körningsunderlag: `/tmp/stableflow-paddock-ids-{tests,lint,build}-final-20261006.log`,
`/tmp/stableflow-paddock-ids-typecheck-final-20261006.log`,
`/tmp/stableflow-paddock-ids-ui-final-20261006.log` och
`/tmp/stableflow-paddock-ids-regression-ui-20261006.log`. Loggarna kan försvinna
vid datorrensning; detta dokument bevarar resultat och omfattning.

```sh
npm test
npm run lint
./node_modules/.bin/tsc --noEmit
npm run build:web
```

Databastestet använder en egen tillfällig PostgreSQL-instans över Unix-socket
med TCP avstängt. Det laddar varken appens miljöfil eller en extern DB-URL.
Provdata är syntetiska. Roll-/modellprov körs mot både hela källschemat och den
exakta migrationen; verkliga tvåanslutningsprov kontrollerar samtidighet.
Körningsmiljön kräver en befintlig PostgreSQL-installation och en Unix-användare
som inte är root. Ett överhoppat DB-prov är inte bevis på databasbeteende.

## Kort UI-QA

1. Starta `npm run dev -- --web --port 8081` och öppna
   `http://localhost:8081/?qaDemo=1`. På den enda telefonen på samma nät används
   `http://172.20.10.5:8081/?qaDemo=1`; kontrollera ny LAN-adress om nätet byts.
2. Öppna Hästar, Hantera hästar och byt Sagas namn. Kontrollera att hagkopplingen
   fortfarande visas i hästlistan, profilen och Idag. Demoändringar försvinner vid
   omladdning eller manuell datauppdatering.
3. Öppna Hagar och skapa en hage med den omdöpta hästen. Kontrollera att den gamla
   och den nya hagen visas för samma häst. Sök på det nya namnet och skriv ut
   haglistan; namnet ska följa med till båda hagarna.
4. Kör de två isolerade hagproven nedan. De väljer två hästar med samma namn från
   rätt stall och provar de fyra formulären med nätfel, utebliven kvittens,
   versionskonflikt och godkänt svar. Utkast/ID-val ska ligga kvar vid varje fel.
5. I samma prov kontrolleras läsrollen, äldre originaltext/null, okända ID och tom
   haglista med obekräftad koppling. Inga falska antal eller "Ingen hage" ska visas.
6. Kontrollera borttagningens Avbryt och fullständiga kvittens i det isolerade
   provet. Saknad installation ska stänga av hagändringar och behålla utkastet.
   Dessa prov använder lokala HTTP-svar och blockerar externa writes/WebSockets;
   inget riktigt stall, konto eller mejl ändras.

```sh
E2E_URL=http://localhost:8081 ./node_modules/.bin/playwright test -c scripts/e2e/playwright.config.mjs scripts/e2e/paddock-save-failure.spec.mjs scripts/e2e/paddock-horse-ids.spec.mjs --output=/tmp/stableflow-paddock-ids-ui
```

## Återstående aktivering och pilotacceptans

Koden kan provas på localhost. ID-modellen är inte aktiverad i drift. Migrationen
stoppar före DDL om en äldre namnposition saknar ett uttryckligen godkänt häst-ID
eller om källtext, ordning, stall eller dubbla poster inte stämmer. Var och en av
produktionens sex tidigare inventerade originalpositioner behöver bekräftas med
hag-ID, position, häst-ID och exakt råtext. Inga verkliga identifierare ska läggas
in i det publika repot. Inventeringen är ett tidigare läsresultat, inte en aktuell
eller godkänd mappning; läs och granska ett nytt låst underlag före aktivering.
Behovet av tillfälliga hästar utan profil är fortfarande en obesvarad stallregel.

Efter godkända mappningar och aktivering behöver ett riktigt stall kontrolleras
för läsning, namnbyte, spara, konflikt och borttagning med behöriga testpersoner.
De lokala proven bevisar inte att denna driftövergång är genomförd.

Övriga pilotpunkter finns i
[den tidigare kvalitetskontrollen](../2026-10-06-quality/README.md): accepterad
kontoradering och dess ägar-/gård-/innehållsbeslut, mejlaktivering och verklig
inbjudningsleverans, publik webbhosting, native/push samt ett fysiskt slutprov med
dator och användarens enda telefon. Ingen mottagaradress har angetts för mejlprovet.
Ett avslutat fodringspass och varje hästs foderkoll kvitteras fortsatt separat.
Ingen automatisk kvittering av alla hästar har införts utan ett stallbeslut.

## Ändrade filer i detta paket

```text
app/(onboarding)/setup-paddocks.tsx
app/(tabs)/index.tsx
app/(tabs)/stable-horses.tsx
app/admin/index.tsx
app/horses/[id].tsx
app/paddocks/index.tsx
app/search/index.tsx
app/stables/index.tsx
context/AppDataContext.tsx
docs/checkpoints/2026-10-06-paddock-ids/README.md
docs/checkpoints/2026-10-06-quality/README.md
lib/paddockLinks.ts
lib/paddocksPrint.ts
lib/today.ts
scripts/e2e/paddock-horse-ids.spec.mjs
scripts/e2e/paddock-save-failure.spec.mjs
scripts/paddock-horse-ids-db.test.mjs
scripts/paddock-links.test.mjs
scripts/paddock-save.test.mjs
scripts/today-alerts.test.mjs
supabase/migrations/20261006_paddock_horse_ids.sql
supabase/schema.sql
supabase/tests/paddock_horse_ids.sql
```
