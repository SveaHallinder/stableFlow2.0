# StableFlow: navigation, egna gruppchattar och publik testversion

Användaren godkände egna säkra gruppchattar i repo och befintligt Supabase den 24 oktober 2026 och bad därefter uttryckligen om publicering för test i verkligheten. Detta är en publik testversion; full produktionsacceptans för mejllänkar och fysisk push återstår.

## Vad som ändrats

- Synlig **Meny** med **Min profil**, **Hästar**, **Medlemmar**, **Chatt**, kontoinställningar och aktuella ägarverktyg. Befintlig vit/blå branding behålls.
- Medlemssökning först, extra filter bakom ett tydligt val, fungerande profil-/privatchattvägar och säkra tillbaka-länkar.
- Kalenderns månadsdatum och sökresultat öppnar rätt datum/pass/häst. Filter och söktext går att ändra utan att gamla routeparametrar återställer dem.
- **Chatt → Ny chatt → Egen grupp** har namn och valda accepterade medlemmar, gruppansvarig, namnbyte, tillägg, borttagning, överlåtelse och lämna. Nya deltagare får en tydlig varning om historik. Sista raderingen kräver uttrycklig bekräftelse även vid samtidighet.
- Startsidan räknar olästa chattar i stället för alla konversationer.

## Installation och verifiering

Migration `20261024122050_custom_member_group_chats.sql` installerades i `zbcghmpjslasnxqcodqa`. SHA256: `cfd5d7fe9a4ee38e7c8f6a2af33a571aa0e154f881fc075ac0ba4f9fbee3a810`. Två nya kolumner, inga nya tabeller eller dependencies. Schemaspegeln kördes inte som helhet mot Hosted Supabase.

Före och efter installationen: 1 konto, 2 stall, 2 medlemskap, 1 häst, 2 konversationer och 0 meddelanden. Verkliga Hosted SQL-roller klarade 24 kontroller med syntetiska konton i en enda återställd transaktion; inga meddelanden eller push skickades. Lokal PostgreSQL-svit provar även meddelande-RLS, konto-/medlemsrensning, samtidighet och pg_net-spion. Dessa prov ersätter inte ett slutprov med flera riktiga användare.

Samlad lokal verifiering: 1 066 tester, inga fail/skip, ESLint, TypeScript och ny webbexport. Exporten använder rätt verklig Supabase-backend, QA-läget är avstängt och databasanvändarens lösenord finns inte i exporten. Den gamla pushägarskapsfixturen uppdaterades till giltiga syntetiska UUID:n och faktisk avsändarmedlemsrad; samtliga 33 tidigare assertions behölls.

## Push och mejl efter uppföljningen

**Grupp-push är nu aktiverad på servern.** Dashboardens redan inloggade Chrome-session användes när befintlig CLI fortsatt nekades 403. `send-push-notification` deployment 6 hämtades tillbaka som ZIP och båda filerna matchar repo byte för byte: index SHA256 `3fc11a3858e86b2c3fb09b98243f5aed4f9b685ef43c337221437e12cb9dffd9`, shared SHA256 `10f8afdb6fb5a159c8c5472a4f77b6028c33271fcdb2dfad89603ea86853ab4f`. JWT-verifiering behölls påslagen. Ett anonymt runtimeprov nådde funktionen men avvisades med 401; det skickade ingen notis.

Därefter installerades `20261024193534_enable_custom_group_push.sql`, SHA256 `36e63fc24550a3c71a004923034f8a5feb4c55bde4ccb1241c6a27d41880a0f4`. Migrationen kontrollerar exakt tidigare spärr och tar bara bort dess tidiga retur för egna grupper. Återläst OID, ägare, ACL, triggerbindning och inställningar är oförändrade. Mottagarhjälparen är fortfarande körbar enbart av service-rollen. Meddelandeantalet före och efter var 0. Rollback: återställ först spärrkroppen från `20261024122050`, därefter eventuell äldre Edge-kod; återställ inte hela gruppmigrationen.

