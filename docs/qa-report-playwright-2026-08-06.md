# Playwright QA — StableFlow 2026-08-06

## TL;DR

StableFlow fungerar nu i de två flöden som var farligast i ett riktigt stall:

- Schemat öppnar aktuell vecka och ett nytt pass väljer idag, inte ett gammalt datum.
- Två personer kan inte längre få varsin grön bekräftelse på samma pass. Databasen utser exakt en vinnare; den andra får konflikt och ett uppdaterat schema.

QA kördes på localhost i Chromium, desktop `1280×1600` och mobil `390×844`, med riktiga stagingkonton för admin, personal, hästägare, medryttare och gäst.

## Fixade fynd

### P0 — två samtidiga claims gav båda success

Repro före fix: staff och medryttare klickade `Ta pass` samtidigt. Båda såg “är nu ditt”, men efter reload ägde bara medryttaren passet.

Rotorsak: claimen kontrollerade `status=open` endast i gammalt lokalt state och skickade därefter en ovillkorad PATCH på `id`. Sista request vann.

Fix: PATCH är nu villkorad på `id`, `status=open` och `assignee_id IS NULL`. Lokal success och historik skrivs först efter en uppdaterad serverrad. Noll rader är en namngiven konflikt. Claimknappar visar `Tar pass...`, är disabled/busy per assignment och samma klient kan inte skicka dubbla requests.

Verifiering: Playwright startade två autentiserade browser contexts mot samma unika assignment-ID. Exakt en fick success, exakt en fick konflikt, exakt ett PATCH-svar innehöll raden och reload visade exakt en ägare. Testet raderade därefter exakt sitt assignment-ID och verifierade tom GET.

### P1 — nya pass hamnade bakåt i tiden

Repro före fix: den 6 augusti valde `Nytt pass` automatiskt `mån 4/5`. Passet sparades korrekt på 4 maj och försvann därför ur `Lediga`.

Rotorsak: datumalternativen fylldes med de fem äldsta schemadagarna innan dagens datum lades till.

Fix: create visar idag först, därefter framtida schemadatum och närliggande reservdatum. Edit behåller sitt explicita datum även när det är historiskt.

Verifiering: Node-beteendetest med fem historiska dagar samt riktig assignment-POST utan manuellt datumval, där payloaden måste ha lokalt dagens datum.

### P1 — kalendern öppnade äldsta veckan

Repro före fix: den 6 augusti öppnade kalendern vecka 19, 4–10 maj.

Rotorsak: veckorna sorterades äldst först och `weekIndex` startade alltid på `0`.

Fix: aktuell vecka skapas alltid, även om den är helt tom, med sju dagkort och tydlig `Inga pass`-status. Varje stall initieras en gång till aktuell vecka; manuell veckonavigering återställs inte av senare datauppdateringar.

Verifiering: beteendetest för aktuell/framtida/senaste historiska vecka samt mobil Playwright-skärmdump som visar vecka 32, 3–9 augusti.

## Verifierad funktionsyta

- Auth och rollanpassad startsida för fem stagingroller.
- Skapa pass, reload, synlighet mellan roller, lediga/mina pass och samtidig claim.
- Foderplan, hästägaroverride, foderkoll och avvikelse.
- Häststatus och hagesynk.
- Planera/slutföra/avboka ridpass.
- Vårdhändelser och externa kontakter.
- Viktiga stallnotiser separerade från feed och chat.
- Gästens read-only-läge.
- Onboarding-routing och signup-skal.
- Tomma states för schema, lediga pass, vård och tävling.

## Öppna fynd och produktfeedback

### P0 security — kräver schema-beslut

`assignments_update` tillåter idag claim-behöriga roller att uppdatera hela assignment-raden. UI-racet är löst, men en manipulerad klient kan fortfarande försöka ändra fler kolumner än en claim ska få röra. Innan skarp stallrelease bör RLS begränsas eller claim flyttas till en databasfunktion. Det är avsiktligt inte ändrat eftersom schemaändringar kräver explicit godkännande.

### P1 audit trail — kräver transaktion

Ägarskap och `assignment_history` är två separata requests. Ägarskapet är nu korrekt, men historikraden kan utebli vid ett nätavbrott efter vunnen claim. För verksamhetskritisk ansvarsspårning bör de senare bli en databastransaktion/RPC.

### P1 dependencies — separat säkerhetstriage

`npm audit` rapporterar 30 kända träffar: 1 low, 17 moderate, 10 high och 2 critical. Ingen automatisk uppgradering gjordes eftersom det skulle ändra dependencies utan godkännande. Träffarna behöver exploaterbarhetsbedömas mot Expo/web/native innan release.

### P2 accessibility och mobil polish

- Flera små ikon-/chipkontroller saknar button-role/state och ligger under rekommenderad touchyta. Claimknapparna är åtgärdade, men problemet finns bredare i schema, häst, hage och feed.
- Signup med ogiltig e-post eller för kort lösenord lämnar submit disabled utan tydlig inline-förklaring; inputfält saknar dessutom konsekventa labels/autocomplete.
- Headerns `Nytt pass` trunkeras visuellt till `Nyt...` på 390 px. Funktionen går att använda men copy/hit area bör få en mobiljustering.
- Toast-feedback är tydlig visuellt men saknar live-region för skärmläsare.

### P2 QA/demo

`qaDemo` kan fortfarande försöka skriva vissa fejk-ID:n till Supabase och ge 400-varningar i konsolen, även när UI:t fortsätter lokalt utan feltoast. Demo-läget bör konsekvent kortsluta alla backendwrites.

Playwright-webb täcker inte native-specifika risker som kamera, pushnotiser, deep links eller själva Expo Go-runtime. De behöver en separat fysisk iOS/Android-smoke.

## Körda gates

- `npm test`: 52/52 pass.
- `npm run lint`: pass.
- `npm run build:web`: pass.
- Backend-free Playwright: 28/28 pass.
- Befintlig staging Playwright: 11/11 pass.
- Fokuserad current-date + atomic-claim Playwright: 1/1 pass, upprepad efter fix.
- `git diff --check`: pass.

## Kort QA-script

1. Starta `npm run dev -- --web --port 8081` och logga in som admin.
2. Öppna Schema och verifiera aktuell vecka; klicka `Nytt pass` och kontrollera att dagens datum är valt först.
3. Skapa ett unikt ledigt pass utan att byta datum, ladda om och verifiera att det finns kvar under `Lediga`.
4. Öppna passet samtidigt som staff och medryttare i två fönster och klicka `Ta pass` samtidigt.
5. Verifiera en success, en konflikt och efter reload exakt en ägare under `Mina`.
6. Kontrollera mobilbredd 390 px: dagkort, `Tar pass...`, toast och bottom navigation får inte överlappa claimknappen.
