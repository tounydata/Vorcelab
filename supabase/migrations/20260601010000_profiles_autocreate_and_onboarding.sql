-- Crée automatiquement une ligne `profiles` à l'inscription (corrige « ça
-- n'enregistre pas » : un compte auth sans profil ne pouvait rien persister)
-- + flag d'onboarding. Idempotent. Appliqué aussi en backfill aux comptes existants.

alter table public.profiles add column if not exists onboarding_done boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill : crée les lignes manquantes pour les comptes déjà existants.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
