-- Approved horse birth year; retain legacy age and existing access policies.
alter table public.horses
  add column birth_year integer
  constraint horses_birth_year_check check (birth_year between 1900 and 9999);

comment on column public.horses.birth_year is
  'Birth year; calculate calendar age from the current year. Null means unknown.';

notify pgrst, 'reload schema';
