# StableFlow: nativebygge och sessionbunden chatt

Utgångspunkt: `824977d8656a12fb4aa473a6bf9e506515c4de59`.
Detta fortsätter [checkpointen för privata chattar](../2026-10-07-approved-private-chat/README.md).

## Kod och faktisk verifiering

Chattprenumerationen fångar sin användaridentitet och avaktiveras vid cleanup.
En sen callback ignoreras om sessionen eller aktuell användare har ändrats.
Det hindrar en gammal prenumeration från att skriva i en ny inloggning, även
efter A→B→A. Befintlig deduplicering, sortering och egen-meddelandehantering
bevaras. Fem regressioner utvärderar den riktiga callbacken och reducern:
ursprunglig kod har två fel; den nya passerar alla fem. Ett oberoende
lokalt prov passerar ytterligare åtta förväntningar, inklusive utloggning.

De två ursprungligen granskade iOS-fixarna och ReachabilitySwift 5.2.4 var
uttryckligen godkända. Podlåset speglar de redan installerade Expo-modulerna.
Appen får UIScene-livscykel med varm/kall länkhantering och vidarebefordrade
aktiverings-/bakgrundscallbacks. Podfile höjer enbart explicit numeriska
Pods-targets under appens redan befintliga minimum 15.1. Den tillkommande
lockjusteringen är enbart Podfile-checksum; beroendegrafen ändras inte vidare.

- Låst `pod install --deployment --no-repo-update` med befintlig Ruby 3.2.0:
  exit 0, 107 pods, samma Podfile.lock och Pods/Manifest.lock.
- Alla 240 Pods-konfigurationer med explicit numeriskt deployment target
  ligger på minst 15.1. Gränsvärdesprovet passerar 10/10; oberoende prov
  passerar tre fall med tolv förväntningar.
- Vanligt Xcode-bygge på SDK 27: exit 0, utan manuella deployment-,
  signerings-, Apple-team- eller arkitekturöverstyrningar.
- Slutlig simulatorapp: 5/5 faktiska UI-steg. Idag visas; varm schemalänk,
  kall hästlänk samt bakgrund och återgång fungerar. Två nya Metro-bundles
  och noll nya runtimefel noterades. Kallstarten fick nytt process-ID;
  återgången behöll samma process-ID.
- JavaScript: 539/539 Node-tester utan skip, lint, TypeScript och syntetiskt
  webbbygge passerar. Efter nativeintegrationen passerar även de tre
  befintliga iOS-/Android-/webbproven för de faktiska auth-URL-schemana.

Verifieringen använder QA-data, localhost-Metro och en blockerande syntetisk
appbackend. Den bevisar lokalt bygge och UI/livscykel, inte kundinloggning,
fysisk telefon, pushleverans eller EAS/distribution. Det befintliga publika
SMHI-väderanropet finns kvar; kvittensen gäller blockerad appbackend.
GitHub-resultat ska kontrolleras på den exakta pushade SHA:n i
[PR 2](https://github.com/SveaHallinder/stableFlow2.0/pull/2).

## Känd lokal verktygsgräns

Installerad Expo CLI söker ovillkorligen den äldre appen Simulator. Xcode 27
på denna dator använder Device Hub. `expo run:ios` stannar därför före build
med felet att Simulator-appens ID inte kan hittas. Det vanliga Xcode-bygget
och faktiskt installerad app redovisas separat ovan. Ingen global
Xcode-konfiguration, Apple-app eller dependency har ändrats som workaround.

## Drift och det som återstår

De tidigare godkända två privata chattpolicyerna finns i Supabase. Den
uttryckligen godkända hästprofilen ZZ har skapats i rätt stall och kontrollerats
med en separat läsning. Äldre hagnamn och dess positioner bevaras;
haginstallationen och mappningen har ett separat schemaförslag.

Återställningsmejlet är mottaget. Mottagaren behöver själv fullfölja
lösenordsbytet och inloggningen; inga lösenord eller tokens sparades.
Inbjudningsleverans behöver rätt HTTPS-adress och mejlproviderkonfiguration.

Realtime-publicering, haginstallation, nya bildpolicyer och kontoradering
enligt vald ägarmodell är separata förslag med kvarvarande godkännanden
och/eller verkliga driftprov. Bildförslaget behöver ingen äldre-bildflytt
enligt den läsande snapshoten: både Storage-inläggsobjekt och inlägg med
bilder har count 0. Kontoradering behöver dessutom en säker hantering av
operativa bilder och osäker Auth-kvittens. Inget riktigt konto har raderats.

Extern publicering väntar enligt användarens beslut. Bestående oläststatus,
seriehantering, automatiska vårdpåminnelser, server-rate-limit,
push-receiptcleanup och native datumväljare är fortsatt oavslutade.
Utökad hästidentitet, chattbilagor och prenumeration kräver produktdefinitioner.
Hela roadmapen och telefonacceptansen räknas ännu inte som klara.

## Kort QA-script

1. Öppna `http://localhost:8081/?qaDemo=1`. Kontrollera dagens pass,
   foderstatus och vägen till Saga i Vinterhagen.
2. Öppna `http://localhost:8081/messages?qaDemo=1`. Starta en privat
   demochatt och kontrollera befintlig felvisning/återförsök.
3. Kör `node --test scripts/chat-realtime-session.test.mjs scripts/native-auth-redirects.test.mjs`.
   Se åtta godkända regressioner utan skip.
4. Bygg `ios/StableFlow.xcworkspace`, scheme StableFlow, Debug, mot
   den egna simulatorn via Xcode. Kontrollera att Idag visas i Device Hub
   med den avsiktligt syntetiska QA-konfigurationen.
5. Öppna `stableflow:///calendar` med appen igång och
   `stableflow:///stable-horses` efter avslutad app. Kontrollera Schema
   respektive Hästar; gå till bakgrunden och tillbaka utan felbanner.
6. Fullfölj det mottagna återställningsmejlet själv och logga in på localhost.
   Efter separata driftgodkännanden: prova privat chatt mellan dator och
   den enda tillgängliga telefonen samt nekad åtkomst för tredje konto.

Ändrade filer i paketet: `context/AppDataContext.tsx`,
`scripts/chat-realtime-session.test.mjs`, `ios/Podfile`, `ios/Podfile.lock`,
`ios/StableFlow.xcodeproj/project.pbxproj`, `ios/StableFlow/AppDelegate.swift`,
`ios/StableFlow/Info.plist`, `ROADMAP.md` och denna checkpoint.
