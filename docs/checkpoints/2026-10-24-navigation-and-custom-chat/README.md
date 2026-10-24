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

## Tydliga begränsningar

**Push för egna grupper är avstängd i databastriggern.** Den gamla Edge-funktionen får aldrig behandla en egen grupp som hela stallet. UI visar begränsningen i gruppinformationen. Stallchatt och privata chattar behåller sin tidigare triggerpayload. Ny mottagarsäker Edge-kod är färdig och testad i repo, men befintlig CLI/connector fick 403 och användaren ville inte logga in i dashboarden. Aktivera inte grupp-push förrän Edge-koden har installerats och verifierats; migrationens kommentar beskriver separat säker reversering av spärren.

Offentlig origin avsedd för Sites: https://stableflow-stallapp.sveaha.chatgpt.site. Förväntad adress är inte publiceringsbevis; faktiskt deploykvitto och HTTPS-prov dokumenteras separat. Supabase Auth måste tillåta samma origins `/confirm` och `/reset`, och inbjudningsfunktionens `APP_URL` behöver samma HTTPS-origin. Dessa providerinställningar är inte bekräftat uppdaterade. Konto/mejl/återställning och verklig telefonpush får därför inte beskrivas som fullständigt slutprovade för den nya adressen.

## QA, sju steg

1. Öppna appen på localhost:8081 eller den verifierade publika länken. Logga in med befintligt konto; kontrollera Idag, Meny och Min profil.
2. Öppna Hästar och en hästprofil. Gå via Meny till Medlemmar, sök ett namn och öppna profilen. Kontrollera tillbaka-navigering.
3. Öppna Schema och månadsvisning. Välj ett datum och öppna ett pass. Ändra söktext/filter; valet ska behållas.
4. Välj Chatt → Ny chatt. Kontrollera privat chatt respektive Egen grupp. Med minst två andra accepterade medlemmar kan en grupp skapas. Väntande inbjudningar ska inte kunna väljas.
5. I en avsedd testgrupp: skriv meddelande, byt namn, lägg till/ta bort en testdeltagare. Kontrollera historikvarningen och att utomstående inte ser gruppen. Gruppen ska finnas kvar efter uppdatering.
6. Lämna som gruppansvarig med vald efterträdare. Du ska hamna i chattlistan och förlora åtkomst. Sista deltagaren ska få särskild raderabekräftelse.
7. Före bred lansering: verifiera nya kontons mejlkod, inbjudningar, lösenordsåterställning till HTTPS-origin och samma flöden på fysisk mobil. Kontrollera att grupp-push fortfarande är tydligt avstängd tills separat providerinstallation är klar.

Backendfria, ändrande UI-prov körs endast i utvecklingsläget `/?qaDemo=1`; det läget är avstängt i den publika exporten. Riktiga medlemmar har inte fått testmeddelanden eller inbjudningar från denna granskning.