Supabase Auth använder nu `https://stableflow-stallapp.sveaha.chatgpt.site` som `site_url`. `/confirm` och `/reset` är tillagda i allowlist; befintliga localhost- och native-returer bevarades. Mejlbekräftelse är fortfarande påslagen, koden är sexsiffrig, Auth-gränsen är fortsatt 100 mejl/timme och Brevo SMTP är bevarad. Befintliga bekräftelse-/återställningsmallar matchar repo, och mejladressbytesmallen ändrades inte. Edge-hemligheten `APP_URL` har samma HTTPS-origin; dess återlästa värdehash matchar. Även driftsatt `send-invite` version 4 har hämtats tillbaka och matchar repo exakt (SHA256 `e2ec23295a2c7483f4f26cb397c54c93ad450dde03090777f4c53b46b1f7e35a`). Den använder `APP_URL`. **Konfiguration är verifierad; nya verkliga testmejl och mottagarens slutförda registrering/återställning återstår.** Ingen ny nyckel, dependency, betalplan eller verkligt utskick skapades i uppföljningen.

Publicerad testversion: https://stableflow-stallapp.sveaha.chatgpt.site. Den första publiceringen var Sites version 1 från produktcommit `2625fe76861baadce9b04b71a40c76fbc07679ac`, deploy `appgdep_6adcbf0424c48191ba92808d63705307` med status `succeeded`. Åtkomstläget är `public` (revision 2), medan stallens data fortsatt kräver Supabase-inloggning och medlemskap. HTTPS-prov gav 200 för start, medlemmar, schema, chatt, confirm och reset. Den verkliga JavaScript-bunten matchar lokal export byte för byte. Publik mobilvy och oinloggad medlemslänk kontrollerades i webbläsaren; QA-parametern aktiverar inte demo. Ett rått HTTP-prov med Python-standardidentifiering fick 403; med vanlig klientidentifiering svarade sajten 200. Sites SPA-fallback svarar även med HTML/200 för en saknad JS-sökväg; ordinarie JS-bunt är separat verifierad. Vid version 1 var Auth-returer och `APP_URL` ännu inte uppdaterade; de är nu återlästa och verifierade enligt uppföljningen ovan. Konto/mejl/återställning och verklig telefonpush får därför inte beskrivas som fullständigt slutprovade för den nya adressen. Publika Auth-settings svarade 200 med korrekt CORS-origin: e-postregistrering är aktiverad och mejlbekräftelse påslagen. Detta verifierar inte redirect-allowlist eller verklig mejlleverans. Webbläsaren laddade inloggning/mobilvy och blockerade en oinloggad medlemslänk; en enstaka generisk NetworkError noterades och någon verklig inloggad fleranvändarresa på den nya originen har inte utförts av agenten.

