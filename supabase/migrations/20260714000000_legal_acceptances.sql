-- ─────────────────────────────────────────────────────────────────────────────
-- Acceptation versionnée des CGU / politique de confidentialité.
-- Trace, pour chaque utilisateur : le document accepté, sa version, la date et le
-- contexte (ex. écran d'origine, user-agent). Immuable : on n'écrase jamais une
-- acceptation (preuve du consentement). Un changement de version → nouvelle ligne.
--
-- RLS : l'utilisateur peut INSÉRER et LIRE ses propres acceptations ; il ne peut ni
-- modifier ni supprimer (preuve), ni voir celles des autres.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.legal_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  document    text not null check (document in ('cgu', 'privacy')),
  version     text not null,
  accepted_at timestamptz not null default now(),
  context     jsonb not null default '{}'::jsonb
);

-- Une seule ligne par (utilisateur, document, version) — ré-accepter la même
-- version est idempotent.
create unique index if not exists legal_acceptances_user_doc_version_key
  on public.legal_acceptances (user_id, document, version);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id);

alter table public.legal_acceptances enable row level security;

drop policy if exists legal_acceptances_select_own on public.legal_acceptances;
create policy legal_acceptances_select_own on public.legal_acceptances
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists legal_acceptances_insert_own on public.legal_acceptances;
create policy legal_acceptances_insert_own on public.legal_acceptances
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Pas de policy UPDATE/DELETE ⇒ immuable côté client. Filet supplémentaire :
revoke update, delete on public.legal_acceptances from anon, authenticated;
