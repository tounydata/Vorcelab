# Analytics produit — taxonomie & métriques

Les événements sont stockés dans `public.user_events (user_id, event, meta, created_at)`.
Le plan/entitlement de vérité est `public.user_entitlements`.

## Répartition client / serveur

Règle : **la confirmation de paiement vient du SERVEUR** (webhook Stripe), jamais du
seul client → pas de double comptage.

| Émis par le CLIENT (UI) | Émis par le SERVEUR (webhook / edge) |
|---|---|
| signup_started, signup_completed, legal_accepted, onboarding_*, strava_connect_started/failed, first_*_viewed, race_created, gpx_uploaded, first_strategy_generated, coach_plan_generated, first_workout_completed, progate_view, upgrade_modal_open, upgrade_cta_click, **checkout_started** | strava_connected*, first_sync_completed*, runner_profile_computed*, **checkout_completed, plan_renewed, plan_payment_failed, plan_cancelled, plan_expired**, account_deleted |

(\* peut être émis côté client aujourd'hui ; à basculer côté serveur quand le
webhook Strava/compute enrichira `user_events`.)

Déjà câblés dans ce dépôt : `checkout_started` (UpgradeModal), `legal_accepted`
(gate de consentement), `payment_success_viewed`, `upgrade_modal_open`,
`upgrade_cta_click` (+ `has_teaser`). Les `plan_*` / `checkout_completed`
proviendront du webhook Stripe (lot 2C).

## Requêtes de métriques (prêtes à exécuter)

> Admin uniquement — à exposer via des RPC `SECURITY DEFINER` gardées par
> `is_admin` (même patron que les `admin_get_*`), ou à lancer dans le SQL editor.

### Activation (a connecté Strava et vu une première analyse)
```sql
select
  count(distinct user_id) filter (where event = 'session_start')      as onboarded,
  count(distinct user_id) filter (where event = 'strava_connected')   as strava_connected,
  count(distinct user_id) filter (where event = 'first_analysis_viewed') as activated
from public.user_events;
```

### Time-to-value (délai inscription → première analyse), médiane
```sql
select percentile_cont(0.5) within group (order by ttv) as median_ttv_hours
from (
  select p.id,
    extract(epoch from (min(e.created_at) filter (where e.event='first_analysis_viewed') - p.created_at))/3600 as ttv
  from public.profiles p
  join public.user_events e on e.user_id = p.id
  group by p.id
) t where ttv is not null;
```

### Rétention J1 / J7 / J30 (revient après l'inscription)
```sql
with first_seen as (
  select user_id, min(created_at)::date as d0 from public.user_events
  where event='session_start' group by user_id
)
select
  count(*) as cohort,
  round(100.0*count(*) filter (where exists (
    select 1 from public.user_events e where e.user_id=f.user_id and e.event='session_start'
      and e.created_at::date = f.d0 + 1)) / nullif(count(*),0), 1) as d1,
  round(100.0*count(*) filter (where exists (
    select 1 from public.user_events e where e.user_id=f.user_id and e.event='session_start'
      and e.created_at::date between f.d0 + 1 and f.d0 + 7)) / nullif(count(*),0), 1) as d7,
  round(100.0*count(*) filter (where exists (
    select 1 from public.user_events e where e.user_id=f.user_id and e.event='session_start'
      and e.created_at::date between f.d0 + 1 and f.d0 + 30)) / nullif(count(*),0), 1) as d30
from first_seen f;
```

### WAU (utilisateurs actifs 7 jours)
```sql
select count(distinct user_id) as wau from public.user_events
where event='session_start' and created_at > now() - interval '7 days';
```

### Conversion free → PRO
```sql
select
  count(*) as total,
  count(*) filter (where plan_tier='pro') as pro,
  round(100.0*count(*) filter (where plan_tier='pro')/nullif(count(*),0),2) as conv_pct
from public.user_entitlements;
```

### Conversion paywall → checkout → paiement (funnel)
```sql
select
  count(distinct user_id) filter (where event='upgrade_modal_open') as modal_open,
  count(distinct user_id) filter (where event='checkout_started')   as checkout_started,
  count(distinct user_id) filter (where event='plan_upgraded')      as paid   -- serveur
from public.user_events;
```

### MRR / ARR / ARPU (depuis les entitlements actifs)
> Prix à centraliser (voir lot pricing). Barème actuel : 5 €/mois, 50 €/an.
```sql
with active as (
  select stripe_price_id, count(*) n from public.user_entitlements
  where status in ('active','trialing') group by stripe_price_id
)
-- Remplacer les montants par un mapping price_id → montant mensuel normalisé.
select
  sum(case when stripe_price_id ilike '%annual%' then n*50/12.0
           when stripe_price_id ilike '%month%' then n*5.0 else 0 end) as mrr_eur
from active;
-- ARR = MRR*12 ; ARPU = MRR / utilisateurs actifs.
```

### Churn (résiliations sur période payée finissant bientôt)
```sql
select count(*) as expiring_30d
from public.user_entitlements
where status in ('canceled','past_due') and current_period_end between now() and now() + interval '30 days';
```

## Précision des projections
Nécessite le versionnement moteur + le banc de validation (lot dédié) : comparer
`race_calendar.last_projection` à `result_activity`. Voir la roadmap moteur.
