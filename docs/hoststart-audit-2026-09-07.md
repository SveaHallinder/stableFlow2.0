# StableFlow inför höststart

Granskning påbörjad 2026-09-07, uppdaterad 2026-09-08. Bascommit `7f2d112`.
Arbetskopian innehåller både tidigare ändringar och förbättringarna från denna granskning.

## Aktuell bedömning

Appens viktigaste vardagsflöden har fått tydligare mobilnavigation, läsbara formulär,
bestående felmeddelanden och bekräftad sparning. Supabase svarar efter omstarten.
Appen är **inte godkänd som 10/10 eller för skarp stalldrift ännu**. Pass- och
foderbehörigheterna är nu införda och verifierade i databasen. Atomiskt skydd för
sista stallägaren och samtidiga ridhusbokningar saknas fortfarande i drift; den
riktiga inbjudningskedjan och telefonpiloten återstår också.

Inga nya dependencies har införts. Den uttryckligen godkända migrationen
`20260907_scope_assignment_updates_and_feed_checks.sql` har körts och committats
i projekt `zbcghmpjslasnxqcodqa` den 2026-09-08. Inga tabeller eller kolumner
ändrades; två funktioner, tre policyer och en trigger infördes/uppdaterades.
Ingen riktig inbjudan eller chatt har skickats under granskningen.

## Genomförda förbättringar

| Område | Förbättring |
| --- | --- |
| Mobilnavigation | Synliga svenska tabbetiketter, hästikon, läsbar Nytt pass-knapp, bottenutrymme och fungerande bakåtnavigation på desktop. |
| Idag | Dagens arbete och viktiga avvikelser visas tidigt; hela viktiga meddelandet kan läsas; foderplan och daglig hömarkering hålls isär. |
| Hästar | Namnsökning, direktväg till rätt häst, avgränsad Hantera hästar-vy, åldersvalidering, bekräftad sparning och bekräftelse före borttagning. |
| Formulär | Mobilkolumner som överlappade knappar i Stall/Admin är rättade. Berörda modaler kan scrollas. Utkast bevaras vid fel. |
| Inloggning/start | Tidsgräns och Försök igen vid sessionsfel; initial stalldata laddas innan onboarding får omdirigera eller formulär användas. |
| Foder och status | Hästägaren ser nu foderkollens knappar på sin hästprofil, och databasen tillåter sparningen. Foderkoll, foderplan, hästens dag/natt, vatten/hö/koll inväntar servern. Partiella statusändringar bevarar andra telefoners övriga fält. |
| Schema | Hela veckan och svenska datum, validering av datum/tid, serverbekräftade passändringar, återkommande pass och stabila återförsök. Standardpass påverkar automatisk tilldelning först efter serverbekräftelse; delvis synkade lokala val bevarar endast återstående poster. |
| Ridning och vård | Planerade ridpass, slutförande, ridlogg och vårdhändelser bevarar uppgifterna när sparning misslyckas. Delvis slutfört ridpass kan återupptas. |
| Hagar | Skapa/redigera/ta bort inväntar bekräftelse, behåller utkast och kräver avsiktlig borttagning. |
| Ridhus och händelser | Bokning, avbokning, ridhusstatus och dagshändelser inväntar servern. Klientens krockkontroll är inte ett atomiskt serverskydd. |
| Kommunikation | Chatt, inlägg, kommentarer, gillningar och grupper inväntar kvittens. Utkast behålls och ändrad text kan återförsökas utan dubbletter. Misslyckad bilduppladdning stoppar publicering. Kontakter har tydliga ring-/mejlåtgärder. |
| Medlemmar | Roll, hästkoppling och borttagning visas som klara först när servern har bekräftat ändringen. |
| Inbjudan | Endast valda stall används. Kod och kopieringsknapp visas efter bekräftelse; misslyckade försök behåller samma identitet. Ingen obestyrkt leveransbekräftelse. |
| Inställningar | Bekräftad sparning, konfliktbesked vid ändringar på annan telefon och bevarade ändrade fält efter uppdatering. |
| Stallstart | Gård, stall, ägarmedlemskap och gruppchatt bekräftas i ordning; samma utkast-ID används vid återförsök. Gårdsresurser sparas stegvis med bevarade fält, och manuellt vald gård återställs inte av uppdatering. |
| Synk | Synlig senaste uppdatering och Uppdatera, hämtning när appen återaktiveras samt varje minut i förgrunden. Pågående skrivning skyddas från äldre hämtningar. |

