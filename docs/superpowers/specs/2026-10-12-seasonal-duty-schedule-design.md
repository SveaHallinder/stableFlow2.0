# Förslag: säsongsschema och fasta veckopass

Status: Godkänt av användaren 2026-10-12 för implementation i repo och befintligt Supabase-projekt, utifrån commit 9725595. Inga nya dependencies, köp eller externa publiceringar behövs.

## Så fungerar det för stallet

Stallägaren öppnar **Schema → Fasta pass → Skapa period**. Perioden får eget namn, startdatum och slutdatum. Båda datumen ingår. Utanför sådana perioder finns inga automatiskt skapade fasta pass. Manuellt upplagda pass fungerar även på sommaren.

Ägaren lägger till så många olika dagliga pass som upplägget behöver. Varje pass får namn, starttid, valfri sluttid och instruktioner. Morgon/lunch/kväll är förslag som kan ändras, läggas till eller tas bort. Inga nya veckoregler får identifieras enbart av dessa tre kategorier.

### Exempel, inte inställningar som läggs in åt IB

**Vinter 2026/27 · 1 november–30 april**

| Pass | Innehåll |
|---|---|
| Morgonfodring | Fodra och släppa ut hästarna i hagen |
| Lunchfodring | Fodra |
| Kvällsfodring | Fodra och ta in hästarna |
| + Lägg till pass | Exempelvis eftermiddagsfodring, vatten eller senfodring |

Tider väljer ägaren själv. En förhandsvisning visar antal dagar, antal konkreta pass, bemannade och lediga pass innan **Skapa passen**. Ett år med fler än tre pass per dag ska stödjas utan att ägaren behöver lägga upp veckorna manuellt.

## Fast veckofördelning

En medlem väljer till exempel **Morgonfodring → tisdag + torsdag → hela perioden**. Ett val sparar fördelningen för alla återstående motsvarande pass i perioden. Varje faktiskt pass har en ansvarig person, precis som i dagens schema.

| Veckodag | Morgonfodring | Lunchfodring | Kvällsfodring |
|---|---|---|---|
| Måndag | Ledigt | Ledigt | Ledigt |
| Tisdag | Jag ✓ | Ledigt | Tilldelat annan medlem |
| Onsdag | Ledigt | Ledigt | Ledigt |
| Torsdag | Jag ✓ | Ledigt | Ledigt |

På mobil visas dag och pass i en lista med tydliga val, så fler än tre pass inte kräver en bred tabell. Tabellen här illustrerar bara principen.

Medlemmar väljer sina egna pass; stallägaren kan tilldela valfri behörig medlem och ändra fördelningen. Ägarens beslut har företräde. Detta bygger på svaret: ”stallägare & medlemmar tilldelar men om stallägare ändrar efter medlemmen så har den högre authority”. Medlemmen kan inte skriva tillbaka ett gammalt val över en ny ägarändring eller ta en annan medlems upptagna veckopass.

När ägaren bestämt en fördelning visas **Tilldelat av stallägaren**. Medlemmen kan fortfarande markera att den inte kan ett visst pass, utan att ändra hela veckofördelningen.

## Ändring vid behov

Vid ett pass finns ett tydligt val:

- **Bara detta pass**: byt ansvarig, släpp eget pass eller låt ägaren ändra tid/instruktioner för just datumet.
- **Kommande pass denna veckodag**: ändra veckofördelningen från ett valt datum till periodens slut.

Enskilda ändringar skyddas när veckofördelningen senare uppdateras. Klara, historiska och redan startade pass ändras inte. Ändringar av period och passmallar förhandsvisas; om framtida bokade pass berörs visas detta före bekräftelse. Mallar arkiveras vid borttagning så historiken kan behålla sin koppling.

Förändringar av schema ska aldrig automatiskt markera hästarnas foderkontroller eller hagstatus som klara. Detta gäller ansvar och stallarbete; befintliga hästflöden finns kvar.

## Alternativen som granskats

| Alternativ | Följd |
|---|---|
| **Tre små schematabeller, rekommenderat** | Tydliga identiteter för egna pass, en ansvarig per veckocell, behörigheter och dublettskydd i databasen. Återanvänder de konkreta pass som appen redan visar. |
| Allt i stallets settings-JSON | Färre tabeller men befintliga settings-formulär normaliserar bort okända fält. Medlemsval behöver ändå nya serverfunktioner och konkurrerar om hela dokumentet. |
| En periodtabell med mallar/val i JSON | Kan fungera med serverlås, men enklare tabellantal ger svårare referensregler och fördelning mellan flera samtidiga medlemmar. |

## Konkreta föreslagna databasändringar

Tre nya tabeller i befintligt StableFlow-projekt:

| Tabell | Föreslagna uppgifter och regler |
|---|---|
| schedule_periods | id, stable_id, name, date_from, date_to, revision, skapad/uppdaterad tid. En period per datum för samma stall; daterade perioder kan sparas i förväg. Ägaren styr definitionen. |
| schedule_templates | id, period_id, name, start_time, valfri end_time, instructions, sort_order, arkiveringsmarkering. En egen identitet per pass, även om två pass ligger på morgonen. |
| schedule_weekly_assignments | template_id, weekday, assignee_id, changed_by_user_id, owner_controlled, revision. Unik kombination template_id + weekday. Ägarprioritet bestäms av verifierad behörighet på servern. |

