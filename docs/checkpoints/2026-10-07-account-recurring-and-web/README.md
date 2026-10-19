# StableFlow: kontosäkerhet, återkommande pass och webbexport

Utgångspunkt: `b5517800f056debb86ed8c26c75da4e67a9a4d65`.
Verifierad kodcommit: `1713fd69aff9b2247878f3a5f15380ff92fc5c3b`.
Gren: `codex/stableflow-pilot-20261005`,
[utkast-PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2).
Föregående paket: [kalender, medlemmar och chatt](../2026-10-07-stall-work-and-chat/README.md).

## Beteende

- Lösenords- och e-poständringar släpper vänteläget efter SDK-lagringskast eller
  providerfel och behåller utkastet för återförsök. Skrivningen binds till det
  visade, verifierade kontot i en separat Auth-klient. Ett senare kontobyte kan
  varken styra skrivningen till det nya kontot eller ersätta dess huvudsession.
  Konto-/skärmlivscykeln hindrar sena svar från att tömma ett nytt utkast eller
  visa globala kvittenser efter att kontosidan lämnats.
- Återkommande pass begränsas till **365 nya pass per omgång**. Gränsen syns i
  formuläret; fel bevarar titel, datum, dagar och tider. Decimaler, text, noll,
  negativa och för stora antal avvisas. Tomt antal betyder ett pass. Ogiltiga
  veckodagar avvisas även i datalagret. Totalgränsen kontrolleras före UUID,
  väntande batch, skrivning och lokal publicering. Befintliga pass hoppas över
  och återförsök efter förlorad kvittens använder samma ID:n.
- Introduktionen förklarar att standarddagar tilldelar pass som admin skapar.
  Den lovar inte att standarddagarna genererar schemat.
- Pushfunktionen avvisar misslyckade mottagar-, inställnings- och tokenläsningar
  samt felaktiga Expo-kvittenser. Den respekterar mottagarens blockering av en
  meddelandeförfattare. Loggar visar feature och felklass/kod, utan privata
  providertexter. Ett giltigt Expo-ticket visar accepterad begäran; leverans till
  en telefon och senare delivery-receipts är separata krav.
- `scripts/serve-web.mjs` serverar Expo-export med direkta appvägar, MIME-typer,
  GET/HEAD, asset-404 och avvisade dolda/utanför exporten länkade filer. Saknad
  export stoppar start. `/healthz` binder svaret till den faktiskt serverade
  HTML-filens SHA-256. [Hostingunderlaget](../../deploy-web.md) anger exakt bygg-
  och startkommando samt lokal QA; ingen ny service har skapats.

Ingen ny dependency, låsfil eller schemaändring ingår i detta paket.

## Verifiering av frysta källor

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 525/525, fail 0, skip 0 |
| `npm run lint` | exit 0 |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `npm run test:e2e` | 101/101 i 20 offline-specs |
| `npm run build:web` | exit 0 |
| Konto-/inloggnings-UI mot faktisk produktionsexport | 8/8 |
| Oberoende kontogranskning | 22/22 |
| Oberoende pushgranskning | 22/22 |
| Oberoende recurring-granskning | 53/53 |
| Faktisk exportserver: åtta HTTP-vägar, HEAD och HTML-fingeravtryck | passerade |
| `git diff --check` | exit 0 |

Kontogranskningen kör installerad Supabase SDK med två Auth-klienter och delad
produktionslagring. Den reproducerar den tidigare skrivningen till fel konto,
provar konto A/B/A, verkliga lagringskast, fel och återförsök, unmount och
StrictMode. Ett oberoende fynd om sena toast efter unmount åtgärdades före
slutkontrollen. Browserproven vid 390 och 1280 px kontrollerar också att hela
feltexten ryms i viewporten.

Recurring-granskningen kör verklig action, persistcallback, payload-/dedup-
hjälpare och modal-JSX mot syntetisk databas. 365 tillåts; 366 nya stoppas före
skrivning. 731 datum med 366 befintliga pass skapar exakt 365 nya. Förlorad
kvittens följd av 23505-konflikt verifierar samma payload och ID:n före dispatch.
Modal-JSX-provet är kompletterat med faktiska browserprov.

UI-proven använder syntetisk transport eller lokala demodata. Extern HTTP och
WebSockets blockeras före navigation; service workers blockeras. Inga riktiga
mejl, kontouppdateringar, pushar, chattar eller raderingar gjordes. Exporten byggdes
med syntetiska publika klientvariabler och är endast en lokal QA-export.

GitHub-resultatet för senaste pushade SHA finns i PR:ens Checks. Det ska granskas
separat från lokala prov; datorns Chromiumprov ersätter inte fysisk telefon-QA.

## Kort QA-script

1. Starta `npm run dev -- --web --port 8081` och öppna
   `http://localhost:8081/?qaDemo=1` för lokal demo. Läs introduktionen för
   standardpass och öppna Schema → Skapa återkommande pass.
2. Ange titel och 07:00–08:30 på ett datum med vald veckodag. Prova antal `1.5`,
   `20abc`, `0` och `366`: felet och utkastet ska finnas kvar och inget pass
   ska skapas. Töm antal och skapa: ett pass med rätt sluttid ska synas.
