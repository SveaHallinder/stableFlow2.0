# StableFlow: egna gruppchattar med valda medlemmar

**Status: uttryckligen godkänt av användaren den 24 oktober 2026. Implementerat och verifierat lokalt. Godkänd databasmigrering är installerad och 24 behörighetskontroller är godkända i Hosted Supabase. Egna gruppers push är uttryckligen spärrad tills Edge-uppdateringen kan installeras.**

Detta dokument avser egna, namngivna gruppchattar. Den befintliga stallchatten och privata en-till-en-chattar ska fortsätta fungera. Inga nya dependencies, tabeller, köp eller extern webbpublicering ingår. Användaren har godkänt schema- och behörighetsändringarna i repo och befintligt Supabase med svaret ”Ja, inför säkra gruppchattar”. Aktuella fjärrkolumner, index, policies och berörda funktioner har lästs i rätt projekt före installation.

Den granskade implementationen är `supabase/migrations/20261024122050_custom_member_group_chats.sql`. Kodexemplen nedan beskriver det godkända förslaget. Slutimplementationen har dessutom `confirm_delete boolean default false` på lämna-RPC:n: servern kräver en ny uttrycklig raderabekräftelse även om användaren blir sista deltagare under ett samtidigt lämna-förlopp. Ursprunglig skaparattribution kan vara null efter kontoradering; gruppansvaret förs vidare separat.

## Vad som finns nu

- `Chatt` innehåller stallchatten för alla medlemmar och privata chattar.
- `Ny chatt` kan använda befintliga `createPrivateConversation` för en vald medlem.
- Egna grupper i `Flöde` är målgrupper för inlägg i `groups`, inte konversationer.
- `conversations_group_unique` medger endast en `is_group`-konversation per stall. RLS, läskvitton och push tolkar alla stallkopplade grupper som hela stallet. Därför är det inte säkert att bara lägga till ett formulär eller ta bort det unika indexet.

## Produktbeslut i förslaget

1. Alla inloggade, accepterade stallmedlemmar får skapa en egen grupp i sitt aktuella stall, oavsett ägar-/medlemsroll. Stallägare får ingen automatisk insyn i egna gruppchattar som de inte deltar i.
2. Skaparen väljer ett namn på 2–80 tecken och minst två andra medlemmar. Högst 50 deltagare inklusive skaparen. Endast registrerade medlemmar i samma stall kan väljas. Väntande inbjudningar är inte deltagare.
3. Gruppen hör till ett stall och visas när det stallet är valt. En-till-en-chattar behåller nuvarande beteende. Stallchatten är fortsatt gemensam och kan inte lämnas separat från stallet.
4. En grupp har en gruppansvarig. Skaparen blir gruppansvarig. Gruppansvarig får ändra namn, lägga till accepterade stallmedlemmar, ta bort andra deltagare och överlåta ansvaret. Stalladmin är inte automatiskt gruppansvarig.
5. Alla deltagare får lämna. Gruppansvarig väljer en efterträdare när andra deltagare finns; vid kontoradering eller borttagning ur stallet väljer servern automatiskt den äldsta kvarvarande accepterade deltagaren. Om ingen återstår raderas den egna gruppen och dess meddelanden. Kontoradering får inte blockeras av gruppansvar.
6. Nya deltagare får läsa gruppens befintliga historik. Innan tillägg visas: **”Nya deltagare kan läsa gruppens tidigare meddelanden.”** Borttagna deltagare förlorar fortsatt serveråtkomst och push. Redan läst eller kopierat innehåll kan inte återkallas.
7. Blockering fortsätter följa befintligt beteende: blockerade personer kan inte väljas av den som blockerar, deras meddelanden döljs för blockeraren och push filtreras. Att blockera någon tar inte automatiskt bort övriga gruppmedlemmar.
8. Första leveransen omfattar textmeddelanden och befintliga läskvitton. Bilder, filer, ljud, samtal och meddelanderedigering ingår inte i detta godkännande.

## Föreslagen exakt schemaändring