Tre nya fält på befintliga assignments: **template_id**, **original_date** och **is_schedule_override**. Gamla pass får ingen mallkoppling. En unikhetsregel för template_id + original_date hindrar dubletter även efter flytt av ett enstaka pass. Mall och period hör till samma stall som den konkreta passraden.

Befintliga Morning/Lunch/Evening behålls som visuella tidskategorier. series_id för befintliga serier finns kvar. Titel, klockslag och instruktioner kopieras till de konkreta passen så historik inte ändras när en mall uppdateras.

Nya serverfunktioner ska spara period/mallar, generera pass, ändra veckofördelning och ändra en förekomst. Den befintliga series-triggern anpassas endast för uttryckligen kopplade säsongspass. Klara/startade pass skyddas fortsatt.

Alla nya tabeller får RLS och kontroller av aktivt konto, faktiskt medlemskap och rätt stall. Medlemmars ändringar begränsas till egna val. Ägarändringar och sena medlemsanrop serialiseras med lås och versionskontroll. Även två ägarflikar ska få en begriplig konflikt i stället för att blint skriva över varandra.

Passgenerering är idempotent och omfattar den begränsade datumperioden; ingen ny cron eller tjänst behövs. Den redan beslutade gränsen 365 konkreta pass per omgång bevaras genom flera kontrollerade omgångar bakom samma UI-åtgärd. Ett avbrutet sparande går att återuppta utan dubletter och ett ofärdigt upplägg får inte visas som färdigt.

Hämtning av assignments behöver pagination så exempelvis fem pass varje dag i ett år inte försvinner vid Supabases radgräns. Dublettkontroll och ägarprioritet får aldrig bero på de rader som råkar vara laddade i telefonen.

## Kod som återanvänds och varför

- app/(tabs)/calendar.tsx: befintligt schema, datumväljare och enskilda pass. Återkommande formulär vid rad 2670; serieredigeringsvägen vid 1084 behöver val för endast ett pass.
- context/AppDataContext.tsx: createRecurringAssignments vid 6532 och passens ta/släpp/klart vid 6286, 6375 och 6431. Befintlig standardfördelning vid 6108 körs i klienten och ska inte användas som garant för nya säsongsregler.
- app/(tabs)/profile.tsx: standardpass vid 362 blir ingång till personens faktiska säsongsveckopass när sådan period finns.
- app/members/[id].tsx: ägarens befintliga medlemsfördelning vid 146.
- lib/recurringSeries.ts: datum/tid-validering och bevarandet av framtida respektive historiska pass.
- supabase/migrations/20261008233400_recurring_assignment_series.sql: befintlig series-trigger och RPC visar skyddet som måste behållas.

UI använder appens befintliga blå/vita Figma-tema, Inter, komponenter och navigationsmönster. Ingen generell refactor behövs.

## QA-plan efter implementation

1. Skapa en vinterperiod med morgon/lunch/kväll och kontrollera att inga fasta pass genereras utanför start/slut.
2. Lägg till två extra pass med egna tider/instruktioner och kontrollera att båda kan väljas separat på mobilen.
3. Välj tisdag + torsdag en gång som medlem, ladda om och kontrollera kommande veckor och periodens sista dag.
4. Ändra samma veckocell som ägare, skicka ett försenat medlemsval och kontrollera att ägarens beslut ligger kvar.
5. Byt/släpp bara ett datum och kontrollera att nästa vecka är oförändrad och att originalpasset inte återskapas.
6. Ändra framtida mall/fördelning och kontrollera att klara, historiska och enskilt ändrade pass är bevarade.
7. Prova sparfel/återförsök, samtidiga val och ett år med fler än 1 000 pass; inga dubletter, tysta behörighetsfel eller saknade veckor.

Godkännande av detta förslag avser funktionalitet, UI och ovan beskrivna databasändringar i repo och befintligt Supabase-projekt. Det innebär inte köp eller extern webbpublicering.

## Preciserade implementationsregler

- Ett ledigt pass har ingen ansvarig.
- Perioden har beständig status draft/generating/ready och generation_revision. Varje omgång kontrollerar revisionen och ändrar högst 365 förekomster. Servern verifierar full täckning före ready. Ofärdiga perioders pass är inte aktiva; avbrott kan återupptas efter omladdning. Veckoval avvisas under generering.
- Veckoregler får effective_from, så valt ändringsdatum kan bevaras utan att tidigare veckor får ett nytt ansvar. Unik identitet är mall, veckodag och från-datum; aktuell regel är den sista giltiga regeln före passdatumet. Ägarstyrning kontrolleras över hela berört framtida intervall.
- En ägartömd veckocell sparas med assignee_id NULL och owner_controlled true. Ägaren kan uttryckligen öppna den för egna val igen.
- Bara detta pass sätter is_schedule_override true. Mall och original_date ändras inte. Senare generering och veckoval lämnar undantaget orört. Återställning till standard kräver ett uttryckligt val.
- Kontoradering och medlemsförlust öppnar framtida tilldelningar och kopplar bort personer från historik utan att radera perioder, mallar eller gemensamma pass.
- Ägarprioritet gäller även äldre och direkta skrivvägar; vanlig enstaka ta/släpp/klart ska fungera. Den äldre autoeffekten hoppar över template_id-pass.
