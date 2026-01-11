-- Ensure horses.can_sleep_inside exists for onboarding day-logic updates.

alter table public.horses
  add column if not exists can_sleep_inside boolean;
