# StableFlow – integrerad UI/UX

Datum: 2026-10-24. Lokal Expo-app: http://localhost:8081/.

## Resultat

Den godkända vita designen är integrerad i Expo-appen. Originalets blå logotyp och Inter är kvar. Navigationen har fem huvudflikar; profil och Mitt stall nås från avataren. Idag prioriterar egna pass och dagens agenda, hästar har fyra fokuserade profilflikar, schemat har datum/kategori/ansvarsfilter och onboardingen har fyra steg.

Inga nya dependencies, schemaändringar, providerinställningar eller riktiga testutskick ingår. Befintlig auth, lagring och action-behörighet är kvar.

## Verifierat

- `npm test`: **957/957**. Lokal test-PostgreSQL och HTTP-servrar kräver sockets utanför sandlådan; testerna använder isolerade temporära databaser, aldrig den gemensamma databasen.
- `npm run lint`: godkänt utan varningar.
- `npx tsc --noEmit`: godkänt.
- `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run build:web`: godkänd Expo-export till dist.
- `git diff --check`: godkänt.
- Riktigt ägarkonto: fem flikar, Cinder CML, fyra hästflikar, befintligt pass/detaljer, framtida tom vecka och valt datum i Nytt pass, flödesformulär, konversation, profil, Mitt stall och sparad onboarding kontrollerade i UI. Inga riktiga pass skapades/klarmarkerades och inga mejl/inlägg/meddelanden skickades.
- Backendfritt befintligt QA-läge: nytt lokalt pass till accepterad QA Medlem skapades via UI; Idag öppnade rätt eget pass och klarmarkering uppdaterade det till klart. Detta är UI/action-prov med lokal testdata, inte nytt live-databasbevis.
- Responsivt: huvudvyer granskade vid 390 px och 1280 px. Extra 320 px-prov av Idag och resurssteget gav dokumentbredd 320 px utan horisontellt överflöde. Escape stängde passformuläret.
- Regressioner täcker bland annat kronologisk agenda, stallavgränsning, fem flikar med bibehållen profilrutt, farm/stall-återanvändning, monterade hästeditordelar, synliga gruppsparfel, resursutkast vid Tillbaka och bläddring till tomma framtida veckor.

## Praktiska gränser

Fysisk Expo Go på iOS/Android och ny registrering/mejlleverans har inte slutprovats i denna designändring. Ägarkontot användes för läsande verkligt UI-prov; medlems-/behörighetsgränser täcks av befintliga och fokuserade tester.

Ett intermittent `TypeError: Failed to fetch` i SDK:ns sessionsförnyelse observerades före lyckad omladdning och färsk stalldata. Auth- och nätverkskoden är oförändrad, och ingen nätverksfix påstås. Den publika projektgatewayen var nåbar utan credentials. Stallet saknar sparad ort; riktigt UI visar därför ett tydligt vädertomläge.

## QA-script

1. Öppna http://localhost:8081/ med ditt befintliga konto. Kontrollera hälsning, närmaste pass/dess tomläge och aktuell stallväljare.
2. Gå igenom Idag, Hästar, Schema, Flöde och Chatt. Öppna avataren och kontrollera Mitt stall samt kontoinställningar.
3. Sök upp Cinder CML och öppna Översikt, Foder, Ridning och Vård. Avbryt eventuella redigeringsutkast utan att spara oönskade ändringar.
4. I Schema: bläddra till en tom framtida vecka, välj dag, öppna Nytt pass och kontrollera datum samt ansvarsväljare. Avbryt. Väntande inbjudan blir valbar först efter accepterat konto.
5. Öppna Mitt stall och växla mellan inbjudan/häst/hage/stall. Kontrollera att bara ett formulär visas; skicka inget om du bara granskar designen.
6. Öppna stallets introduktion. Kontrollera Upplägg, återanvänt befintligt stall, resursfrågor, häst och första pass. Redigera inget som redan är korrekt. Avslut ska leda till Idag.
7. Kontrollera flödesformulär och en konversation på mobil och desktop. Avbryt utan att publicera eller skicka. Upprepa i fysisk Expo Go före native-release.
