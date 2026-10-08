# Isolerad SQL-replay för ej godkända förslag

Detta är testfixturer för `codex/proposal-replay`. Inga filer installeras i produktdatabasen. En grön körning bevisar endast syntetisk PostgreSQL-replay; den ersätter inte schemaapproval, Hosted/PostgREST-körning eller UI-acceptans.

Workflowet använder befintliga `pg_config`, `initdb`, `pg_ctl`, `psql`, Python 3 och Node på `ubuntu-24.04`. Det installerar inga paket, startar ingen container och läser ingen `.env`. Varje suite skapar ett eget kort temporärt Unixsocket-kluster med `listen_addresses=''` och städar egna processer/kluster i `finally`. Testerna har inga HTTP/WS-/provideranrop. Checkout och uppladdning av CI-bevis är separata Actions-steg.

Fullschema-fixturen är byteidentisk med granskad schema-bas `11b8ff239ff1857a71a31f20f8821de085951695`. SQL-förslagen och negativa kontroller ligger enbart i `fixtures/`. Förkontrollen binder filernas SHA-256 före PostgreSQL-discovery/start.

| Suite | Positiv SQL | Negativ kontroll | Återanvända fall |
| --- | --- | --- | --- |
| Unread | `unread.sql`: `14d94e4e793a1a27f52f4333155b5be2de082a20b49843a01c6a45cdc8e0a1dc` | Separata private-scope/prefix-fixturer, samma mutationer som den tidigare drivern | 24 fall, inklusive kompletta read/unread-aggregat över 1000 rader, exakta peer-ID:n och åtkomst |
| Rate quota/retry | `rate.sql`: `f3c695cbcc5aa858feec8afa82870f8638145e5ab424f60e57027432033fa61d` | `rate-negative-quota-recheck.sql`: `31ce924dea1894338d87859e219b6660c487321fe7c6250c5551d589000d4ad6` | 6 fall per version: samtidiga message-ID/like-pair, full counter och profile/Auth-cascade |
| Rate target/delete | Samma `rate.sql` | `rate-negative-duplicate-target.sql`: `8b3723c3797fe271908bd70aa11b33966c38a8bb83158230816b15d0f24140a6` | 22 fall totalt: sex verkliga INSERT/DELETE-interleaves per version, vanlig retry/delete och två legacy-alert-scopefall |
| Push receipts | `push-receipts/20261008_push_receipt_ledger.sql`: `052bcb979a86d4c41247ab059049fe99efa121991f86b425be9d5ba32ffd5f68` | Fyra separata negativa SQL-kopior: generation, generation-CAS, deadline-CAS och klientens EXECUTE | 54 SQL-assertions samt positiva/negativa CAS- och deadline-raceprov och SKIP LOCKED med verkliga backendbarriärer |

`fixtures/bindings.json` innehåller schema-, positiva och negativa SQL-hashar samt ursprungliga driverhashar. Runtime-kvittona skriver faktiskt körd SQL-SHA och PostgreSQL-version. Negativa rate-kontroller lyckas bara när det tidigare felet verkligen reproduceras; de är ingen accepterad produktimplementation.

Unread och nya rate target/delete-replayen behåller vanlig `postgres NOSUPERUSER BYPASSRLS`, separat Auth-tabellägare och uttrycklig SELECT-only-kontroll mot `auth.users`. Aktuella Hosted-katalogen tillåter även UPDATE/row-lock, men förslagen använder endast Auth-SELECT efter profile KEY SHARE. Den äldre quota/retry-drivern behåller sin superuser-fixture för setup/observer och kör skrivarna som `authenticated`; den är concurrency-bevis, inte Hosted-behörighetsacceptans. Auth-claims är syntetiska GUC-värden, inte signerade JWT.

PostgreSQL 16 kräver att själva bootstraprollen förblir superuser. Därför startar de två behörighetsfixturerna med en separat fixture-admin, skapar `postgres` för schemauppsättningen och demoterar endast den senare rollen före kandidatproven. Varje klon har uttrycklig `OWNER postgres`, så även public-schemats CREATE-behörighet följer den avsedda ägarmodellen. SQL-fixturerna ändras inte.

Rate-förslagens 10 posts, 30 comments, 120 likes, 60 messages och 20 alerts per första-skrivning-förankrat 60-sekundersfönster kräver separat godkännande. Target/delete-replayen använder kvot 2 för att prova gränsen. Inget kvotval blir produktregel genom denna testgren. Detta SQL-paket är oberoende av unread-UI:s senare retry-revisioner.

## Kör och granska

1. Använd en separat Linux-runner utan root. Kontrollera `pg_config --version`, `python3 --version`, `node --version` och att `$(pg_config --bindir)/{initdb,pg_ctl,psql}` samt befintlig `pgcrypto.control` finns. Installera inget för att kringgå en misslyckad förkontroll.
2. Läs `fixtures/bindings.json` och kör `python3 -B proposal-replay/rate-duplicate-target.py --check-source`. Detta är en ren källkontroll utan PostgreSQL-start och kan även köras på Mac.
3. Välj en egen utdatakatalog utanför källpaketet: `export STABLEFLOW_REPLAY_REPORT_DIR="$(mktemp -d /tmp/sf-sql-evidence-XXXXXX)"`.
4. Kör följande sekventiellt från repo-roten. Workflowet gör samma körningar och stoppar om en assertion misslyckas.

