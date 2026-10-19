# Förslag till stabil häst–hagkoppling

Endast reviewunderlag. SQL-filen är inte en migration och har inte applicerats i
drift. Den lilla draften innehåller en kopplingstabell, två composite-FK, uttryckligen
godkänd backfill och SELECT-RLS. Ingen ny skriv-RPC eller skrivbehörighet ingår. Befintlig
UI kan inte använda den som färdig namnbytesrättning.

## Varför ID behövs

`context/AppDataContext.tsx:3359` skriver hela `horse_names` utan versionsvillkor.
Hästlista, profil, Idag och hagvy kopplar därefter via namn. En namntrigger förlorar
kopplingen när ett äldre hagutkast sparas efter namnbytet; dubbla hästnamn gör även
triggerns mål tvetydigt. Båda fallen reproducerades på lokala fixtures.

`paddock_horses(paddock_id, horse_id, stable_id)` håller identiteten oberoende av
namnet. Composite-FK kräver att båda objekten tillhör samma stall. Ett namnbyte
ändrar ingen länk, och samma häst får finnas i flera hagar. Draften inför ingen
regel om en hage per häst eller unika hästnamn.

## Backfill och stopp

Scope är uttryckligen alla befintliga hästar och hagar. En underhållstransaktion
låser källtabellerna under preflight/backfill. `null stable_id` stoppar före DDL;
ingen stalltillhörighet gissas. Null i `horse_names` betyder noll arrayposter och
bevaras som null. Varje arraypost kräver en godkänd mappning, även null, blank
eller tabbar. Utan mappning stoppar den; originaltexten ändras aldrig.

Ingen automatisk namnmatchning ingår. SQL:s `btrim` och UI:s `String.trim` hanterar
whitespace olika: review reproducerade att `Saga` och `Saga` + tab felaktigt såg
entydiga ut i SQL, samt att en tab-only post passerade ett tidigare blankstopp.
Draften undviker därför normalisering helt. Originalstavning, whitespace, ordning
och hela `horse_names` lämnas orörda. Varje post ska mappas uttryckligen i den
tillfälliga tabellen via hagens ID, originalpostens position, häst-ID och exakt
granskad `expected_source_name` (nullable). Under låset krävs att aktuell text
inte är `IS DISTINCT FROM` godkänd text; null och whitespace jämförs utan
normalisering. Ändrad text eller omordnade positioner stoppar före DDL, så låset
behöver inte hållas under mänsklig granskning. Fel position, saknad häst eller
annat stall avvisas. Upprepade poster som skulle bli samma
länk stoppar också; ingen tyst deduplicering sker. Mappningarna får inte fyllas
av heuristik eller klientbehörighet.

Driftens aggregerade, skrivfria inventering 2026-10-06 visade **6 namnposter:
5 entydiga, 1 omatchad, 0 tvetydiga** enligt inventeringens matchningsmetod.
Det är ingen godkänd backfill: **alla sex originalpositioner måste granskas och
mappas uttryckligen**. Underlaget innehåller inga namn/persondata:
`/tmp/stableflow-horse-links-readonly-20261006.jsonl`. Den omatchade originaltexten
finns kvar i `paddocks.horse_names`; draften kan därför inte aktiveras oförändrad.
Användaren behöver ange rätt häst-ID för posten eller besluta att den verkligen
är fristående text. Det senare kräver ett separat bevarande-/UI-avtal innan
aktivering; denna draft omtolkar eller tar inte bort posten. Null-scope och
eventuella upprepade poster måste också granskas, inte antas saknas.

RLS återanvänder `public.is_stable_member(stable_id)` för läsning. Även redigerare
saknar skrivrätt till den nya tabellen. Befintliga tabellprivilegier ändras inte.
SQL kör med `search_path = pg_catalog` och kvalificerade relationer. Inga nya
triggerhelpers finns; ett senare skrivavtal måste ha fast search_path och privata
helpers utan PUBLIC/anon/authenticated EXECUTE-grants. Inga bredare klientgrants
får användas som genväg.

## Obligatoriskt före aktivering

1. Godkänn schema, mappning av alla sex originalposter och hantering av null-scope.
   Behåll originaltext tills dess. Nuvarande raderingssemantik behöver också
   granskas: draftens CASCADE tar bort relationen när dess häst/hage raderas.
2. Granska ett atomiskt ID-sparavtal för hagans fält och länkar, med samma
   `can_edit_stable` och serverkontrollerad konfliktversion. Ett gammalt utkast
   ska avvisas före någon skrivning; ett nätfel får inte ge en halv uppdatering.
   Idempotent skapande och tydlig spar-/konfliktkvittens måste ingå. Avtalet är
   inte implementerat här; en full RPC + versionslivscykel blir en separat ändring.
