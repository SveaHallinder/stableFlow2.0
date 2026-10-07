# StableFlow: godkända privata chattpolicyer

Utgångspunkt: `11123b67cba420a47d438dc71a17dc03537ea193`.
Detta fortsätter [inbjudningslistans checkpoint](../2026-10-07-persistent-invitation-list/README.md).

Användaren godkände uttryckligen de två granskade privata chattpolicyerna i
repo och Supabase. De applicerades i befintliga projektet med migrationsnamnet
`private_chat_bootstrap`, version `20261007173218`. Efterkontrollen bekräftar
en skaparbunden SELECT för privata konversationer samt en restrictive INSERT
som nekar någon annans creator-ID. De befintliga SELECT-/INSERT-reglerna
behölls. Meddelande- och medlemsregler, tabeller, data och grants ändrades inte.

Repo-migrationen använder samma SQL-operationer som det godkända förslaget;
endast första kommentaren märks som godkänd. Filens version matchar driftens
migrationsregister. Hela schema.sql har samma två regler.

Det ursprungliga oberoende lokala underlaget passerade 39/39 SQL-förväntningar.
Repo-testet kör nu ytterligare 14 rollback-prov mot hela schemat och samma 14
efter att båda reglerna tagits bort och migrationen applicerats två gånger.
Det bevisar bootstrap-kvittens, separat deltagarkvittens, deltagaråtkomst,
nekad förfalskad skapare, nekad annan-stall-deltagare, nekad tredje person,
anonym åtkomst och fungerande befintlig stallgrupp. De 20 arena-/ägarproven
och 71 tidigare databasproven passerar också, inklusive åtta riktiga races.

Alla dessa databasprov använder syntetiska rader i en ny lokal Unix-socket-
instans med TCP avstängt. Ingen riktig chatt eller något verkligt meddelande
skapades. Enbart kataloger lästes före/efter den godkända driftmigrationen.
Autentiserad chatt i Supabase och tvåklient-/telefonacceptans återstår.

## Övriga besked och faktisk acceptans

- Gränsen 365 nya återkommande pass per omgång är bekräftad av användaren.
- Ett enda godkänt återställningsförsök genom localhost-UI mottogs i Gmail
  som "Reset Your Password" från Supabase Auth, 2026-10-07 kl. 19:39 svensk tid.
  Inga tokens sparades och inget lösenord ändrades. Länkens mål och hela
  lösenordsbytet räknas ännu inte som accepterade.
- De två iOS-fixarna och ReachabilitySwift 5.2.4 är godkända; lokal installation,
  simulatorbygge och appstart verifieras separat innan de integreras.
- ZZ ska få en riktig hästprofil i rätt stall. Profilskapande och den separata
  haginstallationen redovisas först efter sina respektive kvittenser.
- Kontoradering ska ta bort författarens innehåll och kräva vald ny ägare.
  Konkret schema-/kodförslag, filhantering och serveråtkomst efter radering
  återstår. Inget riktigt konto har raderats.
- Realtime-publicering är ett separat lokalt verifierat schemaförslag och
  väntar på ett eget godkännande. Ingen publicering av messages gjordes här.
- Användaren har uttryckligen valt att vänta med extern publicering. Ingen
  Railway-tjänst eller annan ny offentlig app skapades.

## Kort QA-script

1. Kör `node --test scripts/db-guards.test.mjs`. Se 28 privata chattkontroller,
   20 schemakontroller och 71 tidigare databasprov utan skip.
2. Kör `npm test`, `npm run lint`, `npm run build:web` och `tsc --noEmit` före
   release. Kontrollera den exakta pushade SHA:n i PR:ens GitHub Checks.
3. Öppna `http://localhost:8081/messages?qaDemo=1`. Starta en privat demochatt
   och prova fel/återförsök via de befintliga offline-UI-proven. Demo bevisar
   användarflödet; de verkliga databasreglerna provas i steg 1.
4. Använd det redan mottagna återställningsmejlet och gör lösenordsbytet själv
   i UI om hela återställningsprovet ska fullföljas. Ange aldrig lösenord eller
   återställningstoken i loggar/chatten. Logga därefter in på localhost.
5. Efter separat godkänd realtime-installation: prova privat chatt mellan
   dator och den tillgängliga telefonen, samt nekad åtkomst för tredje konto.
   Riktiga inbjudningar behöver fortfarande giltig HTTPS-appadress och
   mejlproviderkonfiguration. Alla dessa driftprov redovisas separat.

Ändrade filer: `supabase/schema.sql`,
`supabase/migrations/20261007173218_private_chat_bootstrap.sql`,
`supabase/tests/private_chat_bootstrap.sql`, `scripts/db-guards.test.mjs`,
`ROADMAP.md` och denna checkpoint. Ingen ny dependency ingår i chattpaketet.