## Underlag och verifiering

Lästa ytor: routes, `context/AppDataContext.tsx`, `context/AuthContext.tsx`, delade
komponenter, `lib`, befintligt schema, tester och tidigare QA-dokument. Tidigare
QA-rapporter är historik och räknas inte som godkända tester för dagens kod.

Chrome har använts på localhost i mobilbredd 390 px och desktop. Granskade vyer:
Idag, hästlista/profil, Schema och formulär, Hagar, Feed, chatt, Stall, Medlemmar,
Kontakter, Admin, inställningar och onboarding. De nya nätfelstesterna använder
riktig QA-inloggning men fångar skrivningar till syntetiska testposter i webbläsaren.
De visar klientens beteende; de bevisar inte produktionsdatabasens skrivbehörighet.

Senaste fulla avslutade kodkontroll: **209/209 tester, lint, TypeScript och webbexport
godkända**. Slutkontrollen omfattade **34 unika godkända UI-fall** över två
sekventiella körningar. Ett äldre foderstest pausade sin request innan testet
hade fått dess release-callback; testets synkronisering rättades och alla sex
foder-/standardpassfall passerade vid omkörning. Detta krävde ingen produktionsfix
av foderflödet.

De 34 slutkontrollerna omfattar bokning/avbokning, vård, standardpass, gård och
stallskapande, delvis slutförd ridlogg, kommentarer/reaktioner, grupper,
foderkollar, uppdatering mellan telefoner, passbekräftelser och mobilnavigation.
Separata tidigare körningar under samma granskning verifierade även inbjudan,
medlemsroller/hästkopplingar, profil, publicering, hagar och kalendernotiser.
Dessa räknas inte in en extra gång i siffran 34.

Tidigare under denna granskning verifierades även:

- QA-inloggning för admin, personal, hästägare, medryttare och gäst.
- Riktig foderkoll med omladdning och återställning av testdata.
- Två samtidiga anspråk på samma testpass: en vinnare, bestående resultat,
  testpasset borttaget efteråt.
- Partiella statusändringar mellan två telefoner utan att övriga statusfält tappas.
- Ursprunglig lokal SQL-verifiering av behörighetsskyddet: 50 kontroller.
  Efter godkännandet följde nedanstående verifiering mot den riktiga databasen.

Vissa äldre Node-tester kontrollerar källkodstext. Nya beteendetester kör även de
faktiska callback-funktionerna med styrda serversvar. Mobiltesterna kontrollerar
synliga formulär, väntelägen, nekade/tomma kvittenser och återförsök.

## Verifiering efter den godkända databasändringen

- Före ändringen: live funktioner, policyer, kolumner och befintlig push-trigger
  kontrollerade; tidigare policydefinitioner sparade i
  `/tmp/stableflow-db-rollback.sql`. Den filen har inte körts.
- Migrationen avslutades med COMMIT. Därefter verifierades installerad trigger,
  funktioner och policyer på nytt. `supabase/schema.sql` speglar migrationen.
- **46/46 SQL-rollprov** passerade mot driftschemat, med separata syntetiska
  teststall och användare i en transaktion som avslutades med ROLLBACK.
  Proverna omfattar egna pass, nekad stöld/ändring av andras pass, stabila
  stallgränser, automatisk tilldelning för redigerare och hästägarens foderkoll.
  Inga testmedlemskap eller användare sparades. Kontroll efteråt hittade inga
  kvarvarande syntetiska stall eller den kontrollerade syntetiska användaren.
- **7 unika webbprov** godkända efter migrationen: hästägarens sparning/omladdning,
  gästens dolda skrivknappar, fyra foderprov och två samtidiga passanspråk med
  exakt en vinnare. Fem passerade i första körningen; ägarprovet avslöjade att
  hästprofilens knappar saknade ägarvillkoret. Villkoret rättades, därefter
  passerade båda ägar-/gästproven. QA-data återställdes och det skapade passet
  togs bort. Detta är en separat, riktad kontroll efter de tidigare 34 UI-fallen.
- Nyinstallation: hela `supabase/schema.sql` kördes framgångsrikt i en tom
  lokal PostgreSQL-databas med Supabases auth-funktioner representerade av
  teststubbar. Foderhjälparen och en befintlig chatthjälpare ligger nu efter
  sina tabeller. Inga ytterligare funktionskroppar ändrades i drift.
- UI-testets återställning fångar även skickad request före serversvaret och
  matchar anteckning/markering villkorligt, så en nyare samtidig uppdatering
  inte skrivs över av städningen.
