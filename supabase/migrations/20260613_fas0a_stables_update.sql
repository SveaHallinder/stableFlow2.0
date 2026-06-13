-- Fas 0A #1 — stables_update: owner-only, behåll creator-fallback.
--
-- Före: vilken medlem som helst (även guest) kunde UPDATE:a stall-raden och
-- därmed rotera join_code / skriva om settings. Efter: bara owner (admin+access=owner)
-- eller den ursprungliga skaparen.
--
-- VARFÖR creator-fallback kvar: klienten skapar stallet och insertar owner-
-- medlemskapet i en separat skrivning (context/AppDataContext.tsx:4027). Om den
-- andra skrivningen faltar är is_stable_owner(id) falskt, och utan
-- created_by-grenen skulle skaparen låsas ute ur sitt eget stall.
--
-- OBS: stables-tabellens PK heter `id` (inte `stable_id`).

drop policy if exists "stables_update" on public.stables;
create policy "stables_update" on public.stables
  for update
  using (created_by = auth.uid() or public.is_stable_owner(id))
  with check (created_by = auth.uid() or public.is_stable_owner(id));
