-- =============================================================================
-- SAUVEGARDE DU SCHÉMA `rpg` — retiré du projet Supabase `runnerdata` (Vorcelab)
-- =============================================================================
-- Ce schéma appartient à une AUTRE application (jeu de rôle textuel) qui
-- partageait par erreur le projet Supabase de Vorcelab.
--
-- Il a été retiré le 2026-05-29 dans le cadre de l'assainissement (Phase 0) :
-- 1 projet Supabase = 1 application.
--
-- Au moment du retrait, TOUTES les tables `rpg.*` étaient VIDES (0 ligne) :
-- aucune donnée perdue.
--
-- Ce fichier est une reconstruction fidèle du DDL (tables, contraintes, RLS,
-- policies, index, fonction, triggers). Pour relancer le jeu de rôle, créer un
-- NOUVEAU projet Supabase et y exécuter ce script.
-- =============================================================================

create schema if not exists rpg;

-- ── Fonction utilitaire (updated_at) ─────────────────────────────────────────
create or replace function rpg.set_updated_at()
  returns trigger
  language plpgsql
  set search_path to 'rpg', 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Table : profiles ─────────────────────────────────────────────────────────
create table rpg.profiles (
  id         uuid primary key references auth.users (id),
  username   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Table : games ──────────────────────────────────────────────────────────--
create table rpg.games (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id),
  title               text not null default 'Nouvelle chronique',
  current_scene_id    text not null default 'prologue_crossroads',
  current_location_id text not null default 'bree_old_road',
  game_state          jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── Table : game_saves ───────────────────────────────────────────────────────
create table rpg.game_saves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id),
  game_id    uuid not null references rpg.games (id),
  save_name  text not null default 'Sauvegarde',
  snapshot   jsonb not null,
  created_at timestamptz not null default now()
);

-- ── Table : characters ───────────────────────────────────────────────────────
create table rpg.characters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id),
  game_id      uuid not null references rpg.games (id),
  name         text not null,
  sex          text not null,
  age          integer not null check (age >= 18),
  race_id      text not null,
  origin       text not null,
  vocation_id  text not null,
  level        integer not null default 1,
  xp           integer not null default 0,
  pa_available integer not null default 6,
  stats        jsonb not null default '{}'::jsonb,
  skills       jsonb not null default '{}'::jsonb,
  traits       jsonb not null default '{}'::jsonb,
  hope         integer not null default 5,
  shadow       integer not null default 0,
  fatigue      integer not null default 0,
  wounds       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Table : game_events ──────────────────────────────────────────────────────
create table rpg.game_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id),
  game_id    uuid not null references rpg.games (id),
  event_type text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Index ─────────────────────────────────────────────────────────────────--
create index rpg_games_user_id_idx       on rpg.games        using btree (user_id);
create index rpg_game_saves_user_game_idx on rpg.game_saves  using btree (user_id, game_id);
create index rpg_characters_user_game_idx on rpg.characters  using btree (user_id, game_id);
create index rpg_game_events_user_game_idx on rpg.game_events using btree (user_id, game_id);

-- ── Triggers updated_at ───────────────────────────────────────────────────--
create trigger set_rpg_profiles_updated_at   before update on rpg.profiles   for each row execute function rpg.set_updated_at();
create trigger set_rpg_games_updated_at       before update on rpg.games       for each row execute function rpg.set_updated_at();
create trigger set_rpg_characters_updated_at before update on rpg.characters for each row execute function rpg.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────--
alter table rpg.profiles    enable row level security;
alter table rpg.games       enable row level security;
alter table rpg.game_saves  enable row level security;
alter table rpg.characters  enable row level security;
alter table rpg.game_events enable row level security;

-- profiles : la PK `id` EST l'identité utilisateur
create policy "rpg profiles select own" on rpg.profiles for select using (auth.uid() = id);
create policy "rpg profiles insert own" on rpg.profiles for insert with check (auth.uid() = id);
create policy "rpg profiles update own" on rpg.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "rpg profiles delete own" on rpg.profiles for delete using (auth.uid() = id);

-- games
create policy "rpg games select own" on rpg.games for select using (auth.uid() = user_id);
create policy "rpg games insert own" on rpg.games for insert with check (auth.uid() = user_id);
create policy "rpg games update own" on rpg.games for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rpg games delete own" on rpg.games for delete using (auth.uid() = user_id);

-- game_saves
create policy "rpg saves select own" on rpg.game_saves for select using (auth.uid() = user_id);
create policy "rpg saves insert own" on rpg.game_saves for insert with check (auth.uid() = user_id);
create policy "rpg saves update own" on rpg.game_saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rpg saves delete own" on rpg.game_saves for delete using (auth.uid() = user_id);

-- characters
create policy "rpg characters select own" on rpg.characters for select using (auth.uid() = user_id);
create policy "rpg characters insert own" on rpg.characters for insert with check (auth.uid() = user_id);
create policy "rpg characters update own" on rpg.characters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rpg characters delete own" on rpg.characters for delete using (auth.uid() = user_id);

-- game_events
create policy "rpg events select own" on rpg.game_events for select using (auth.uid() = user_id);
create policy "rpg events insert own" on rpg.game_events for insert with check (auth.uid() = user_id);
create policy "rpg events update own" on rpg.game_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rpg events delete own" on rpg.game_events for delete using (auth.uid() = user_id);