Två nya kolumner på befintliga tabeller. Det äldre `is_group` finns kvar för kompatibilitet, men behörighet avgörs av `chat_kind` och verkligt medlemskap.

```sql
alter table public.conversations add column chat_kind text;
update public.conversations
set chat_kind = case when coalesce(is_group, false) then 'stable' else 'direct' end;
alter table public.conversations alter column chat_kind set not null;
alter table public.conversations add constraint conversations_chat_kind_check
  check (chat_kind in ('direct', 'stable', 'custom'));
alter table public.conversations add constraint conversations_kind_shape_check
  check (
    (chat_kind = 'direct' and not coalesce(is_group, false) and stable_id is null)
    or (chat_kind in ('stable', 'custom') and is_group is true)
  );

alter table public.conversation_members
  add column member_role text not null default 'member';
alter table public.conversation_members add constraint conversation_members_role_check
  check (member_role in ('owner', 'member'));

-- En gemensam stallchatt, men flera egna grupper per stall.
drop index public.conversations_group_unique;
create unique index conversations_group_unique
  on public.conversations(stable_id)
  where chat_kind = 'stable' and stable_id is not null;
create unique index conversation_members_one_owner
  on public.conversation_members(conversation_id)
  where member_role = 'owner';
```

Förkontroll före migrering: lista befintliga rader med `not coalesce(is_group,false) and stable_id is not null`, okända typer eller dubbla stallchattar. Vid sådana avvikelser stoppas migreringen för uttryckligt beslut; inga historiska rader konverteras eller raderas tyst.

Ingen FK ändras. Befintlig `stable_id ... ON DELETE SET NULL` behålls. Rader vars stall har raderats är otillgängliga för vanliga klienter. Nya stall-/egna gruppchattar kräver ett existerande, valt stall genom INSERT-policy/RPC. Befintliga `ON DELETE CASCADE` för konversationsmedlemmar/meddelanden behålls.

Äldre klienters INSERT saknar `chat_kind`. Följande trigger fyller då typen från deras befintliga fält. Den tillåter inte att en äldre klient oavsiktligt skapar en egen grupp.

```sql
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.default_chat_kind()
returns trigger language plpgsql security invoker
set search_path = pg_catalog as $$
begin
  if new.chat_kind is null then
    new.chat_kind := case when coalesce(new.is_group, false) then 'stable' else 'direct' end;
  end if;
  return new;
end;
$$;
revoke all on function private.default_chat_kind() from public, anon;
create trigger conversations_default_chat_kind
before insert on public.conversations
for each row execute function private.default_chat_kind();
```

`created_by_user_id` är permanent skaparattribution. Gruppansvar ligger i `conversation_members.member_role` och kan därför överlåtas utan att skriva om vem som skapade gruppen. Migreringen får inte radera eller omskapa befintliga konversationer.

## Exakt behörighetspredikat

En gemensam, icke exponerad boolesk hjälpfunktion ersätter upprepade tolkningar av `is_group`. Den läser bara åtkomst för det autentiserade kontot, inte ett klientangivet användar-ID.

```sql
create or replace function private.can_access_chat(target_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog
set row_security = off as $$
  select auth.uid() is not null and exists (
    select 1 from public.conversations c
    where c.id = target_id and (
      (c.chat_kind = 'stable' and exists (
        select 1 from public.stable_members s
        where s.stable_id = c.stable_id and s.user_id = auth.uid()
      ))
      or (c.chat_kind = 'direct' and exists (
        select 1 from public.conversation_members m
        where m.conversation_id = c.id and m.user_id = auth.uid()
      ))
      or (c.chat_kind = 'custom' and exists (
        select 1 from public.conversation_members m
        join public.stable_members s
          on s.user_id = m.user_id and s.stable_id = c.stable_id
        where m.conversation_id = c.id and m.user_id = auth.uid()
      ))
    )
  );
$$;
revoke all on function private.can_access_chat(uuid) from public, anon, service_role;
grant execute on function private.can_access_chat(uuid) to authenticated;
```

