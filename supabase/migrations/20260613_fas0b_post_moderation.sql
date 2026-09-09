-- Fas 0B #7 / Fas 1 — admin-moderering av inlägg.
--
-- Före: posts_delete tillät bara författaren (auth.uid() = user_id). När en admin
-- raderade någon annans inlägg påverkade DELETE 0 rader UTAN fel (RLS felar inte,
-- den filtrerar bort raden), så klienten trodde att det lyckades, tog bort inlägget
-- lokalt — men det fanns kvar i DB och dök upp igen vid nästa refresh.
--
-- Efter: författaren ELLER den som hanterar feeden/grupperna (can_manage_groups =
-- admin/staff) får radera. Matchar groups_*-policys (samma "hanterar feeden"-roll).
-- Klienten kollar dessutom rows-affected för att fånga ev. kvarvarande mismatch.

drop policy if exists "posts_delete" on public.posts;
create policy "posts_delete" on public.posts
  for delete using (
    (select auth.uid()) = user_id
    or public.can_manage_groups(stable_id)
  );