Slutlig publik testversion är **Sites version 2**, produktcommit `f76508a42e186580d62792fa38c998d77f98af66`, deploy `appgdep_6adcd1e4c7f88191bb4d6b356e14adf5` (`succeeded`). [CI 40107316026](https://github.com/SveaHallinder/stableFlow2.0/actions/runs/40107316026) är grön för exakt denna produktcommit: 1 066 Node-/databasprov utan överhoppade prov och 149/149 offline UI-prov, lint, route types, TypeScript och webbexport. Kalenderns fasta pass och passnamn är nåbara/läsbara vid 320 px; de sista knapparna har uttryckliga skärmläsarnamn. HTTPS-direktlänkar svarar 200 och den publika JavaScript-bunten matchar den kontrollerade exporten. Detta är det tidigare publiceringskvittot; aktuell version och kvarvarande acceptansprov följer nedan.

## Aktuell publik version och iPhone

**Sites version 3** är publicerad på https://stableflow-stallapp.sveaha.chatgpt.site från produktcommit `cdb552aad6b9a331f8a26daf1c07c091ff631959`, deploy `appgdep_6add0ee72e5c819181f95f3fed20f8fe` (`succeeded`). [CI 40127254857](https://github.com/SveaHallinder/stableFlow2.0/actions/runs/40127254857) är grön: **1 089/1 089 Node-/databasprov, 0 skip och 149/149 offline UI-prov**, lint, route types, TypeScript och webbexport. Publik JS matchar exporten byte för byte, SHA256 `a0c3de1bdbd0fcd55d6a2543a2a2d54d9bfc34c0e0506f3c783b52e0cdbdf2a9`. `/confirm`, `/reset`, `/members` och `/settings/notifications` svarar 200 över HTTPS. Lokalt har verkligt inloggad Idag → Meny → Notiser kontrollerats. Detta ersätter inte fysisk push eller mejlleverans.

Pushregistrering visar nu ett återförsök även om iOS redan har beviljat behörighet. Kallstart läser den senaste notisen först när navigatorn är redo; aktuell SDK-session och mottagare kontrolleras, dubbla tryck kvitteras och äldre sessionssvar kan inte ersätta ett nyare tryck. Kontobyte får inte kasta nästa kontos väntande notis. Felstatus är kontobunden och tillfällig i minnet. 121 riktade push-/inställnings-/ägarskapsprov passerar. Två oberoende reproducerade kapplöpningar rättades och deras regressioner ingår.

**Fysisk iPhone-push är ännu inte slutprovad.** Användaren valde iPhone. Befintlig telefon är för närvarande otillgänglig för installation; `security find-identity -v -p codesigning` gav 0 giltiga identiteter, inget riktigt EAS-projekt-ID finns i appkonfigurationen och ingen signerande Apple-teamkonfiguration är verifierad. Telefonen behöver anslutas/upplåsas och befintliga Expo-/Apple Developer-konton behöver bekräftas innan en signerad fysisk build kan förberedas. Preview-profilen använder fysisk iOS; Expo Go/webb/simulator är inte godkänt bevis för native-push. Inget köp är godkänt eller genomfört. Webbens Notiser-sida anger att push används i telefonappen.

Full lokal npm-testkörning stoppades av macOS SHMALL när `initdb` skulle starta, även seriellt (före produkt-SQL). Riktade databasprov passerade innan miljögränsen nåddes; ren Linux-CI körde därefter alla prov utan skip. Inga kernelinställningar eller andra PostgreSQL-processer ändrades. En första Sites-paketering stoppades av automatisk granskning på grund av en gammal källreferens; den avbröts. En ny öppning returnerade exakt aktuell produktcommit och det matchande paketet verifierades före publicering.

## QA, sju steg

1. Öppna appen på localhost:8081 eller den verifierade publika länken. Logga in med befintligt konto; kontrollera Idag, Meny och Min profil.
2. Öppna Hästar och en hästprofil. Gå via Meny till Medlemmar, sök ett namn och öppna profilen. Kontrollera tillbaka-navigering.
3. Öppna Schema och månadsvisning. Välj ett datum och öppna ett pass. Ändra söktext/filter; valet ska behållas.
4. Välj Chatt → Ny chatt. Kontrollera privat chatt respektive Egen grupp. Med minst två andra accepterade medlemmar kan en grupp skapas. Väntande inbjudningar ska inte kunna väljas.
5. I en avsedd testgrupp: skriv meddelande, byt namn, lägg till/ta bort en testdeltagare. Kontrollera historikvarningen och att utomstående inte ser gruppen. Gruppen ska finnas kvar efter uppdatering.
6. Lämna som gruppansvarig med vald efterträdare. Du ska hamna i chattlistan och förlora åtkomst. Sista deltagaren ska få särskild raderabekräftelse.
7. Före bred lansering: verifiera nya kontons mejlkod, inbjudningar, lösenordsåterställning till HTTPS-origin och samma flöden på fysisk mobil. Slutprova push i en signerad iPhone-build: bakgrund, stängd app, rätt chatt vid tryck, avstängd notispreferens och borttagen gruppdeltagare. Kontrollera att bara aktuella deltagare får notiser.

Backendfria, ändrande UI-prov körs endast i utvecklingsläget `/?qaDemo=1`; det läget är avstängt i den publika exporten. Riktiga medlemmar har inte fått testmeddelanden eller inbjudningar från denna granskning.