- Efter UI-rättningen: **209/209 Node-tester, lint, TypeScript och webbexport**
  godkända. Ingen frontend har publicerats externt; aktuell kod finns på localhost.

Testfil: `supabase/tests/rls_assignment_feed.sql`. SQL-provet återställer även
köade nätanrop: [pg_net skickar först efter COMMIT](https://supabase.com/docs/guides/database/extensions/pg_net).
Kör inte hela bootstrap-schemat på drift för att applicera en enskild migration.

## Kvar före godkänd pilot

1. **Atomisk samtidighet:** live databas har nu kontrollerats. `arena_bookings`
   saknar både överlappsskydd i constraints och relevanta triggers. `stable_members`
   saknar trigger som skyddar sista ägaren mellan samtidiga transaktioner. Ett
   separat SQL-förslag har nu klarat 71/71 lokala kontroller, inklusive åtta
   tvåanslutningstester i READ COMMITTED och REPEATABLE READ. Användaren godkände det den 2026-09-09. Det är ännu inte infört i drift;
   Git-sparning prioriterades inför användarens datoromstart.
   Godkänt förslag och alla lokala testunderlag är sparade i
   `docs/checkpoints/2026-09-09-restart/`. Återuppta där utan ny godkännandefråga.
2. **Äldre stalldata och anslutningskoder:** 13 stall från 2026-01-11 saknar
   medlemskap, hästar och pass. Övriga relationer är inte inventerade och inga
   rader är borttagna eller tilldelade ny ägare. `generate_join_code()` är dessutom
   deklarerad IMMUTABLE trots slumpinnehåll; detta gav identisk kod för två
   teststall i samma INSERT. Ändring till VOLATILE föreslås separat.
3. **Inbjudan från början till slut:** mottagaren accepterar på egen telefon,
   ser rätt stall och endast tilldelade rättigheter. Hästägare behöver efter
   accept väljas på hästen; UI förklarar detta. Inga mejl har skickats i QA.
4. **Pilot på riktiga telefoner:** två personer kör morgon/lunch/kväll, återöppnar
   appen, provar svag uppkoppling och kontrollerar att samma sparade resultat syns.
   Webbläsarsimulering är inte ett fysiskt stalltest.
5. **Distribution:** arbetsantagandet är mobilwebb först. Native iOS/Android och
   push är inte verifierade; `app.json` innehåller fortfarande `YOUR_EAS_PROJECT_ID`.
   Databasens push-inställningar saknas enligt live kontroll och testlogg;
   databasens pass-trigger skickade därför inga pushnotiser under testerna.
6. **Kvarvarande detaljer:** hagkopplingar använder hästnamn, formulär för hagar
   har fortfarande sista-skrivningen-vinner för hela formuläret, och stabila
   skapande-ID:n i minnet överlever inte nödvändigtvis en stängd app mitt under
   delvis slutfört skapande. Dessa begränsningar ska hanteras i pilotbeslutet.

## Kort QA-script på localhost

1. Starta med `npm run dev -- --web --port 8081`. Öppna
   `http://localhost:8081/?qaDemo=1` i mobilbredd. Demo återställs vid omladdning.
2. Hästar → Saga: läs foderplanen, ändra Hö och gå tillbaka. Planbeskedet ska
   finnas kvar. Hantera hästar ska visa en egen hästvy med åtkomliga formulär.
3. Schema: öppna Nytt pass, Ridschema → Registrera och Ridhus → Ny bokning.
   Kontrollera datum, fält och att spara/avbryt går att nå. Avbryt testutkasten.
4. Öppna Hagar, Kontakter och Admin på mobil och desktop. Kontrollera att inga
   kort täcker knappar och att bakåt, sökning och tomlägen är begripliga.
5. I separat teststall: spara foderkoll och en status från två konton. Uppdatera
   på den andra telefonen och ladda om. Bekräftade värden ska bestå och andra
   statusfält ska finnas kvar.
6. Kör de mockade nätfelstesterna innan egna driftprov. Kontrollera Sparar →
   bestående fel → bevarat utkast → lyckat återförsök. Använd särskilda testdata;
   inbjudningar och chatt ska inte skickas till riktiga mottagare av testsviten.
7. I QA-stallet: logga in som hästägare och spara foderkoll på egen häst, ladda
   om och kontrollera anteckningen. En gäst ska sakna skrivknappar för andras
   hästar. Kör mottagarens inbjudningsflöde inför beslut om avgränsad stallpilot.