Den är `SECURITY DEFINER` endast för att undvika rekursiv RLS-läsning. Den ligger i det icke exponerade schemat `private`, har fast `search_path`, läser `auth.uid()` och returnerar bara en boolesk åtkomstkontroll. Den ger ingen läsning av innehåll och använder aldrig `user_metadata` som behörighet. Aktivitets-/sessionskontrollerna i befintliga läskvittens-RPC:er behålls dessutom.

### Policys som ersätts

Nedan är de föreslagna nya predikaten; gamla policys med samma namn ska först tas bort så att permissiva gamla villkor inte ligger kvar parallellt.

```sql
-- SELECT konversation: riktigt medlemskap eller befintlig privat bootstrap.
create policy conversations_select on public.conversations
for select to authenticated using (private.can_access_chat(id));
create policy conversations_private_creator_select on public.conversations
for select to authenticated using (
  chat_kind = 'direct' and stable_id is null
  and created_by_user_id = auth.uid()
);

-- Egna gruppchattar skapas atomärt genom validerad RPC, inte direkt REST-INSERT.
create policy conversations_insert on public.conversations
for insert to authenticated with check (
  created_by_user_id = auth.uid() and (
    (chat_kind = 'direct' and stable_id is null and not coalesce(is_group, false))
    or (chat_kind = 'stable' and is_group is true and stable_id is not null and (
      public.is_stable_member(stable_id)
      or exists (select 1 from public.stables s where s.id = stable_id and s.created_by = auth.uid())
    ))
  )
);
-- Befintlig restrictive conversations_private_insert_self behålls.

create policy conversations_update on public.conversations
for update to authenticated using (
  (chat_kind = 'stable' and public.is_stable_owner(stable_id))
  or (chat_kind = 'direct' and created_by_user_id = auth.uid())
) with check (
  (chat_kind = 'stable' and public.is_stable_owner(stable_id))
  or (chat_kind = 'direct' and created_by_user_id = auth.uid())
);

create policy conversation_members_select on public.conversation_members
for select to authenticated using (private.can_access_chat(conversation_id));
create policy conversation_members_insert on public.conversation_members
for insert to authenticated with check (
  member_role = 'member' and exists (
    select 1 from public.conversations c where c.id = conversation_id
      and c.chat_kind = 'direct' and c.created_by_user_id = auth.uid()
  ) and (user_id = auth.uid() or public.shares_stable_with(user_id))
);
create policy conversation_members_delete on public.conversation_members
for delete to authenticated using (
  user_id = auth.uid() and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.chat_kind = 'direct'
  )
);
-- Ingen klient-UPDATE-policy tillåter att själv upphöja member_role.

create policy messages_select on public.messages
for select to authenticated using (private.can_access_chat(conversation_id));
create policy messages_insert on public.messages
for insert to authenticated with check (
  author_id = auth.uid() and private.can_access_chat(conversation_id)
);
create policy messages_update on public.messages
for update to authenticated using (
  author_id = auth.uid() and private.can_access_chat(conversation_id)
) with check (
  author_id = auth.uid() and private.can_access_chat(conversation_id)
);
create policy messages_delete on public.messages
for delete to authenticated using (
  (author_id = auth.uid() and private.can_access_chat(conversation_id))
  or exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.chat_kind = 'stable'
      and public.is_stable_owner(c.stable_id)
  )
);
```

Kolumnbehörigheter begränsar vanliga klienters UPDATE så att konversationstyp, stall, deltagarroll, författare och konversations-ID inte kan ändras genom en vanlig uppdatering:

```sql
revoke update on public.conversations from public, anon, authenticated;
grant update(title) on public.conversations to authenticated;
revoke update on public.conversation_members from public, anon, authenticated;
revoke update on public.messages from public, anon, authenticated;
grant update(text) on public.messages to authenticated;
```

Detta behåller befintligt namnbyte av stallchatten och privat chattbootstrap. Klientens `persistStableUpdate` uppdaterar redan endast titel. Inga `service_role`-nycklar flyttas till klienten.

