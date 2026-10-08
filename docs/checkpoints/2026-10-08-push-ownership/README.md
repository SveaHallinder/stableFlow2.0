# Kontobyte och pushägarskap

Användaren godkände den 8 oktober 2026 det granskade paketet med 22 filer för repo, två Supabase-migrationer och funktionerna `send-push-notification` samt `collect-push-receipts` i befintligt projekt `zbcghmpjslasnxqcodqa`. Extern webbpublicering väntar. Automatisk schemaläggning av kvittokontrollen ingår inte.

Källorna är byteidentiska med slutpatchen `d34f573b4135906e5cb1cd0a15867b379bad6f80fc872554ba56db069316ce49` mot `ef793f472f6be14d7909219216a5f9bc3c7e4e00`. Inga dependencies ändras. Den här checkpointen är den enda extra dokumentationsfilen.

Appens primära inloggnings- och utloggningsvägar ordnar sessionsändringar med befintliga SDK-lås. Registrering och bortkoppling använder förväntad användare och generationer så att sena svar inte påverkar nästa konto. Webbläsare utan stödet visar svensk feltext före sessionsändringen. Pushnotiser använder generell text; ett tryck får bara öppna vyn för den aktiva mottagaren.

## Verifiering och drift

Den isolerade slutkopian klarade 610 Node-prov, 106 offline UI-prov, lint, TypeScript och webbbygge. Isolerad SQL-CI på testcommit `4492198b0c9ba9b11cc46b76b8de4ab64e524331` klarade 174 SQL-assertions, inklusive kvitton, åtkomst, ägarskap och observerade samtidighetsfall. Dessa resultat ersätter inte grön CI på den integrerade produktcommitten eller efterkontroller i Hosted Supabase.

Efter grön CI på den integrerade committen uppdateras först sändaren till det nya protokollet. Vid saknade RPC:er avbryter den sändning utan äldre reservväg. Därefter appliceras exakt `20261008_push_receipt_ledger.sql` och sedan `20261008_push_device_ownership.sql`, följt av kvittofunktionen och efterkontroller. `schema.sql` är en repospegel och körs inte som helhet mot Hosted Supabase.

Redan accepterade äldre Expo-payloads kan inte återkallas. Offlineutloggning kan inte omedelbart uppdatera servern. Äldre klienter och externa SDK-anrop som går förbi appens hjälpare ingår inte i det nya sessionsskyddet. Native, riktig JWT, mejl, Expo-leverans och fysisk telefon behöver egna acceptansprov; offline UI och transportmodeller räknas inte som dessa prov.

## QA, sex steg

1. Öppna `http://localhost:8081/settings/notifications?qaDemo=1` i mobilbredd. Kontrollera begriplig webbtext, tomt läge och kalenderlänk.
2. Kör `node --test scripts/push-ownership.test.mjs scripts/invite-acceptance-auth.test.mjs scripts/push-delivery.test.mjs scripts/notification-error-logging.test.mjs`: 87 pass, noll fail eller skip, inga riktiga provideranrop.
3. Kör `npm run lint`, `node node_modules/typescript/bin/tsc --noEmit` och `npm run build:web`. Kräv därefter 610 Node-prov och 106 offline UI-prov i grön GitHub-CI på samma produktcommit.
4. Efter godkänd drift, kontrollera migrationshistorik, privata tabellers RLS/ACL, RPC-signaturer och båda funktionernas versioner. API-roller ska inte kunna anropa serverns pushsändning eller läsa privata kvittotabeller.
5. Prova A till B på samma fysiska telefon med avsedda testkonton. Kontrollera B:s notisinställning, generell notistext och att ett tryck endast öppnar det aktiva kontots vy. Prova inbjudan och återställning med den avsedda testmejlen.
6. Rapportera integrerad kod, grön CI, Hosted-drift och faktisk telefonacceptans separat. Behåll extern publicering vilande och besluta separat om schemalagd kvittokontroll.
