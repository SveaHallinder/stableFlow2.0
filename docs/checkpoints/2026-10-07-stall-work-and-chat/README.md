# StableFlow: kalender, medlemmar och privata chattar

Detta paket fortsätter [föregående webbkontroll](../2026-10-07-forgot-password-and-ci/README.md).
Utgångspunkt: `8b4aa55946a58ebcf9c3f7d1ff6c47468ab97117`.
Verifierad kodcommit: `b4d8a28f31f2cdd8802399299f5af16879873108`.
Gren: `codex/stableflow-pilot-20261005`,
[utkast-PR #2](https://github.com/SveaHallinder/stableFlow2.0/pull/2).

## Beteende

- Kalendern öppnar den aktuella veckan även på söndag efter midnatt. Dagens pass
  hamnade tidigare utanför den först visade veckan.
- Återkommande pass kräver en giltig angiven sluttid efter starttiden. Ett fel
  visas i formuläret med rollen alert och utkastet finns kvar. Tom sluttid behåller
  befintlig standardlängd; 07:00–08:30 sparas som 90 minuter.
- Medlemssökning som öppnas med URL-parametern q kan ändras och tömmas. Nya eller
  borttagna URL-parametrar uppdaterar fortfarande det monterade sökfältet.
- Kontakter öppnade direkt kan gå tillbaka till hästfliken. Vanlig navigation
  tillbaka behåller den föregående sidan, exempelvis Admin.
- Privata chattar återöppnas via bekräftade deltagar-ID:n även när tråden är tom
  eller bara innehåller egna meddelanden. Ett återförsök använder samma klient-ID
  efter en förlorad kvittens och verifierar konversation samt båda deltagarna.
  Deltagarskrivningen och kvittensläsningen är separata SQL-anrop. UI öppnar
  chatten först efter kvittens; ofullständiga privata rader visas inte i listan.
- Chattstart har 15 sekunders gräns och kontroll av användare, session och stall.
  Sena svar publicerar inget extra. Det sparade försöks-ID:t gäller den aktuella
  providerinstansen; ingen unikhetsgaranti mellan enheter införs här.
- Kastade SDK-lagringsfel vid uppdatering av stalldata visar svensk återförsökstext,
  bevarar befintliga data och släpper vänteläget. Featureloggar innehåller bara
  felklass eller Unknown, utan rå providertext eller privata lagringsdetaljer.

Ingen ny dependency, låsfil eller schemaändring ingår i detta webbpaket.

## Verifiering

Produktfilerna var frysta under slutkontroller och oberoende granskning.

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 449/449, fail 0, skip 0 |
| `npm run lint` | exit 0 |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `npm run build:web` | exit 0, export i dist |
| `npm run test:e2e` | 93/93 i 19 lokala specs |
| Riktade chatt- och refresh-UI-prov | 6/6, 390 och 1280 px |
| Oberoende chatt-, refresh- och sändningsprov | 41/41 |
| Oberoende reproduktion av förlorade chattkvittenser | 2/2 |
| `git diff --check` | exit 0 |

Den oberoende reproduktionen körde produktens callback och reducer. Både förlorad
deltagarkvittens och förlorad konversationskvittens följd av förlorad
deltagarkvittens gav ett enda UUID, en användbar chatt och två medlemsrader.
Sena kvittenser levererades faktiskt utan ytterligare publicering. Inga konkreta
P1/P2-fynd kvarstod i den granskade klientfixen.

UI-proven använder lokala demodata eller installerad SDK mot syntetiska fixtures.
Extern HTTP, backendanrop utan fixture och WebSockets blockeras före navigation;
service workers blockeras. Inga riktiga chattar eller mejl skapades i proven.
Ett UI-prov korrigerades efter att det försökt använda skrivbordets privatfilter
i mobilvyn. Slutprovet verifierar både mobilens lista och skrivbordets tomma
privatfilter. Produktfilerna ändrades inte av den korrigeringen.

Faktisk GitHub-kontroll för den senaste pushade committen visas i PR:ens Checks.
Lokala prov är skilda från den kontrollen och från verklig telefon- och driftacceptans.

## Kort QA-script

1. Starta `npm run dev -- --web --port 8081` och öppna
   `http://localhost:8081/?qaDemo=1`. Demoflödet använder lokala data.
2. Öppna Schema → Skapa återkommande pass. Ange start 07:00 och slut 25:61:
   felet och utkastet ska finnas kvar. Rätta slut till 08:30 och skapa passet.
   Kör `npm run test:e2e -- calendar-week-quality.spec.mjs` för det låsta
   söndagsprovet och verifiering av sparad längd.
3. Öppna `http://localhost:8081/members?qaDemo=1&q=QA%20Medlem`.
   Töm sökningen, sök QA Admin och prova ett namn som inte finns. Öppna därefter
   `/contacts?qaDemo=1` direkt och tryck Tillbaka; hästfliken ska visas.
4. Kör `npm run test:e2e -- member-navigation-quality.spec.mjs
   chat-and-refresh-quality.spec.mjs`. Proven kontrollerar föregående sida,
   samma privata chatt, misslyckad start med återförsök samt refresh efter verkligt
   SDK-lagringskast. Chatta från en demomedlems profil om du vill prova UI manuellt.
5. Kör `npm test`, `npm run lint`, `./node_modules/.bin/tsc --noEmit`,
   `npm run build:web` och `npm run test:e2e`. Inga Nodeprov ska hoppas över.
6. Kontrollera senaste SHA och båda CI-körningarna i PR:ens Checks. Öppna sedan
   datorns demo-URL på telefon på samma Wi-Fi, med adressen från
   `ipconfig getifaddr en0`, och ta samt slutför ett demopass. Telefonprovet har
   ännu inte bekräftats; datorns och CI:s Chromiumprov ersätter inte det.

## Beslut som återstår för drift

En läsande kontroll av Supabases chattpolicyer matchade det lokalt reproducerade
SQLSTATE 42501-felet: skaparen kan inte läsa sin nya privata konversation innan
deltagare finns, men deltagarskrivningen behöver kunna läsa konversationen.
Nya privata chattar i drift är därför fortfarande blockerade av databasreglerna.

Ett konkret förslag med två policyer finns separat för godkännande: skaparen får
läsa sin privata konversation under start och privata INSERT måste ange den
inloggade användaren som skapare. Förslaget passerar 39/39 lokala SQL-förväntningar
på hela repots schema. Ingen policy har lagts in här eller aktiverats i Supabase.
Det väntar på svar enligt användarens AGENTS-instruktion "Inga schemaändringar
utan att fråga". Befintliga meddelande- och medlemsregler ändras inte i förslaget.

Tidigare dokumenterade beslut om native-dependency, hagmappning/schema,
kontoradering, verklig inbjudningsleverans, hosting och fysisk telefonacceptans
kvarstår enligt föregående checkpoint. Ingen distribution eller PR-merge ingår här.

## Ändrade filer

```text
app/(tabs)/calendar.tsx
app/contacts/index.tsx
app/members/index.tsx
context/AppDataContext.tsx
lib/schedule.ts
scripts/assignment-scheduling.test.mjs
scripts/calendar-recurring-input-validation.test.mjs
scripts/data-refresh-recovery.test.mjs
scripts/private-chat-create.test.mjs
scripts/e2e/calendar-week-quality.spec.mjs
scripts/e2e/chat-and-refresh-quality.spec.mjs
scripts/e2e/member-navigation-quality.spec.mjs
scripts/e2e/playwright.offline.config.mjs
docs/checkpoints/2026-10-07-stall-work-and-chat/README.md
```