## Atomära operationer och ansvar

Föreslagna RPC-signaturer, med implementation i icke exponerade `private`-funktioner och tunna `SECURITY INVOKER`-wrappers i `public`:

- `create_member_group(expected_user_id uuid, request_id uuid, target_stable_id uuid, group_title text, participant_ids uuid[]) returns jsonb`
- `manage_member_group(expected_user_id uuid, target_conversation_id uuid, group_title text default null, add_user_ids uuid[] default '{}', remove_user_ids uuid[] default '{}', transfer_owner_to uuid default null) returns jsonb`
- `leave_member_group(expected_user_id uuid, target_conversation_id uuid, transfer_owner_to uuid default null) returns jsonb`

Varje privat skrivfunktion använder fast `search_path`, kvalificerade tabellnamn och explicita åtkomstkontroller. `EXECUTE` återkallas från `PUBLIC`, `anon` och `service_role`, och ges bara till `authenticated` för både wrapper och dess privata funktion. Det icke exponerade schemat ska verifieras mot Data API-inställningarna. Föreslagen privilegierad skrivgräns är avsiktlig: vanliga klienter får inte kringgå atomär deltagarvalidering med separata REST-anrop.

### Skapa

1. Kräv `auth.uid() = expected_user_id`, aktivt konto, samma sessionsskydd som läskvitton och accepterat medlemskap i `target_stable_id`. Klienten får inte välja en annan skapare.
2. Normalisera namn med trim; verifiera längd 2–80. Ta bort dubletter i deltagarlistan och inkludera skaparen. Kräv 3–50 verkliga deltagare vid skapande.
3. Lås relevanta `stable_members`-rader och verifiera att **varje** deltagare är accepterad medlem i **det exakta valda stallet** och har ett aktivt konto. `shares_stable_with` räcker inte här eftersom två personer kan dela ett annat stall.
4. Nekad skapelse vid okänd användare, väntande inbjudan, deltagare från annat stall eller blockering mellan skaparen och en vald person. Inga e-postadresser eller gissade namn används som medlemskapsbevis.
5. Sätt `id=request_id`, `chat_kind='custom'`, `is_group=true`, `stable_id=target_stable_id`, `created_by_user_id=auth.uid()`. Infoga alla medlemsrader i samma transaktion och ge endast skaparen `member_role='owner'`.
6. Vid återförsök med samma ID: verifiera befintlig skapare, typ, stall, normaliserat namn och exakt initial deltagarmängd. Returnera en bekräftad befintlig konversation endast vid identiskt försök; ett krockande eller ändrat försök kräver nytt ID. Aldrig en andra grupp efter tappat svar.
7. Returnera kvitto med konversationens ID/typ/stall/titel och bekräftade deltagar-ID:n/roller. Ingen lokal lyckad navigation före kvittot. Inget mejl eller push skickas bara för att skapa gruppen.

### Hantera och lämna

- Lås konversationsraden, verifiera `chat_kind='custom'`, aktivt medlemskap i gruppen och stallet samt rollen `owner` för ändringar. Samma låsordning används i alla RPC:er.
- Tillägg validerar samma exakta stall och kontoregler som vid skapande. Efter skapande får en grupp ha 1–50 deltagare. En gruppansvarig får inte ta bort sig själv via hanteringsanropet; använd Lämna med ansvarsflytt.
- Överlåtelse får bara gå till en kvarvarande, accepterad deltagare. Byt gammal owner till member före ny owner för att respektera det unika owner-indexet. Skaparattribution ändras aldrig.
- En vanlig medlem får endast lämna sig själv. RPC:en ska ta användaren från `auth.uid()`, inte ett godtyckligt klient-ID. Lämna är idempotent och får inte återskapa ett tidigare medlemskap.
- Gruppansvarigs Lämna visar efterträdarval om andra aktiva deltagare finns. Saknas andra deltagare krävs tydlig bekräftelse att gruppen och dess meddelanden raderas.
- Databasstyrd borttagning ur stallet ska också ta bort medlemskapet i egna grupper för det stallet. Kontoradering använder samma livscykel. Efter borttagning av en owner väljs den äldsta kvarvarande accepterade deltagaren, med `joined_at`, därefter `user_id` som stabil ordning; utan deltagare raderas den egna gruppen. Detta körs transaktionellt och måste ha regressionstest för både `stable_members`-DELETE och konto-/profilborttagning.
- All direkt REST-INSERT/DELETE/UPDATE av egna gruppmedlemskap nekas; dessa flöden går via RPC. Gruppansvarig får inte läsa en annan grupp bara genom att känna till dess ID.