```sh
node proposal-replay/unread.mjs
python3 -B proposal-replay/rate-concurrency.py before
python3 -B proposal-replay/rate-concurrency.py after
python3 -B proposal-replay/rate-duplicate-target.py --run-local-replay --receipt "$STABLEFLOW_REPLAY_REPORT_DIR/rate-duplicate-target-result.json"
python3 -B proposal-replay/push-receipts/push-receipts-replay.py --schema proposal-replay/fixtures/full-schema.sql --runtime --receipt "$STABLEFLOW_REPLAY_REPORT_DIR/push-receipts-result.json"
```

5. Kontrollera exit 0 och JSON-kvitton: unread `status=PASS`, quota/retry `result=PASS` för båda versionerna och target/delete `state=PASS_SYNTHETIC_LOCAL_REPLAY_ONLY`. Kontrollera förväntade antal 24, 6/6 och 22, aktuella SQL-SHA samt cleanup-fält. Bevara kvittona. Befintlig vanlig repo-CI kör också på grenen och är oförändrad.
6. För push krävs `PASS_SYNTHETIC_SQL_ONLY; HOSTED_PROVIDER_PHONE_NOT_TESTED`, exakt 54 unika PASS-labels, fyra förväntade negativa fel, både positiva/negativa generation- och deadline-CAS-raceprov, SKIP LOCKED och `cluster_cleaned=true`. Källkontrollen kan köras på Mac genom att utelämna `--runtime --receipt ...`; då startas inte PostgreSQL.

Pushfixturens 16 filer binds före PostgreSQL-start. Fullschema-hashen `2265a4c22cfdf6eebb30e6abea1f808cf5187eb6e5ddab4eb55e6001a8f3d18b` är också verifierad mot produktbasen `b0b5ee71a9577d3ae2b7605874befc76f55efc7f`. Den befintliga pushmigrationens exakta bytes följs av receiptförslaget. Bootstrap-admin är separat; migrationsägaren demoteras till vanlig postgres före kandidaten och har endast SELECT/REFERENCES mot den separat ägda Auth-tabellen. De två skrivarrollerna ansluter som verkliga LOGIN-roller. Behörighetsproven använder syntetiska SQL-claims, vilket inte ersätter Hosted/PostgREST eller signerad JWT.

Den privata cleanup-helpern låser exakt token-ID, ägare och registreringsgeneration innan den kontrollerar collector-leasens absoluta DB-deadline. Deadlineprovet håller tokenraden oförändrad och släpper först efter bevisad låsväntan och passerad DB-deadline. Terminala ticketfel saknar collector-lease och använder endast exakt generation-CAS. Ingen rå token, notistext eller profil lagras i receipt-tabellerna. Detta nya förslag är ännu inte applicerat eller runtime-verifierat när testkällan förbereds.

Ingen aktuell Linux-SQL-körning har ännu verifierats när detta paket förbereds. Macens tidigare `initdb`-startupfel ersätts inte av käll- eller syntaxkontroller. Publicering av testgrenen och dess faktiska CI-kvitton hanteras separat av releaseägaren.

Körning `37738783685` på `df220776c8e82708973abda2456715f1d55377da` startade jobbet men stoppade i unread-fixturens setup med PostgreSQL `0A000: The bootstrap user must have the SUPERUSER attribute.` Den är inte ett godkänt SQL-prov. Bootstrap-/ägarmodellen ovan rättar just testuppsättningen; en ny grön körning med exakta SQL-hashar krävs fortfarande.

Körning `37740334570` på `196987c662fd70e2b29b5d3ff79fc7daf0fb9d69` verifierade samtliga 24 unread-prov med vanlig NOSUPERUSER/BYPASSRLS-roll och den negativa quota-versionens sex fall. Den positiva quota/retry-drivern stoppade efter tre fall: dess subprocess hade avslutats med kod 3 innan stderr-lästråden var klar. Drivern väntar nu på båda utmatningstrådarna innan exakt SQLSTATE kontrolleras. Assertions och SQL-fixturer är oförändrade; inga saknade felkoder accepteras.

Körning `37741258664` på `e72dd1ddae77d7e1d0b0f27edd6ff49982847ac0` verifierade unread 24/24 och båda quota/retry-versionerna 6/6. Target/delete-fixturen stoppade före sin första writer-interleave eftersom den demoterade migrationsrollen inte får `SET ROLE authenticated`. De två skrivbackendsen och de vanliga retry/delete-proven ansluter nu direkt som den lokala syntetiska `authenticated`-rollen, med en explicit current_user-kontroll innan claim-sättning. Migration och observer behåller vanlig postgres, separat Auth-ägare och SELECT-only. Inga extra rollmedlemskap eller Auth-/tabellbehörigheter tillkommer för postgres, och SQL-fixturerna är oförändrade.
