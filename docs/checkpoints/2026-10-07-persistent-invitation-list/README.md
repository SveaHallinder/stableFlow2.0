# StableFlow: beständig ägarlista för inbjudningar

Utgångspunkt: `5a0e5081a0d2d4f4c0b63bd41e8c5ca455586801`.
Verifierad kodcommit: `3a76c747a7c8fbefe3416ad01fd423775fca3318`.
Gren: `codex/stableflow-pilot-20261005`,
[utkast-PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2).
Detta fortsätter [konto-, recurring- och webbpaketet](../2026-10-07-account-recurring-and-web/README.md).

## Beteende

Admin visar nu det valda stallets sparade inbjudningar, även efter omladdning.
Listan visar mottagare, befintliga rollnamn, skapandedatum samt Väntande,
Accepterad eller Utgången. Accepterad har företräde framför tidigare expiry.
Den läser högst 51 rader och visar de 50 senaste med tydlig begränsningstext.
Inbjudningskoder hämtas inte av listan och statusen lovar ingen mejlleverans.

Listan kräver samma ägarregel som databasen: medlemsrollen admin **och** access
owner i just det valda stallet, plus matchande aktiv Auth-/datasession. Den
har synlig laddning, tomt läge, beständigt svenskt fel, Försök igen och Uppdatera
inbjudningar. En ny bekräftad inbjudan för samma stall laddar om listan.

Konto-/stall-/behörighetsbyte döljer gamla mottagare redan på första renderingen.
Ett eget scope-objekt, effect-cleanup och AbortController hindrar gamla svar och
fel från att skriva till en ny eller avmonterad vy. Loggen har prefix
`[stable invites]` och innehåller inga råa providertexter eller mottagaruppgifter.

Demoläget visar tre uttryckligt märkta syntetiska status-exempel. Copy förklarar
att nya demoinbjudningar visas i kvittensen. Verklig lista använder befintlig
Supabase-tabell. Ingen schemaändring, dependency, låsfil, providerändring eller
ny send/resend/delete-kontroll ingår.

## Verifiering

| Kontroll på frysta, integrerade källor | Resultat |
| --- | --- |
| `npm test` | 534/534, fail 0, skip 0 |
| `npm run lint` | exit 0 |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `npm run test:e2e` | 106/106 i 21 offline-specs |
| `npm run build:web` | exit 0 |
| Faktisk produktionsexport: konto, login och listans SDK-retry/omladdning | 9/9 |
| Oberoende granskning av listan | 43/43 |
| `git diff --check` | exit 0 |

SDK-proven kör installerad Supabase 2.89.0 med syntetisk Auth/PostgREST-transport.
De verifierar scoped GET, datumgräns, 50/51-rader, A/B/A före effects, stallbyte,
behörighetsförlust, kvittens → refresh, unmount och StrictMode. Två negativa
kontroller bevisar att scope-/cleanup-regressioner verkligen upptäcks.
Alla sex frysta kandidatfiler matchade SHA före och efter oberoende körning.

Browserproven visar status/roll/mottagare på 390 och 1280 px samt loading,
empty, fel/retry och behörighetsbyte. Ett vanligt Auth-/AppData-flöde går genom
den faktiska SDK-queryn: syntetiskt HTTP 403 → Försök igen → sparad rad →
sidomladdning, med tre kontrollerade stallfiltrerade GET. Det provet passerar
även i produktionsexport, där demoläget är avstängt.

En separat läsande live-katalogkontroll bekräftar tabellfälten, SELECT-policyn,
admin/owner-helpern och `relrowsecurity=true` (`relforcerowsecurity=false`).
Detta bevisar metadata, inte ett autentiserat kundprov. Inga verkliga konto-
eller inbjudningsrader har lästs. Testtransport, externa HTTP/WebSockets och
service workers spärras före navigation; inga riktiga mejl eller skrivningar
gjordes. Den byggda lokala exporten har syntetiska publika klientvariabler.

GitHub-kontroll för exakt senaste pushade SHA redovisas i PR:ens Checks.
Lokal integration och CI hålls skilda från extern distribution och telefon-QA.
Den temporära isolerade worktreen har en återställbar arkivsnapshot; slutkoden
och testerna finns i pilotgrenen.

## Kort QA-script

1. Starta `npm run dev -- --web --port 8081`. Öppna
   `http://localhost:8081/admin?qaDemo=1` och scrolla till Inbjudningar. Tre
   märkta exempel med rätt status, roll och datum ska vara läsbara på mobil.
2. Kör `npm run test:e2e -- stable-invite-list.spec.mjs` för tomt läge,
   laddningsfel, återförsök, maxgräns och byte av stall/roll/session. Inga tidigare
   mottagare ska finnas kvar efter bytet.
3. Kör `node --test scripts/stable-invite-list.test.mjs` för faktisk SDK,
   scope-, unmount- och StrictMode-prov. Kör även hela `npm test`, lint,
   `tsc --noEmit` och `npm run test:e2e` innan release.
4. Följ `docs/deploy-web.md` för syntetisk produktionsexport och egen lokal
   server. Kör `E2E_URL=http://localhost:8083 npm run test:e2e --
   stable-invite-list.spec.mjs --grep='ordinary owner'` mot servern. SDK-fel,
   återförsök och omladdning ska passera utan riktiga backendanrop.
5. Kontrollera exakt SHA och båda GitHub-CI-körningarna. Gör slutprovet på
   dator och den tillgängliga telefonen. Verklig inbjudningsleverans kräver den
   ännu ej angivna godkända mottagaren och providerinställningarna.

## Återstår innan hela appen är klar

Ägarlistan är nu byggd och lokalt verifierad. Den övriga avstämningen i
[föregående checkpoint](../2026-10-07-account-recurring-and-web/README.md#avstämning-mot-hela-planen)
gäller fortfarande: permanenta läskvittenser, serier, automatisk vårdrecurrence,
server-rate-limit, push-receipts/cleanup och native datumväljare är oavslutade.
Privatgrupper, bilagor, mer hästdata och prenumeration behöver produktmodeller.

Privata chattpolicyer, hagmappning/schema, kontoraderingsmodell/deployment,
inbjudningsprovider/trigger, realtime-publicering, ny HTTPS-host samt
native/EAS/push och fysisk telefonacceptans återstår. De konkreta
schema-/dependencyförslagen och frågorna är fortfarande obesvarade. Inget av
detta räknas som driftsatt eller 100% klart genom lokala prov.

## Ändrade filer

```text
app/admin/index.tsx
components/StableInviteList.tsx
lib/stableInvites.ts
scripts/stable-invite-list.test.mjs
scripts/e2e/stable-invite-list.spec.mjs
scripts/e2e/playwright.offline.config.mjs
ROADMAP.md
docs/checkpoints/2026-10-07-persistent-invitation-list/README.md
```
