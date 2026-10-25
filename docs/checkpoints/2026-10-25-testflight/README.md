# StableFlow: vägen till TestFlight

Användaren har bekräftat ett Expo-konto men inget Apple Developer-medlemskap. Webbversion 3 och serverns grupp-push är publicerade enligt föregående checkpoint. Ingen iPhone-version är ännu verifierat signerad eller uppladdad till TestFlight.

## Nästa steg för kontot

1. Slutför [Apple Developer-registreringen](https://developer.apple.com/programs/enroll/). Apple anger 99 USD per år, eller lokalt pris. Användaren genomför själv identitetskontroll, avtal och betalning; inget köp har utförts av agenten.
2. Användaren har bekräftat **AB**: välj **Organization** och ange bolagets juridiska namn. Apple visar organisationens juridiska namn som säljare och kräver bland annat D-U-N-S-verifiering. [Apples regler och pris](https://developer.apple.com/help/account/membership/program-enrollment/).
3. När Apple har aktiverat medlemskapet: verifiera Expo-projektet och Apple-teamet, koppla det riktiga EAS-projekt-ID:t och App Store Connect-posten till befintliga `app.json`/`eas.json`. Inga konto-/team-ID:n eller nycklar har hittats på. Ingen ny dependency behövs för plist-fixen.

## Bygg och distribuera

1. Färdigställ låsta native-paket och gör ett osignerat Release-bygge som kontroll av kompilering och produktionsbundle. Det bevisar inte telefonpush eller TestFlight.
2. Efter kontoanslutningen: förbered Apple-signering, Push Notifications-capability och APNs-nyckel för rätt app-ID. Skapa inte nya åtkomstnycklar utan uttryckligt godkännande. Verifiera att den faktiskt signerade distributionsappen har `aps-environment=production` och rätt bundle-ID.
3. Bygg iOS med produktionsprofilen och ladda upp den verifierade builden till App Store Connect. Börja med ägarens TestFlight-installation. Stallets övriga testare är normalt externa testare; första externa builden behöver Apples betagranskning. Inga personer har bjudits in här. [Expo](https://docs.expo.dev/submit/ios/), [Apple TestFlight](https://developer.apple.com/testflight/).
4. Kör acceptansproven nedan. Efter godkänt betaprov färdigställs App Store-information, skärmbilder, integritetsuppgifter och granskningsunderlag för en separat App Store-granskning. TestFlight-uppladdning publicerar inte automatiskt appen i App Store.

## Förberett i repo

- `ios/StableFlow/Info.plist`: StableFlow som visningsnamn och samma `remote-notification`-bakgrundsläge som redan är beslutat i `app.json`.
- `ios/StableFlow/StableFlow.entitlements`: APNs-deklaration enligt installerade Expo-pluginens standard. `development` i källfilen ersätter inte kontrollen av den faktiskt signerade produktionsprofilen.
- `scripts/native-ios-config.test.mjs`: tre regressionsprov, röda före fixen och gröna efter. Tillsammans med befintliga native-/webbreturprov: 9/9 gröna. Båda plist-filerna klarar `plutil` och en oberoende granskning fann inga blockerande fel.
- Installerad Expo-introspektion ger samma namn, bakgrundsläge och entitlement som de uppdaterade källfilerna. Ingen hel `prebuild --clean`, schemaändring eller ny dependency har gjorts.
- `ios/Podfile.lock`: en genererad checksumma uppdaterad efter att projektet flyttats från en worktree till denna checkout. Officiell npm-tarball och installerad podspec är byteidentiska; det tidigare absoluta checkoutnamnet reproducerade exakt den gamla checksumman. Alla paketversioner är oförändrade. Ett nytt `pod install --deployment --no-repo-update` passerar och dess manifest matchar låsfilen.

## Verifiering av produktändringen

Commit `bf37100a8cc2ea44a470aaafb754d97575ad4f1e` passerade [CI 40232153125](https://github.com/SveaHallinder/stableFlow2.0/actions/runs/40232153125): 1 092/1 092 Node-/databasprov, inga överhoppade prov, 149/149 offline UI-prov, lint, TypeScript och webbexport. Lokalt passerade också lint, TypeScript och `git diff --check`.

Ett osignerat Release-bygge för iOS Simulator startades och hade passerat Pods-/manifestkontrollerna när samtalet avbröts. Inget bevarat slutresultat eller färdig app kunde återfinnas efter avbrottet. Nativekompilering är därför fortfarande obekräftad; CI-resultatet ersätter inte det provet.

Detta är en nativekonfigurationsändring. Den redan publicerade webbversionen har inte publicerats om.

## QA: sex steg innan bred lansering

1. Installera den signerade appen från TestFlight på iPhone. Kontrollera namnet StableFlow och att appen startar utan utvecklingsserver.
2. Med godkända testmottagare: prova inbjudan, ny registrering med mejlkod, lösenordsåterställning och tillbaka till rätt app/stall. Lösenord och engångskoder hanteras av användaren.
3. Slutför onboarding; öppna Min profil, Hästar, Medlemmar och Schema. Skapa/tilldela ett avsett testpass och kontrollera sparning efter omstart.
4. Med avsedda testkonton: prova privat chatt och egen grupp. Utomstående ska inte kunna läsa grupphistorik; borttagen deltagare ska förlora åtkomst.
5. Aktivera push och prova chatt-/passnotiser med appen i bakgrunden respektive helt stängd. Tryck ska öppna rätt sida en gång; kontrollera ett snabbt andra tryck och kontobyte.
6. Stäng av chattnotiser och ta bort en gruppdeltagare. Kontrollera uteblivna utskick till respektive mottagare. Logga ut och kontrollera att föregående kontos innehåll inte visas.

Verkliga testmejl, signerad iPhone-build, APNs-leverans och TestFlight-/App Store-acceptans återstår. De gröna webbproven är inte bevis för dessa steg.
