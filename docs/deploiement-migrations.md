# Procédure de déploiement & vérification des migrations

> But : déployer une migration Supabase **sans risque** et prouver qu'elle est
> bien active en production. Reproductible par n'importe qui de l'équipe.
> Réf. audit 22/07 (Phase 1 — sécuriser la production).

## 0. Avant toute chose

- Une migration = un fichier `supabase/migrations/AAAAMMJJHHMMSS_nom.sql`.
- **Toutes nos migrations sont idempotentes** (réexécutables sans effet de bord) :
  `create or replace`, `drop policy if exists`, `if not exists`, blocs `do $$`.
- On ne modifie **jamais** une migration déjà déployée : on en écrit une nouvelle.

## 1. Vérifier en local (base éphémère, zéro risque prod)

```bash
# Tests de sécurité RLS + policies + quota (crée/détruit une base jetable)
bash scripts/test-rls.sh
```

Attendu : `✓ Tous les tests SQL de sécurité OK`. Si un test échoue → **stop**, on corrige avant de déployer.

## 2. Déployer en production

Deux options selon l'outillage :

### Option A — CLI Supabase (recommandé)
```bash
supabase link --project-ref wanzrkdgqmcctwvnbmuv   # une seule fois
supabase db push                                    # applique les migrations non encore déployées
```

### Option B — Dashboard Supabase
SQL Editor → coller le contenu du fichier de migration → Run. (Idempotent : ré-exécuter est sans danger.)

## 3. Vérifier que c'est réellement actif

### 3.1 Les policies attendues existent
```sql
-- WITH CHECK rétabli sur renfo_focus_log (migration 20260722000000)
select polname, cmd, qual is not null as has_using, with_check is not null as has_check
from pg_policies
where schemaname='public' and tablename='renfo_focus_log' and cmd='UPDATE';
-- attendu : has_using = true ET has_check = true
```

### 3.2 Le trigger de quota GPX est en place (migration 20260722010000)
```sql
select tgname from pg_trigger where tgrelid='public.race_calendar'::regclass and not tgisinternal;
-- attendu : trg_race_calendar_gpx_quota
```

### 3.3 Les fonctions SECURITY DEFINER ont un search_path figé
```sql
select p.proname, p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
-- attendu : 0 ligne (toutes configurées)
```

### 3.4 Les advisors Supabase ne remontent plus ces problèmes
Dashboard → **Advisors** (Security + Performance) → vérifier qu'il n'y a plus
d'alerte « function_search_path_mutable » ni « policy sans WITH CHECK » sur ces objets.

## 4. Test fonctionnel du quota (compte de test, plan gratuit)

1. Avec un compte **gratuit** ayant déjà 1 course avec GPX, tenter d'ajouter un
   GPX à une 2ᵉ course → l'app affiche « Quota gratuit atteint… » (refus **base**).
2. Vérifier la journalisation :
   ```sql
   select event, count(*) from public.user_events
   where event in ('gpx_quota_granted','gpx_quota_denied') group by event;
   ```

## 5. Rollback (si besoin)

Chaque objet créé peut être retiré :
```sql
-- quota GPX
drop trigger if exists trg_race_calendar_gpx_quota on public.race_calendar;
drop function if exists public.race_calendar_enforce_gpx_quota();
drop function if exists public.effective_plan_tier(uuid);
-- (la policy renfo_focus_log revient à l'état antérieur en réappliquant l'ancienne définition sans WITH CHECK)
```

## Critère de sortie (Phase 1)

- [ ] Les 2 migrations sont en production (§3.1, §3.2, §3.3 tous OK).
- [ ] Le quota GPX ne peut pas être contourné par un appel direct (§4).
- [ ] Les advisors sont propres (§3.4).
- [ ] La procédure a été rejouée par une 2ᵉ personne.
- [ ] (Réglage manuel Dashboard, hors SQL) protection « mots de passe compromis » —
      **NB : fonctionnalité payante Supabase, hors périmètre gratuit → reportée.**
