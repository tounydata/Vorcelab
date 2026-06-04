-- Autorise plusieurs séances de renfo du MÊME type le même jour (double séance).
-- On lève la contrainte d'unicité (user_id, session_date, focus) : l'id devient la
-- seule clé. La sauvegarde catalogue (RenfoSessionPage) ne s'appuie plus sur ON CONFLICT
-- mais sur un select→update/insert explicite.
alter table public.renfo_session_log
  drop constraint if exists renfo_session_log_unique;
