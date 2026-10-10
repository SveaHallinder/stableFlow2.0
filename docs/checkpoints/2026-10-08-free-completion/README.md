# Kostnadsfri integration, 8 oktober 2026

Användarens ”ja på allt som e gratis” godkänner de sex färdiga databasförslagen, den exakta datumväljarversionen och den tidigare föreslagna pushkonfigurationen i befintligt StableFlow-projekt. Supabase är på Free-plan och repo är publikt med ordinarie GitHub Actions-runners. Extern webbpublicering väntar enligt användarens beslut.

Klienten visar egna bestående läskvitton, bevarar utkast vid skrivgränser och sparar ett kontobundet ägarval före kontoradering. Kontoraderingen återläser samma avsikt och tillåter högst tre manuella försök per enhet. Den kräver en verifierad aktiv ny ägare där överlåtelse behövs. Författarens text tas bort, andras svar och stallhistorik bevaras. Konton med egna eller okänt tillskrivna filer är fortsatt stoppade tills den separata filplanen är klar.

Datum- och tidsfält använder befintliga webbkontroller och den godkända native-versionen `@react-native-community/datetimepicker` exakt `8.4.4`. Övriga paketversioner är bevarade. `ios/Podfile.lock` lägger endast till datumväljarens pod. Vald ny stallägare har även explicit webbtillgänglighetsstatus för valt/låst läge.

## Verifiering

Produktbas före integrationen: `f1d8ed8e7b9c65148f14348df1e2f82cbf0cbd6d`. Den samlade klienten har klarat 683 Node-prov utan fail/skip/cancel och 108 faktiska Chromium-prov med extern HTTP och WebSockets blockerade, lint, TypeScript och webbbygge. Ett nytt unsigned Xcode-bygge med datumväljarens pod klarade iOS Simulator. Det är inte fysisk telefonacceptans.

De riktade kontoraderingsproven klarade 36 fall. Två riktiga isolerade PostgreSQL17-prov klarade hela schema-/migrationskontrollen, inklusive 20 guardkontroller, 28 privata chattkontroller, 71 arkiverade kontroller och verkliga samtidiga databasanslutningar för ägarskap/hagar. Alla nya kontoraderingsvakter var aktiva. Testfixturerna inkluderar de befintliga Auth-statuskolumnerna och Storage-relationerna. Två direkta raderingsförsök ska nu nekas av den striktare kontoraderingsvakten; deras kontroll av bevarad profil är kvar.

Hela Node-sviten körde verkliga mainkällor med Node22 och en nätverkslös PostgreSQL17-container, utan mounts eller hostportar. GitHub-CI på produktcommitten kvitteras separat i releaseunderlaget. macOS PostgreSQL14 har ett delat-minnesfel; isolerad redan cachad PostgreSQL17 används för riktiga databasprov utan globala systemändringar. En fristående granskning har dessutom klarat 56 kombinationskontroller mot de sex nya migrationerna och verifierat alla 17 befintliga pushfunktionskroppar.

## Drift och återstående slutprov

Hosted-apply sker först efter grön CI på produktcommitten: den uttryckliga privata hagmappningen, därefter account-deletion, posts-storage, own-deletion-status, egna chattläskvitton, messages-realtime och social-write-limits. Endast de godkända SQL-filerna används; hela `schema.sql` körs aldrig över befintlig Hosted-databas. Funktionerna för push och deras skyddade kontrakt bevaras. Deploy av `delete-account` och färsk metadata-/källkontroll är separata kvitton.

Den befintliga servernyckeln är sparad i Supabase Vault med dolt värde. Vaults krypterade lagring och SQL-gränssnitt följer [Supabase-dokumentationen](https://supabase.com/docs/guides/database/vault). Den föreslagna `ALTER DATABASE`-inställningen för projekt-URL nekades med `42501`; den är inte applicerad och inga extra privilegier har givits. En separat minimal Vault-URL-fallback för den befintliga pushtriggern förbereds. Nyckelns närvaro innebär inte verifierad pushleverans.

Användaren har en iPhone. Gratis lokal installation behöver användarens Apple-inloggning i Xcode och ansluten telefon. Inget nytt Apple-medlemskap eller annan betalning startas. Verklig iPhone-push kräver tillgängliga APNs-credentials; inget sådant slutprov är ännu kvitterat. Riktiga inbjudnings-/återställningsmejl, vårdpåminnelser, ändring av framtida passserier och filhanteringen vid kontoradering har egna kvarstående steg. Hela appen kallas därför inte 100 procent färdig på dessa lokala resultat.

## QA, sex steg

1. Öppna `http://localhost:8081/` och kontrollera svensk navigation, tomma lägen och nåbara hästar/schema/chattar. QA-läget använder syntetiska uppgifter.
2. Öppna ett datum- och tidsfält för ett pass eller en hästhändelse. Ändra datum/tid, avbryt och öppna igen; utkast och valt fält ska stämma.
3. Kör `npm run test:e2e`: kräv 108 pass, noll fail/skip, med den blockerande offlinekonfigurationen. Läskvittoprov ska bevara kvittensen efter reload och aldrig kvittera eget meddelande.
4. Kör `npm test`, `npm run lint`, `node node_modules/typescript/bin/tsc --noEmit` och `npm run build:web`. Använd isolerad PostgreSQL-driver om lokal PostgreSQL14 stoppas av datorns SHMALL-värde. Kräv grön CI på samma produktcommit före Hosted-apply.
5. I den isolerade kontoraderingsfixturen, välj verifierad ny ägare, kontrollera låst val efter osäkert svar och lokal sessionsstädning efter bekräftad radering. Utför ingen riktig kontoradering för detta prov.
6. Efter Hosted-kvitton, prova avsedda riktiga testkonton på dator och den enda iPhonen: mejl, inbjudan, datumfält, bestående läskvitto och push. Rapportera faktiskt resultat; simulatorbygge och offlinefixturer ersätter inte dessa prov.