3. Förläng återkommande veckopass till 2034. Totalgränsen ska visas utan några
   tillagda pass. Förkorta intervallet och försök igen. Kör
   `npm run test:e2e -- calendar-week-quality.spec.mjs` för låsta reproduktioner.
4. Kör `npm run test:e2e -- account-security-quality.spec.mjs
   auth-submit-recovery.spec.mjs`. Proven injicerar SDK-/providerfel, kontrollerar
   bibehållna utkast och synlig feltext och provar återförsök på mobil och dator.
   De uppdaterar inga riktiga konton.
5. Kör `node --test scripts/web-serving.test.mjs scripts/push-delivery.test.mjs`.
   Följ sedan sexstegsmanuset i `docs/deploy-web.md` för faktisk syntetisk export,
   direkta `/confirm`/`/reset`, asset-404 och `/healthz`.
6. Kör `npm test`, `npm run lint`, `./node_modules/.bin/tsc --noEmit`,
   `npm run build:web` och `npm run test:e2e`; kontrollera exakt SHA och både
   push-/PR-CI. Slutför därefter ett demopass på dator och den tillgängliga
   telefonen på samma Wi-Fi. Telefonprovet har ännu inte bekräftats.

## Avstämning mot hela planen

Roadmapens 42 auditpunkter har jämförts med aktuell källa och läsande
Supabase-katalogbevis. Juni-procenten är historik. Flera äldre felpåståenden är
åtgärdade: ägarstyrd stalluppdatering, egna profilrader, skydd för sista ägaren,
servervillkorad passclaim, kvitterade skrivningar, refreshskydd, webbredirect och
sluttid i passens sparade note. Grupplistor/feed är stallgemensamma; någon
medlemsstyrd privatgruppmodell finns ännu inte att påstå fullbordad.

Detta är **en lokalt verifierad pilotkandidat; appen är inte 100% klar**.
Följande funktioner är fortfarande oavslutade: bestående oläststatus,
this-and-future-serier, automatiska vårdintervall/påminnelser, server-rate-limit,
Expo delivery-receiptcleanup, native datumväljare och beständig adminlista för
inbjudningar. Hästidentitets-/medicinuppgifter, chattbilagor, privatgrupper och
prenumeration behöver konkreta produkt-/datamodeller. AppDataContext-/stilrefactor
är inte beställd. Inbjudningslistan byggs i ett separat granskningspaket och
ingår inte i denna kodcommit.

| Driftkrav | Färsk verifiering och vad som återstår |
| --- | --- |
| Privata chattar | Befintlig RLS blockerar nystart. Separat tvåpolicyförslag har 39/39 lokala SQL-förväntningar och väntar på godkännande. |
| Hage ↔ häst-ID | UI/migration finns, men live `paddock_horses` och atomisk RPC saknas. En verklig äldre hästposition saknar matchning; användarens mappningsbeslut och schemagodkännande krävs. |
| Inbjudningar | `send-invite` v1 finns live. Trigger och providerinställningarna APP_URL, RESEND_API_KEY och INVITE_FROM_EMAIL saknas. Godkänd mottagare och faktisk mejlacceptans återstår. |
| Realtidschatt | Live realtime-publicering innehåller inga tabeller. Aktiverad publicering och dator-/telefonprov återstår. Befintlig minut-/fokusrefresh är separat. |
| Kontoradering | Edgefunktionen saknas live. Creator-/författar-/Storagerelationer kräver beslutad överlåtelse och bevarande. Projektets faktiska JWT-livstid är ännu inte verifierad. |
| Push | Live v2 är inte paketets nya källa. Deployment, providerkoppling, delivery-receipts/cleanup och fysisk push-QA återstår. |
| Native | Konkret iOS-fixförslag kräver godkännande för ReachabilitySwift 5.2.4. EAS-ID är placeholder; simulator-/telefon-/storeacceptans är inte klar. |
| HTTPS-host | Railway-kontoläsning fungerar; inget separat StableFlow-projekt finns. Granskad Node-kandidat är klar, men vald ny service, driftskostnad, HTTPS-origin och Auth-/APP_URL-bindning behöver beslut. |

Kontoraderings- och Railwayförberedelserna har bara läst sanerade metadata.
Inga verkliga konton, stall, inlägg, Storageobjekt, projekt eller tjänster har
skapats/ändrats/raderats. Schema/dependency väntar enligt användarens
AGENTS-instruktioner: "Inga schemaändringar utan att fråga" och
"Ingen ny dependency utan att fråga".

## Ändrade filer

```text
ROADMAP.md
app/(tabs)/calendar.tsx
app/(tabs)/index.tsx
app/settings/account.tsx
context/AppDataContext.tsx
docs/deploy-web.md
lib/schedule.ts
lib/supabase.ts
scripts/account-security-update.test.mjs
scripts/calendar-recurring-input-validation.test.mjs
scripts/e2e/account-security-quality.spec.mjs
scripts/e2e/calendar-week-quality.spec.mjs
scripts/e2e/playwright.offline.config.mjs
scripts/push-delivery.test.mjs
scripts/recurring-assignment-save.test.mjs
scripts/recurring-batch-limits.test.mjs
scripts/serve-web.mjs
scripts/web-serving.test.mjs
supabase/functions/send-push-notification/index.ts
docs/checkpoints/2026-10-07-account-recurring-and-web/README.md
```