## Läskvitton, meddelanden, push och laddning

### Fel och loggning

RPC-fel ska vara begripliga och prefixas `[chat group]`, exempelvis ”Välj minst två andra medlemmar”, ”En vald person är inte längre medlem i stallet” och ”Gruppen kunde inte sparas. Ditt utkast finns kvar”. Serverloggar ska använda samma prefix och felkategori utan meddelandeinnehåll, mejladresser eller tokens. UI får aldrig visa lyckat resultat för nollrads-/nekat svar.

### Läskvitton

I `own_chat_read_state` ersätts befintlig `if chat.is_group`-förgrening med samma typbaserade åtkomst som `private.can_access_chat(chat.id)`. Samtliga nuvarande kontroller för aktivt eget konto, exakta meddelande-ID:n, blockerade avsändare och bekräftade egna läskvitton kvarstår. `mark_chat_messages_read` fortsätter använda den verifieringen. Borttagen deltagare kan varken läsa eller skriva kvittenser. Gruppansvarig får inte skriva andra deltagares kvittenser.

### Push

`send-push-notification` hämtar `chat_kind` tillsammans med `stable_id`:

- `stable`: alla nuvarande medlemmar i stallet, utom avsändaren.
- `direct`: explicita deltagare, utom avsändaren.
- `custom`: skärningen mellan explicita deltagare och nuvarande medlemmar i just gruppens stall, utom avsändaren.

Befintliga blockeringsfilter, meddelandeinställningar och generationer för pushregistreringar behålls. Borttagen/avslutad grupp måste nekas vid den slutliga auktoriseringskontrollen även om en webhook köats tidigare. En anpassad grupp får aldrig falla tillbaka till ”alla i stallet”.

### Hydration, realtime och lokal state

- Läs endast konversationer som RLS medger. `missingConversationStableIds` räknar endast `chat_kind='stable'`; en egen grupp får inte ersätta stallchatten.
- Ladda `conversation_members` för `direct` **och** `custom`, inte bara för `!is_group`. Bekräfta både det egna deltagandet och aktuellt stallmedlemskap för egna grupper.
- Utöka `MessagePreview` med `chatKind` och bekräftade deltagar-ID:n/roller. `group` härleds kompatibelt som `chatKind !== 'direct'`. Egna grupper behåller sitt namn; en-till-en-chattar använder motpartens namn. Gruppfilter ska skilja Stallchatt och Egna grupper.
- Privata chattar ska bara återanvända `direct`-konversationer med exakt rätt två deltagare. En egen grupp där samma person deltar är aldrig en privat chatt.
- Byte av stall/konto, utloggning och gamla A→B→A-svar använder en monoton scope-epoch. Gamla skapelse-, läs- eller meddelandesvar får inte återinföra grupper eller navigera efter att åtkomsten ändrats.
- Om deltagare lämnar/tas bort: invalidation vid medlems-/stalluppdatering och omvalidering vid fokus. Ta bort otillgänglig konversation och dess cache från aktuell state; stäng öppet chattfönster med begriplig copy. Vid servernekat läs-/skrivanrop rensas samma åtkomst och ingen optimistisk ”skickat”-status visas.
- Historisk lokal/offline åtkomst behöver inte ge ny serveråtkomst; ingen funktion får utlova återkallande av redan läst text. Nuvarande historikgränser och saknade läskvitton ska fortsätta visas ärligt.

## UI att granska före implementation

