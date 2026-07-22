-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT 2026-07-22 — P0.2 sécurité (docs/roadmap-audits-2026-07-22.md)
--
-- 1. renfo_focus_log : la migration 20260721000000 (perf RLS) a recréé la policy
--    UPDATE sans son WITH CHECK (présent depuis 20260611000000). Sans WITH CHECK,
--    Postgres retombe sur l'expression USING pour la ligne finale, MAIS la
--    protection explicite contre la réécriture de user_id doit être restaurée
--    telle que conçue : un propriétaire de ligne ne peut pas la réaffecter à un
--    autre utilisateur. On rétablit le verrou.
--
-- 2. Balayage défensif SECURITY DEFINER : toute fonction du schéma public en
--    SECURITY DEFINER sans search_path épinglé (dérive prod possible, p.ex.
--    fonctions déployées hors dépôt) est épinglée à `public`. Les fonctions du
--    dépôt sont déjà couvertes ; ce bloc rattrape les orphelines côté prod.
--
-- 3. Surface d'appel : EXECUTE retiré à anon/public sur toutes les fonctions
--    SECURITY DEFINER du schéma public, SAUF get_shared_race (page de partage
--    publique — intentionnel, cf. 20260611000000). Les RPC restent accessibles
--    au rôle authenticated ; leur garde interne is_admin fait le contrôle fin.
--
-- Idempotente : réexécutable sans effet de bord.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. WITH CHECK rétabli sur la policy UPDATE de renfo_focus_log ────────────
drop policy if exists "Users can update own focus logs" on public.renfo_focus_log;
create policy "Users can update own focus logs" on public.renfo_focus_log
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── 2. search_path épinglé sur toute fonction SECURITY DEFINER non configurée ─
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (p.proconfig is null
           or not exists (
             select 1 from unnest(p.proconfig) c where c like 'search_path=%'
           ))
  loop
    execute format('alter function %s set search_path = public', r.sig);
    raise notice 'search_path épinglé: %', r.sig;
  end loop;
end $$;

-- ── 3. EXECUTE anon/public retiré des SECURITY DEFINER (sauf partage public) ──
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname <> 'get_shared_race'
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
  end loop;
end $$;
