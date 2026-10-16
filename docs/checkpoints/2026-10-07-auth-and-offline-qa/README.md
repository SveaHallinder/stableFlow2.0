# StableFlow: återställning och reproducerbar lokal QA

Målet är att kunna gå med i rätt stall och sköta pass, hästar, foder, hagar,
ridning, vård och kommunikation från dator och telefon. Detta paket fortsätter
[förra pilotkontrollen](../2026-10-07-pilot-final/README.md) med verifierade fel
som hittades i den fortsatta granskningen.

Utgångspunkt: `dfc8476d9cd36d91f8af150c8c49ac19926c0729`.
Verifierad kodcommit: `c25585fd700c261e89237c8d2159748cce913d82`.
Gren: `codex/stableflow-pilot-20261005`.
[Utkast-PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2) har
`balanced-mvp-1.1.0` som målgren. Webbpaketet är byggt och lokalt granskat.
PR-integrering, driftaktivering och fysisk telefonacceptans återstår.

## Beteende

- Inloggning, kontoskapande och Skicka igen släpper sina väntelägen även när
  Auth-SDK:n kastar ett oväntat fel. Formuläruppgifterna finns kvar och felbeskedet
  låter användaren försöka igen. Loggningen använder featureprefix och felklass;
  lösenord, token, e-post och underliggande feltext skrivs inte av dessa catch-block.
- Lösenordsåterställningen stannar på återställningssidan även när användaren är
  inloggad, stallstarten är ofullständig eller stallhämtningen misslyckas.
  Vanliga auth- och stallvyer behåller sina tidigare grindar.
- Webblänkens verifierade PASSWORD_RECOVERY-händelse sparas tidigt i minnet,
  bunden till UID och token, så SDK:ns borttagning av URL-hashen inte tappar länken.
  Fönsterfokus med samma session bevarar formuläret. Ett annat konto och vanlig
  utloggning upphäver beviset; ett sent återställningsbevis uppdaterar UI.
- Explicit/native återställningslänk verifieras i en separat klient med egen
  minneslagring. Verifiering och lösenordsskrivning är bundna till rätt konto och
  kräver samma UID från serverns kvittens. En sen verifiering för A eller byte
  till B skriver varken över B:s session eller ändrar B:s lösenord.
  En giltig explicit länk fungerar även utan en primär inloggning.
- Misslyckad läsning, verifiering eller lösenordsskrivning ger tydliga fel och
  släpper vänteläget. Verifieringsfel ger ingen automatisk återförsöksloop.
  Lösenordsutkastet bevaras efter skrivfel. Rå länk eller providerfel visas inte.
  Efter bekräftad ändring går användaren till sitt aktiva konto om det matchar,
  annars till inloggning. Sena svar från en ersatt länk ignoreras.
- Demons passhistorik sparas endast lokalt. Sammanhängande UI-prov går via appens
  navigation mellan pass, foder, hagstatus, ridning, vård, kalender och profil.
- `npm run test:e2e` väljer uttryckligen 15 lokala fixture-specs genom en relativ
  konfiguration i repot. Riktiga stagingkonton ingår inte i standardurvalet.
  E2E_URL måste vara localhost, 127.0.0.1 eller [::1] över HTTP(S), utan credentials.
  En nekande lokal proxy blockerar ointerceptad extern HTTP och WebSocket-trafik.
  Service workers blockeras. En lyssnare eller oviss kontroll på proxyport 9
  stoppar körningen före browserstart.

Ingen ny dependency eller ändring av databasschemat ingår i dessa webbfixar.

## Verifiering

Slutkontroller 2026-10-07 med oförändrad granskad produktkod:

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 398/398, inga misslyckade eller överhoppade |
| `npm run lint` | exit 0 |
| ESLint på samtliga ändrade TS/TSX/MJS-filer | exit 0 |
| `tsc --noEmit` | exit 0 |
| `npm run build:web` | exit 0, export i `dist` |
| `npm run test:e2e` | 79/79 i 15 specs på localhost |
| Reset-UI efter explicit Node-import i testspecen | 4/4 |
| Reset-Node efter explicit globalThis.Headers i testspecen | 16/16 |
| `git diff --check` | exit 0 |

Den oberoende resetgranskningen passerade 40/40 riktade Node-prov och 4/4 UI-prov
utan kvarvarande verifierade P1/P2. Proven använder installerad Auth-SDK med
syntetiska transporter och reproducerar konsumerad hash, fönsterfokus, felaktig
länk, stallfel, skrivfel samt kontobyte under verifiering och lösenordsskrivning.
Den senast rättade risken med en sen A-verifiering som ersatte B:s inloggning är
stängd och har en regression. Kontots tidigare lagrings-/raderingsskydd bevaras.

Fem sammanhängande demo-UI-prov verifierade pass, foder, hagstatus, planerat
ridpass/logg, vård/kalender och gästbehörighet. Fyra körs vid 390 px, vårdfallet
vid 1280 px; inga externa backendanrop tilläts. Testfixturen kan välja befintliga
lokala demoroller och är inte bevis på verklig autentisering eller RLS.

