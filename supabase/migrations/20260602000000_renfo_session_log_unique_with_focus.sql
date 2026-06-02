-- Réconcilie la contrainte d'unicité de renfo_session_log avec l'intention :
-- un log par (user, date, FOCUS) — plusieurs focus possibles le même jour
-- (avant, la prod avait UNIQUE (user_id, session_date) → le 2e focus écrasait le 1er).
-- Idempotent. La nouvelle clé est moins restrictive : aucune perte de données.

alter table public.renfo_session_log
  drop constraint if exists renfo_session_log_user_id_session_date_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'renfo_session_log_unique'
      and conrelid = 'public.renfo_session_log'::regclass
  ) then
    alter table public.renfo_session_log
      add constraint renfo_session_log_unique unique (user_id, session_date, focus);
  end if;
end $$;
