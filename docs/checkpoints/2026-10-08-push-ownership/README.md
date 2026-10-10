# Kontobyte och pushägarskap

Användaren godkände den 8 oktober 2026 det granskade paketet med 22 filer för repo, två Supabase-migrationer och funktionerna `send-push-notification` samt `collect-push-receipts` i befintligt projekt `zbcghmpjslasnxqcodqa`. Extern webbpublicering väntar. Automatisk schemaläggning av kvittokontrollen ingår inte.

Paketet integrerades i `0e73405d74a0c875ac00679a7260d5fdde5fb2f7`, byteidentiskt med slutpatchen `d34f573b4135906e5cb1cd0a15867b379bad6f80fc872554ba56db069316ce49` mot `ef793f472f6be14d7909219216a5f9bc3c7e4e00`. En senare tvåfilsfix ignorerar det kända platshållar-ID:t för Expo, använder ett tillgängligt riktigt körmiljö-ID och avbryter före Expo eller ägarskaps-RPC om projekt saknas. Inga dependencies ändras. Den här checkpointen är den enda extra dokumentationsfilen.

Appens primära inloggnings- och utloggningsvägar ordnar sessionsändringar med befintliga SDK-lås. Registrering och bortkoppling använder förväntad användare och generationer så att sena svar inte påverkar nästa konto. Webbläsare utan stödet visar svensk feltext före sessionsändringen. Pushnotiser använder generell text; ett tryck får bara öppna vyn för den aktiva mottagaren.

## Verifiering och drift

Paketcommitten `0e73405` klarade både GitHub-körning `37787910517` och `37787916065`: 610 Node-prov, 106 offline UI-prov, lint, TypeScript och webbbygge, utan fail eller skip. Resolverfixens riktade lokala svit klarade 90 prov samt lint, TypeScript och webbbygge. Slutgrinden på aktuell samlad kod kräver 613 Node-prov och 106 offline UI-prov. Isolerad SQL-CI på testcommit `4492198b0c9ba9b11cc46b76b8de4ab64e524331` klarade 174 SQL-assertions, inklusive kvitton, åtkomst, ägarskap och observerade samtidighetsfall. De isolerade resultaten räknas inte som ytterligare produktprov eller telefonacceptans.

Efter grön CI på paketcommitten installerades sändaren som version 3, exakt `20261008_push_receipt_ledger.sql` och `20261008_push_device_ownership.sql` applicerades i den ordningen, och kvittofunktionen installerades som version 1. Båda funktionerna är aktiva med JWT-kontroll. Hosted-efterkontroller verifierade migrationshistorik, privata tabeller, RPC-källor och behörigheter. Sex riktiga HTTP-prov utan behörig servernyckel gav 401. `schema.sql` är en repospegel och kördes inte som helhet mot Hosted Supabase.

Triggerstyrd leverans väntar på det separat föreslagna tillägget för projekt-URL och den befintliga servernyckeln i Supabase Vault. Kontrollen hittade ingen bestående projekt-URL eller Vault-post med det avsedda namnet. Appens Expo-projekt-ID är fortfarande en platshållare och datorns Expo-CLI är inte inloggad. Ett riktigt projekt-ID, fysisk signering och en tillgänglig telefon krävs för telefonprovet.

Redan accepterade äldre Expo-payloads kan inte återkallas. Offlineutloggning kan inte omedelbart uppdatera servern. Äldre klienter och externa SDK-anrop som går förbi appens hjälpare ingår inte i det nya sessionsskyddet. Paketcommitten startade med sin aktuella JavaScript-bundle och ett verifierat befintligt native-bygge i en tillfällig iOS-simulator, som visade svensk inloggning utan feloverlay. Inloggning med riktiga konton, mejl, Expo-leverans och fysisk telefon behöver egna acceptansprov; simulatorstart, offline UI och transportmodeller räknas inte som dessa prov.

## QA, sex steg

1. Öppna `http://localhost:8081/settings/notifications?qaDemo=1` i mobilbredd. Kontrollera begriplig webbtext, tomt läge och kalenderlänk.
2. Kör `node --test --test-reporter=tap scripts/push-ownership.test.mjs scripts/invite-acceptance-auth.test.mjs scripts/push-delivery.test.mjs scripts/notification-error-logging.test.mjs`: 90 pass, noll fail eller skip, inga riktiga provideranrop.
3. Kör `npm run lint`, `node node_modules/typescript/bin/tsc --noEmit` och `npm run build:web`. Kräv därefter 613 Node-prov och 106 offline UI-prov i grön GitHub-CI på samma produktcommit.
4. Efter godkänd drift, kontrollera migrationshistorik, privata tabellers RLS/ACL, RPC-signaturer och båda funktionernas versioner. API-roller ska inte kunna anropa serverns pushsändning eller läsa privata kvittotabeller.
5. Prova A till B på samma fysiska telefon med avsedda testkonton. Kontrollera B:s notisinställning, generell notistext och att ett tryck endast öppnar det aktiva kontots vy. Prova inbjudan och återställning med den avsedda testmejlen.
6. Rapportera integrerad kod, grön CI, Hosted-drift och faktisk telefonacceptans separat. Behåll extern publicering vilande och besluta separat om schemalagd kvittokontroll.