Inloggningsgranskningen passerade separat 24/24 riktade Node-prov och 2/2 UI-prov
vid 390 och 1280 px, inklusive en verklig syntetisk lagringsrejection och återförsök.
Den samlade UI-körningens första försök hade 78 godkända och en förväntning på
äldre feltext. Endast den förväntade texten rättades; omtaget passerade alla 79.
En explicit URLSearchParams-import från node:url rättade därefter testfilens lint;
resetproven kördes om och passerade. Node-specens Headers kvalificerades med
globalThis och samtliga 16 resetprov passerade igen. Produktkoden ändrades inte
mellan kontrollerna.

Konfigurationens kanarie tillät localhost och interceptade svar, blockerade
extern HTTP och WebSocket samt gav noll träffar på den syntetiska externa servern.
URL-matrisen passerade tre godkända och sex nekade värden. Staging-specens listning
väljer noll tester. Operativsystemet nekade bindning till den privilegierade porten 9;
den upptagna-port-grenen provades med konfigurationens node:net-probe mappad till
en riktig högportlyssnare. Detta är inte bevis på en fysisk port9-lyssnare.

Databasproven använder en egen tillfällig PostgreSQL-instans med Unix-socket,
TCP avstängt och syntetiska data. De kräver en non-root Unix-användare och lokal
PostgreSQL med initdb, pg_ctl och psql; guardsprovet kräver även Python 3.
Saknade förutsättningar ger överhoppning, vilket ska redovisas som överhoppning.

```sh
npm test
npm run lint
./node_modules/.bin/tsc --noEmit
npm run build:web
npm run test:e2e -- --list
npm run test:e2e
```

## Kort UI-QA

1. Kör `npm run dev -- --web --port 8081` och öppna
   `http://localhost:8081/?qaDemo=1`. På telefon på samma nät kan samma server
   öppnas via datorns adress från `ipconfig getifaddr en0`.
2. Kör `npm run test:e2e -- auth-submit-recovery.spec.mjs`. Båda bredderna ska
   behålla e-post/lösenord efter lagringsfelet, släppa Jobbar och lyckas vid återförsök.
3. Kör `npm run test:e2e -- auth-reset.spec.mjs`. Kontrollera att återställnings-
   formuläret överlever fönsterfokus och ofullständig stallstart, att ogiltig länk
   stoppar vänteläget och att misslyckad lösenordsskrivning behåller utkastet.
4. I samma demofönster: ta ett ledigt pass i Idag, slutför det i Mina pass och
   gå tillbaka via appens navigation. Kontrollera bemanning och klart-status.
5. Följ foderplan, foderkoll och dagsstatus från hästprofil till Idag och Hagar.
   Ändringar ska stämma mellan vyerna när du navigerar utan omladdning.
6. Skapa och slutför planerat ridpass samt vårdhändelse. Kontrollera ridlogg,
   vårdhistorik och kalender. Demoändringar försvinner vid omladdning.
7. Kör hela `npm run test:e2e` samt övriga kontroller ovan. UI-proven är syntetiska
   och blockerar externa anrop; de bevisar inte fysisk telefon eller driftdatabas.

## Native och återstående drift

En isolerad kopia av `dfc8476` visade att befintlig iOS-låsfil inte matchar de
redan låsta npm-modulerna. `pod install --deployment --no-repo-update` stoppade.
Ett konkret tvåfilsförslag synkar fyra nativeversioner och registrerar elva Pods
samt fem resurspar. ReachabilitySwift 5.2.4 är den enda nya externa CocoaPods-
dependencyn, krävd av befintliga expo-updates 29.0.16. Användaren har tillfrågats
före applicering enligt den direkt lämnade AGENTS-regeln: "Ingen ny dependency
utan att fråga". Ingen repo-nativefil ändrades. Kandidatinstallationen passerade
isolerat med 107 Pods; nativebygge och appstart är ännu inte provade.
Det konkreta förslaget finns i den lokala artefaktmappen
`stableflow-native-proposal-20261007` med två diffar, README och proof.json.

Tidigare driftgates kvarstår enligt förra checkpointens daterade kontroller:
godkänd häst-ID-mappning och schemainstallation, verklig inbjudningsleverans,
beslut om kontoraderingens dataomfattning, hostingprojekt/HTTPS-origin samt
EAS/native/push och slutprov med dator plus den enda fysiska telefonen. Dessa
provideråtgärder har inte genomförts i denna webbkörning. GitHub-push är separat
från PR-integrering och distribution. Inga GitHub-CI-resultat har verifierats för
webbpaketet; ovanstående kontroller är lokala.

## Ändrade filer

```text
app/(auth)/index.tsx
app/(auth)/reset.tsx
app/_layout.tsx
context/AppDataContext.tsx
lib/supabase.ts
package.json
scripts/account-delete-auth.test.mjs
scripts/auth-reset.test.mjs
scripts/e2e/auth-reset.spec.mjs
scripts/e2e/auth-submit-recovery.spec.mjs
scripts/e2e/core-stable-workflow.spec.mjs
scripts/e2e/playwright.offline.config.mjs
scripts/invite-acceptance-auth.test.mjs
scripts/qa-demo-assignment-history.test.mjs
docs/checkpoints/2026-10-07-auth-and-offline-qa/README.md
```