3. Stoppa äldre klienters namnarray-skrivningar på servern vid övergången, med
   tydligt uppdateringsfel. Annars kan de få ett sparbesked som inte ändrar
   ID-länkarna. Alla läsare/skrivare nedan måste gå över före aktivering.
4. Kör roll-, stallgräns-, nätfel-, gamla utkast- och samtidighetsprov mot det
   granskade skrivavtalet. Först därefter accepteras namnbyte genom vanlig UI.
   Ett globalt namnbytesstopp ingår inte i detta förslag.

Exakta appfiler som måste följa, utifrån repo-sökningen på kodcommit
`64e97cb1a934a039d293b06bcef13fdfce63902d`:

| Fil | Nödvändig ändring före aktivering |
| --- | --- |
| `context/AppDataContext.tsx` | Paddock-typ, laddning, QA-fixture, reducer, ID-sparavtal och kvittens; inga namnarray-writes. |
| `app/paddocks/index.tsx` | ID-baserad editor, gruppering, medlemskap och aktuell namnvisning. |
| `app/stables/index.tsx` | ID-val i hagedraft, grupper, sparning och namn-/antalvisning. |
| `app/admin/index.tsx` | Snabbskapande måste spara valda ID utan namnkonvertering. |
| `app/(onboarding)/setup-paddocks.tsx` | Skapande och visning måste använda ID. |
| `app/(tabs)/stable-horses.tsx` | Hagkoppling via hästens ID. |
| `app/horses/[id].tsx` | Hagkoppling via hästens ID. |
| `lib/today.ts` | Hagkoppling via hästens ID. |
| `lib/paddocksPrint.ts` | Namn från aktuella hästar via ID; inga kvarlämnade namn. |
| `app/search/index.tsx` | Söktext och antal från ID-länkar och aktuella hästnamn. |
| `app/(tabs)/index.tsx` | Hagantal från samma ID-länkar. |

Regressioner måste följa i `scripts/paddock-save.test.mjs`,
`scripts/e2e/paddock-save-failure.spec.mjs` och riktade namnbyte-/roll-fixtures.
Medlemslistornas separata `horseNames` är inte hagkoppling och ingår inte här.

## Lokal verifiering och QA

Fixturebevis avser PostgreSQL 14.18 i en tillfällig Unix-socket-kluster med
`listen_addresses=''`; inga appanslutningar eller riktiga konton används.
26/26 lokala fall passerade; resultat finns i
`/tmp/stableflow-horse-reference-proposal-20261006-results.json` och reproduceras
från reporoten med
`node docs/checkpoints/2026-10-06-quality/horse-reference-proposal-check.mjs`.
Den arkiverade [fixturen](./horse-reference-proposal-check.mjs) kräver datorns
redan installerade PostgreSQL 14 i `/usr/local/bin` (`initdb`, `pg_ctl`, `psql`),
en Unix-användare som inte är root och Node.js. Inga paket installeras.
SQL-draften kompileras med uttryckliga fixturemappningar och även hela det
befintliga schemat kompileras i fixtureklustret. Den tomma draften, partiell
mappning, tab-dubbletter och tab-only poster utan godkännande stoppar. Fixturen
skapar och verifierar tabbar som verklig `chr(9)` i databasen. Äldre godkänd text
och omordnade poster avvisas; exakta null-/whitespace-godkännanden bevaras.
Godkänd backfill bevarar originalarrayen; null-scope, upprepade länkar och
ogiltiga mappningar stoppar
före DDL. Två hagar per häst, cross-stable-FK, rollstyrd läsning och nekade
klientskrivningar provas. Namnbyte med ett samtidigt gammalt namnarray-spar
lämnar ID-länkarna intakta. Detta bevisar tabellmodellen, inte det ännu saknade
skrivavtalet, API-acceptans i drift eller en färdig UI-funktion.

Efter en separat godkänd implementation ska UI-QA göras så här:

1. Placera en lokal fixturehäst i två hagar och öppna lista, profil, Idag och hagvy.
2. Byt namn; båda länkarna och aktuellt namn ska överensstämma även efter reload.
3. Spara ett gammalt hagutkast från en andra flik; visa konflikt och behåll länkarna.
4. Prova nätfel under sparning; varken halvt sparat innehåll eller falsk kvittens.
5. Prova redigerare, läsare och annat stall; samma behörigheter och stallgräns gäller.
