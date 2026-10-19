# Notisinställningar: rätt konto, kvitterad sparning och tydlig copy

Ett sent svar från konto A kunde tidigare ersätta konto B:s notisinställningar. Nästa ändring sparades sedan på B med värden från A. Laddning, sparning och behörighetskontroll hör nu till det aktuella kontots försök. Sena svar efter kontobyte, återförsök eller avmontering ignoreras. Två tryck före nästa render startar endast en sparning.

Endast fyra verifierade booleska fält eller ett bekräftat saknat preferensobjekt låser upp brytarna. Laddningsfel har synlig svensk copy och `Läs in igen`. En kvitterad skrivning kräver ett korrekt 2xx-svar. Ett känt databasavslag återställer tidigare värden; nätfel, 408, 5xx och ofullständiga svar lämnar brytarna låsta tills användaren läser in de faktiskt sparade värdena. Appen påstår därför inte att tidigare inställningar gäller när servern kan ha hunnit spara.

Ett nytt godkännande av notisbehörigheten registrerar nu enheten för det aktuella kontot. Misslyckad registrering visar ett tydligt återförsök. Simulatorn har en förklaring utan en verkningslös aktiveringsknapp. Notistexten beskriver de befintliga pushvägarna: meddelanden, tilldelade pass och viktiga stallnotiser. Vanliga flödesinlägg har en förklaring utan pushbrytare.

Tokenhämtning och registrering loggar endast feature-prefix och fast `Error`/`Unknown`. Felmeddelande, kod, stack och anpassat `Error.name` förs inte vidare. Preferensfel loggar också endast fasta kategorier. Tokenpayload och befintliga konfliktfält är oförändrade.

## Filer och varför de lästes

- `app/settings/notifications.tsx`: felaktig kontogräns, obekräftad preferenshantering, saknad registrering efter första godkännandet och missvisande notistext.
- `lib/notifications.ts`: råa leverantörsfel i två konsolloggar; endast dessa loggargument ändras.
- `scripts/notification-preferences.test.mjs`: 27 regressioner kör hela källkomponentens callbacks med syntetisk hook/RN-adapter och installerad Supabase-SDK.
- `scripts/notification-error-logging.test.mjs`: fem källfunktionsprov med installerad Expo `CodedError` och Supabase-SDK samt syntetisk transport.
- Den här checkpointen.

Som referens lästes `supabase/functions/send-push-notification/index.ts`: feed skickar inga vanliga push-notiser; pass och stallnotiser använder befintliga inställningar. Inga server-, schema-, dependency- eller publiceringsändringar ingår.

## Verifiering före commit

- Identiska slutliga preferensprov på tidigare UI: **1 pass och 26 förväntade fel**. Ändringen ger **27/27**. Fallen täcker A/B/A, StrictMode, dubbla tryck, gamla sparfel, återförsök, avmontering, ofullständiga rader och 500 efter syntetiskt genomförd skrivning.
- De fem loggproven ger fyra förväntade fel på basen `b0b5ee71a9577d3ae2b7605874befc76f55efc7f` och fem pass med ändringen, även när ett anpassat `Error.name` innehåller en syntetisk token.
- Nya preferens- och loggprov samt befintliga pushprov: **57/57**, noll fail/skip. Inga verkliga Expo- eller Supabase-anrop. Permission/registrering i komponentproven är syntetiska callbacks, vilket inte bevisar OS-behörighet eller en fysisk pushleverans.
- Riktad lint, full lint, TypeScript och webbexport avslutas med kod **0**.
- Faktisk localhost-vy på mobilbredd 390 px: rättad text, tydligt tomt läge för missade pass, ingen sidscroll och fungerande kalenderlänk. Webbvyn i syntetiskt QA-läge bevisar inte native-brytarnas faktiska OS-beteende.
- Den nya commitens båda GitHub-körningar ska verifieras separat: **577 Node-prov och 106 offline UI-prov**, inga fail/skip. Äldre gröna resultat ersätter inte detta krav.

## QA, sex steg

1. Med lokalservern igång, öppna `http://localhost:8081/settings/notifications?qaDemo=1`. Webbkortet ska nämna meddelanden, tilldelade pass och viktiga stallnotiser samt förklara flödet.
2. Kontrollera mobilbredd 390 px, det tydliga tomma läget för missade pass och att `Öppna kalendern` leder till kalendern. QA-läget använder syntetiska stalluppgifter.
3. Kör `node --test scripts/notification-preferences.test.mjs scripts/notification-error-logging.test.mjs scripts/push-delivery.test.mjs`; alla 57 prov ska passera utan externa anrop.
4. Kör `npm run lint`, `node node_modules/typescript/bin/tsc --noEmit` och `npm run build:web`. Alla ska avslutas med kod 0. Kontrollera båda GitHub-körningarnas exakta slut-SHA och 577/106 gröna prov.
5. I befintlig simulator: öppna Notiser och läs de tre verksamma brytarna, förklaringen om flödet och simulatorns begränsning. Ändra inga riktiga preferenser som del av detta läsande prov.
6. På fysisk telefon med avsett testkonto: godkänn notiser och kontrollera registrering samt om en ändrad preferens består efter omläsning. Detta återstår som separat mänskligt slutprov, tillsammans med riktig inbjudan och återställning.

## Kvar till hela produkten

Beständiga Expo-tickets, senare receiptkontroll och säker `DeviceNotRegistered`-rensning har ett separat förslag som ännu inte finns i produktkod eller Hosted Supabase. En läsande kontroll har dessutom verifierat för bred EXECUTE-rättighet på serverns `notify_push`; en separat minimal ACL-fix förbereds och väntar på uttryckligt godkännande.

Förslagen för oläststatus, skrivgränser, hagkopplingar, bildåtkomst, kontoradering och native-datumväljare väntar också på sina beslut enligt användarens schema-/dependencyregler. Vårdpåminnelser och återkommande serier har kvarvarande produkt- och datakontrakt. Fysisk telefon, riktiga konto-/inbjudningsflöden, native distribution och push behöver faktisk acceptance. Extern publicering väntar enligt användarens uttryckliga besked. Produkten är därför inte beskriven som 100 procent färdig.