1. Chatt → **Ny chatt** öppnar två tydliga val: **Privat chatt** och **Egen grupp**. Stallchatten ligger kvar som gemensam konversation och kräver inget deltagarval.
2. Privat chatt använder nuvarande sökbara medlemsval och sparade, riktiga konversationskvitton.
3. Egen grupp visar gruppnamn och sökbara medlemsrader med checkboxar, verkligt antal valda, aktuell stallkoppling och Skapa grupp. Skaparen visas som inkluderad och kan inte avmarkeras. Fel visas vid fälten och utkastet bevaras.
4. Skapa-knappen inaktiveras under begäran och vid färre än två andra valda medlemmar. Ett misslyckat svar skapar ingen lokal spökkonversation och går att försöka om med samma request-ID.
5. Gruppens rubrik → **Gruppinformation** visar namn, stall, deltagare och gruppansvarig. Bara gruppansvarig ser Ändra namn/Lägg till/Ta bort/Överlåt ansvar. Alla deltagare ser Lämna grupp med konsekvensförklaring. Ingen dold premiumgräns.
6. Ny deltagare → bekräftelse att tidigare historik blir synlig. Ta bort/Lämna → bekräftelse med exakt grupp/person. Tom grupp raderas först efter den uttryckliga bekräftelsen.
7. Neutrala vita ytor, mörk text, tydliga kantlinjer och befintliga Ionicons/Inter. Ingen ny dependency och inga blå bakgrundsplattor.

## Verifiering som krävs innan klart

- Migrationstest med befintliga stall-/privatchattar, äldre INSERT utan `chat_kind`, stabila ID:n och oförändrad historik. Kontrollera att alla gamla permissiva policys faktiskt ersatts och att privata helper-schemat inte exponeras i Data API.
- RLS-test för A/B i grupp, C i samma stall utanför grupp, D i annat stall, anonym och borttagen deltagare. C/D får inga konversationer, meddelanden, medlemsrader, kvittenser eller push.
- Två stall där skaparen delar ett annat stall med E: E får inte läggas till gruppen i fel stall. Väntande inbjudan och inaktiva konton nekas.
- Direkta REST-försök att ändra typ/stall/skapare/roll/author/conversation-ID eller lägga in sig i en gissad grupp nekas.
- Gruppskapelse testas vid tappat kvitto, upprepning, parallella klick, delvis misslyckad deltagarvalidering och ändrat payload med samma request-ID. Allt eller inget sparas.
- Vanlig medlem kan inte byta namn eller ta bort andra. Ansvarsbyte, owner-lämna, sista deltagaren, konto-/profilborttagning och borttagning ur stallet testas, inklusive samtidiga ändringar och återförsök.
- Deltagare som avlägsnas under öppet fönster eller köad push förlorar fortsatt åtkomst. A→B→A och sent svar får inte navigera/återinföra gruppen. Befintliga blockerings-, session-, privat-chatt- och läskvittensprov ska passera.
- UI-prov mobil 390px och desktop: skapa, hitta via filter, skicka, uppdatera, öppna igen, se deltagare, ändra namn, lägg till/ta bort, lämna. Inga överlapp, inga borttappade utkast efter nätfel. Fysisk Expo Go-testning ska redovisas separat från browseremulering.
- Efter uttryckligt databasgodkännande: kontrollera aktuell fjärrschema/RLS, ta återställningsunderlag, prova migrering och rådgivare, applicera den godkända migreringen och bevisa verklig behörighet med separata testkonton. Enbart lokala mocks räcker inte som slutgodkännande.

## Avgränsning för det arbete som redan kan göras utan schemaändring

Sökbar **Ny chatt** för en medlem, tydligt gemensam stallchatt, ärlig text om flödesgrupper, meny-/profil-/medlemslänkar samt tydliga tom-/felstatus kan förbättras med nuvarande actions. Detta ändrar inte vad databasen tillåter och aktiverar inte egna gruppchattar. Det är den begränsade upptäckbarhetsförbättringen som genomförs parallellt med detta förslag.
