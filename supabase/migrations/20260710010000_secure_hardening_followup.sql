-- Suivi de 20260710000000 — corrige deux avertissements des advisors Supabase.
-- Idempotente.

-- 1. Fonction trigger : search_path figé (advisor function_search_path_mutable).
--    Le corps ne référence aucun objet de schéma → search_path vide, le plus sûr.
alter function public.profiles_reject_sensitive_writes() set search_path = '';

-- 2. update_last_seen : le REVOKE … FROM anon de 20260710000000 ne suffisait pas
--    car le GRANT implicite à PUBLIC restait (PUBLIC ⊇ anon). On retire PUBLIC.
revoke execute on function public.update_last_seen() from public, anon;
grant execute on function public.update_last_seen() to authenticated;
