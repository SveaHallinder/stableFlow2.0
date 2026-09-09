# Återuppta efter omstart — 2026-09-09

Gren: `balanced-mvp-1.1.0`. Målet är en användbar StableFlow-app för höststart.
Den här Git-sparningen innehåller hela arbetskopians förbättringar, även ändringar
som fanns före granskningen. Ingen ny dependency. Frontend är inte publicerad.

## Godkännande och databasstatus

Användaren godkände nästa SQL-förslag den 2026-09-09 och bad därefter att arbetet
skulle pushas inför datoromstart. **Godkännandet gäller och ska inte begäras igen.**
Filen `stableflow-next-db-proposal.sql` i denna mapp är det godkända förslaget,
SHA-256 `2dd8426ac4603007f123a1c9c869e4baa5ce576b18b278c0fa19c9db5af632d2`. Rubriker om ej godkänt/granskningsförslag i
arkiverat underlag beskriver historiken; detta dokument anger aktuell status.

- Redan infört i Supabase: `supabase/migrations/20260907_scope_assignment_updates_and_feed_checks.sql`.
  Projekt: `zbcghmpjslasnxqcodqa`. 46 SQL-rollprov mot driftschemat passerade och
  transaktionen återställdes. Hästägares foderknappar och sparning verifierade i UI.
- **Godkänt men INTE infört i drift:** skydd mot ridhusöverlapp, borttagning/nedgradering
  av sista stallägaren samt VOLATILE för `generate_join_code()`. 71 lokala kontroller
  passerade, inklusive åtta riktiga tvåanslutningstester i RC/RR. Underlaget sparas här.
- 13 historiska stall från 2026-01-11 saknar medlemmar/hästar/pass. Övriga relationer
  är inte inventerade. Lämna dem orörda; ingen datarensning är godkänd.

## Nästa steg

1. Läs `docs/hoststart-audit-2026-09-07.md` och det sparade SQL-underlaget.
2. Återkontrollera live förutsättningar/definitioner, spara återställningsunderlag och
   genomför det redan godkända förslaget i en transaktion. Kör inte hela schema.sql
   på drift. Lägg till en riktig migration och spegla definitionerna i schema.sql.
3. Verifiera live nekade/tillåtna skrivningar och samtidighet med isolerade QA-data,
   samt UI-felbesked för konflikter. Ingen riktig inbjudan/chatt ska skickas utan lov.
4. Därefter återstår verklig inbjudningsacceptans och pilot på två riktiga telefoner.
   Native distribution/push återstår; EAS-projekt-ID och DB-pushinställningar saknas.

## Start och testunderlag

- `npm run dev -- --web --port 8081`; öppna `http://localhost:8081`.
- Lokal demo: `http://localhost:8081/?qaDemo=1`.
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build:web`.
- Senast före sparningen: 209 Node-tester, lint, TypeScript och webbexport godkända;
  7 riktade UI-prov efter migrationen, tidigare 34 bredare UI-fall. Live SQL 46/46;
  nästa SQL-förslag lokalt 71/71. Se rapporten för vad varje kontroll faktiskt täcker.
- SQL-testskripten i denna mapp är arkiverade exakt som testade. De är för en
  **isolerad lokal testdatabas**, inte Supabase. De använder `/usr/local/bin/psql`,
  socket `/tmp/stableflow-rls-check/socket`, port 58473, postgres och databasen
  `stableflow_next_proposal_20260908`. Återskapa lokalklustret vid behov. För att
  återköra dem: kopiera dessa sex underlagsfiler till `/tmp/` med samma filnamn,
  skapa lokal testdatabas, kör setup.sql, proposal.sql, tests.py och tests-extra.py.
  Skripten återställer sina testfixtures; kontrollera alltid lokal målanslutning.
- `.env` och `supabase/.temp` innehåller lokal anslutningskonfiguration och ska
  förbli utanför Git. Inga lösenord eller privata nycklar har avsiktligt arkiverats.

## Kort QA-script

1. Öppna localhost i mobilbredd; kontrollera Idag, Hästar och Schema.
2. Logga in som QA-hästägare, spara foderkoll och ladda om; värdet ska bestå.
3. Logga in som QA-gäst; andras hästar ska sakna skrivknappar för foderkoll.
4. Låt två QA-konton ta samma öppna pass; exakt en ska lyckas.
5. Efter nästa migration: prova samtidig dubbelbokning och två samtidiga ägarborttagningar.
6. Kör inbjudningskedjan och svag uppkoppling på riktiga telefoner inför pilotbeslut.
