-- Activation produit (audit §P0.3) : garantir qu'un JALON d'activation n'est compté
-- qu'UNE seule fois par utilisateur, et exposer un funnel interne minimal.
--
-- 1. Index unique PARTIEL : un même jalon (first_analysis_viewed, first_strategy_generated,
--    coach_plan_generated, first_workout_completed, nutrition_plan_generated) ne peut exister
--    qu'une fois par (user_id, event). Les événements récurrents (session_start, strategy_viewed,
--    race_debrief_viewed, crew_plan_shared, …) ne sont PAS contraints. Le client tente l'insert
--    fire-and-forget ; le doublon viole l'index et est ignoré (garantie serveur, pas cliente).
-- 2. Vue funnel INTERNE (service_role uniquement) : nombre d'utilisateurs distincts par étape.

create unique index if not exists uniq_user_events_activation_once
  on public.user_events (user_id, event)
  where event in (
    'first_analysis_viewed',
    'first_strategy_generated',
    'coach_plan_generated',
    'first_workout_completed',
    'nutrition_plan_generated'
  );

-- Funnel d'activation : Strava → analyse → stratégie → plan → entraînement → débrief.
create or replace view public.activation_funnel as
with stages(step, label, event) as (
  values
    (1, 'Connexion Strava',          'strava_connected'),
    (2, 'Première analyse',          'first_analysis_viewed'),
    (3, 'Première stratégie',        'first_strategy_generated'),
    (4, 'Premier plan coach',        'coach_plan_generated'),
    (5, 'Premier entraînement',      'first_workout_completed'),
    (6, 'Première course débriefée', 'race_debrief_viewed')
)
select
  s.step,
  s.label,
  s.event,
  count(distinct e.user_id) as users
from stages s
left join public.user_events e on e.event = s.event
group by s.step, s.label, s.event
order by s.step;

comment on view public.activation_funnel is
  'Funnel d''activation interne (audit §P0.3) : utilisateurs distincts par étape. Réservé au service_role / SQL admin, jamais exposé au client.';

-- Vue d'administration : pas d'exposition au client (anon/authenticated).
revoke all on public.activation_funnel from anon, authenticated;
grant select on public.activation_funnel to service_role;
