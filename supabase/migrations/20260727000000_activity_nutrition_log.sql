-- Journal de RAVITAILLEMENT par sortie (facultatif) : ce que le coureur a bu/mangé
-- pendant une activité, saisi à la main dans l'analyse de sortie. But produit :
-- APPRENDRE ses habitudes réelles (débit d'hydratation mL/h, glucides g/h) pour
-- PERSONNALISER la stratégie de course (jusqu'ici hydratation générique 500 mL/h).
--
-- Table SÉPARÉE (et non des colonnes sur strava_activities) par sécurité : les
-- données Strava synchronisées ne sont modifiables que par le service role
-- (aucune policy UPDATE utilisateur) ; on isole donc les données ÉDITABLES par le
-- coureur, sans ouvrir en écriture les champs immuables (distance, temps…) qui
-- nourrissent le moteur. RLS stricte : chacun ne voit et n'écrit que ses lignes.

create table if not exists public.activity_nutrition_log (
  id            uuid        not null default gen_random_uuid() primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  activity_id   uuid        not null references public.strava_activities(id) on delete cascade,
  -- Liquides bus (mL) sur toute la sortie. Null = non renseigné.
  fluid_ml      integer     check (fluid_ml is null or (fluid_ml >= 0 and fluid_ml <= 20000)),
  -- Boisson avec électrolytes/sels (oui/non).
  electrolytes  boolean     not null default false,
  -- Glucides ingérés (g) sur toute la sortie. Null = non renseigné.
  carbs_g       integer     check (carbs_g is null or (carbs_g >= 0 and carbs_g <= 2000)),
  -- Produits cochés dans le catalogue (ids nutritionProducts) — traçabilité/pré-remplissage.
  product_ids   text[],
  note          text        check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Un seul journal par activité (upsert par activité).
  constraint uq_activity_nutrition_log_activity unique (activity_id)
);

create index if not exists idx_activity_nutrition_log_user
  on public.activity_nutrition_log(user_id);

alter table public.activity_nutrition_log enable row level security;

-- L'utilisateur gère UNIQUEMENT ses propres lignes (lecture + écriture).
drop policy if exists "activity_nutrition_log: owner all" on public.activity_nutrition_log;
create policy "activity_nutrition_log: owner all"
  on public.activity_nutrition_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tenir updated_at à jour.
create or replace function public.touch_activity_nutrition_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_activity_nutrition_log on public.activity_nutrition_log;
create trigger trg_touch_activity_nutrition_log
  before update on public.activity_nutrition_log
  for each row execute function public.touch_activity_nutrition_log();
