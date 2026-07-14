-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — Source de vérité serveur des entitlements + idempotence Stripe.
--
-- Objectif : ne plus dériver le PRO uniquement de profiles.plan_tier (champ
-- historique), mais d'une table serveur dédiée, écrite EXCLUSIVEMENT côté serveur
-- (service role / webhook), lisible par l'utilisateur pour sa propre ligne.
-- + un registre d'événements Stripe pour garantir qu'un même event n'applique
--   jamais deux fois la même mutation.
--
-- Cette migration est ADDITIVE et idempotente. Elle ne modifie pas encore les
-- lecteurs applicatifs (usePlanTier) : le câblage se fait dans un lot séparé une
-- fois le webhook déployé pour alimenter user_entitlements.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── user_entitlements : source de vérité commerciale ─────────────────────────
create table if not exists public.user_entitlements (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  plan_tier             text not null default 'free' check (plan_tier in ('free','pro')),
  status                text not null default 'inactive'
                          check (status in ('active','trialing','past_due','canceled','incomplete','expired','inactive')),
  source                text not null default 'none'
                          check (source in ('none','stripe','manual','apple','google')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_price_id        text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists user_entitlements_stripe_customer_idx
  on public.user_entitlements (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists user_entitlements_stripe_sub_idx
  on public.user_entitlements (stripe_subscription_id) where stripe_subscription_id is not null;

alter table public.user_entitlements enable row level security;

-- Lecture : l'utilisateur voit UNIQUEMENT sa propre ligne.
drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own on public.user_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

-- Aucune policy d'écriture pour anon/authenticated ⇒ RLS refuse toute
-- INSERT/UPDATE/DELETE côté client. Seul le service role (bypass RLS) écrit.
-- Filet de sécurité supplémentaire au cas où un GRANT large existerait :
revoke insert, update, delete on public.user_entitlements from anon, authenticated;

-- updated_at automatique.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_entitlements_touch on public.user_entitlements;
create trigger trg_user_entitlements_touch
  before update on public.user_entitlements
  for each row execute function public.touch_updated_at();

-- ── stripe_webhook_events : registre d'idempotence ───────────────────────────
create table if not exists public.stripe_webhook_events (
  event_id      text primary key,          -- id d'événement Stripe (evt_…) → unicité
  event_type    text not null,
  status        text not null default 'received' check (status in ('received','processed','error')),
  attempts      integer not null default 0,
  payload_hash  text,                       -- empreinte, pas le payload complet
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);

create index if not exists stripe_webhook_events_type_idx on public.stripe_webhook_events (event_type);
create index if not exists stripe_webhook_events_status_idx on public.stripe_webhook_events (status);

alter table public.stripe_webhook_events enable row level security;
-- Aucune policy ⇒ deny-all pour les clients (service role uniquement).
revoke insert, update, delete on public.stripe_webhook_events from anon, authenticated;

-- ── Backfill : reporter l'état PRO actuel de profiles vers user_entitlements ──
-- Ne perd aucun accès existant lors du passage à la nouvelle source de vérité.
insert into public.user_entitlements
  (user_id, plan_tier, status, source, stripe_customer_id, current_period_end, updated_at)
select
  p.id,
  case when coalesce(p.is_admin,false) then 'pro'
       when p.plan_tier = 'pro' and (p.plan_expires_at is null or p.plan_expires_at > now()) then 'pro'
       else 'free' end,
  case when coalesce(p.is_admin,false) then 'active'
       when p.plan_tier = 'pro' and (p.plan_expires_at is null or p.plan_expires_at > now()) then 'active'
       when p.plan_tier = 'pro' then 'expired'
       else 'inactive' end,
  case when coalesce(p.is_admin,false) then 'manual'
       when p.stripe_customer_id is not null then 'stripe'
       when p.plan_tier = 'pro' then 'manual'
       else 'none' end,
  p.stripe_customer_id,
  p.plan_expires_at,
  now()
from public.profiles p
on conflict (user_id) do nothing;
