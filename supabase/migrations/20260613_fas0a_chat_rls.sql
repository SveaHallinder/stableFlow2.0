-- Fas 0A #4 — chatt: stäng self-insert i andras konversationer + moderering.
--
-- Före:
--   conversation_members_insert  with check (auth.uid() = user_id)
--     → en användare kunde self-inserta i en GISSAD conversation_id och sen
--       läsa hela historiken via messages_select. Data-läckage.
--   conversation_members_select  using (auth.uid() = user_id)
--     → man såg bara sina egna medlemsrader → kunde inte rendera motpartens
--       namn (chatt-titlar föll tillbaka till "Konversation").
--   messages saknade UPDATE/DELETE-policy helt → ingen modereringsväg.
--
-- Efter:
--   * Man kan bara lägga till medlemmar i konversationer DU SJÄLV skapat, och
--     bara dig själv eller någon du delar stall med (stänger även spam-vektorn:
--     att tvinga en privat chatt på en främling).
--   * Man får se medlemsrader för konversationer man tillhör (för namn).
--   * messages kan redigeras/raderas av författaren; raderas även av stall-owner
--     (moderering).
--
-- Klienten behöver INGEN ändring: createPrivateConversation skapar konversationen
-- med created_by_user_id = jag, och batch-insertar båda raderna — båda passerar
-- eftersom konversationens created_by = auth.uid().

-- SECURITY DEFINER-helper, row_security off → undviker RLS-rekursion när policys
-- på conversation_members frågar conversation_members (samma fälla som löstes för
-- stable_members historiskt).
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
  );
$$;

-- Delar inloggad användare minst ett stall med p_other? (anti-spam-koll)
create or replace function public.shares_stable_with(p_other uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stable_members a
    join public.stable_members b on a.stable_id = b.stable_id
    where a.user_id = auth.uid()
      and b.user_id = p_other
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.shares_stable_with(uuid) to authenticated;

-- Insert: bara i konversationer du skapat, och bara dig själv eller en stallkamrat.
drop policy if exists "conversation_members_insert" on public.conversation_members;
create policy "conversation_members_insert" on public.conversation_members
  for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.created_by_user_id = auth.uid()
    )
    and (
      user_id = auth.uid()
      or public.shares_stable_with(user_id)
    )
  );

-- Select: medlemsrader för konversationer du tillhör (för namn-rendering).
drop policy if exists "conversation_members_select" on public.conversation_members;
create policy "conversation_members_select" on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));

-- Moderering: författaren äger sina meddelanden; stall-owner får radera (moderering).
drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update using ((select auth.uid()) = author_id);

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.stable_id is not null
        and public.is_stable_owner(c.stable_id)
    )
  );
