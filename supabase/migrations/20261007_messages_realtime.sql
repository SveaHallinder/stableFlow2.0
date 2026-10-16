-- PREP ONLY: requires explicit approval before live application.
-- Adds exactly public.messages to the existing publication.
begin;

do $messages_realtime$
declare
  publication_oid oid;
  publication_all_tables boolean;
  publication_insert boolean;
  messages_oid oid;
  messages_kind "char";
  messages_rls boolean;
begin
  select p.oid, p.puballtables, p.pubinsert
    into publication_oid, publication_all_tables, publication_insert
    from pg_catalog.pg_publication p
    where p.pubname = 'supabase_realtime';

  if publication_oid is null then
    raise exception using errcode = '55000',
      message = '[messages realtime] Publication supabase_realtime saknas; ingen publication skapades.';
  end if;
  if publication_all_tables or not publication_insert then
    raise exception using errcode = '55000',
      message = '[messages realtime] Publicationens scope eller INSERT-inställning skiljer sig från godkänd preflight.';
  end if;

  select c.oid, c.relkind, c.relrowsecurity
    into messages_oid, messages_kind, messages_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'messages';

  if messages_oid is null then
    raise exception using errcode = '42P01',
      message = '[messages realtime] Tabellen public.messages saknas; ingen tabell skapades.';
  end if;
  if messages_kind <> 'r' or not messages_rls then
    raise exception using errcode = '55000',
      message = '[messages realtime] public.messages måste vara en vanlig tabell med befintlig RLS aktiverad.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_rel r
    where r.prpubid = publication_oid and r.prrelid = messages_oid
  ) then
    alter publication supabase_realtime add table only public.messages;
  end if;
end
$messages_realtime$;

commit;
