# ADR-002 — Séparation des domaines de sécurité : profil, entitlements, rôles

**Status:** Accepted (Phase 1 appliquée · Phase 2 planifiée)
**Date:** 2026-07-10
**Authors:** Audit sécurité commercial (Phase 1 — P0)

---

## Contexte

La table `public.profiles` est éditable par son propriétaire via la policy RLS
`p_update_own` :

```sql
using (auth.uid() = id) with check (auth.uid() = id)
```

La RLS Postgres n'offre **aucun contrôle au niveau colonne**. Or cette même ligne
contient des colonnes à valeur commerciale/administrative :

- `plan_tier`, `plan_expires_at`, `plan_note` — entitlement PRO
- `stripe_customer_id` — lien de facturation
- `is_admin` — privilège d'administration

Conséquence (vérifiée et reproduite par un test SQL, voir
`supabase/tests/rls_profiles_admin.sql`) : **un utilisateur authentifié pouvait
écrire n'importe laquelle de ces colonnes sur sa propre ligne** via l'API PostgREST
(`update({ is_admin: true, plan_tier: 'pro', plan_expires_at: '2099-…' })`).
Escalade de privilèges + auto-attribution PRO + accès aux RPC admin (dont plusieurs
étaient de surcroît exécutables par `anon`/`public`).

## Décision

### Phase 1 — Verrouillage immédiat (appliqué)

Migration `20260710000000_secure_profiles_and_admin.sql`, idempotente :

1. **Trigger `profiles_reject_sensitive_writes` (BEFORE INSERT/UPDATE, SECURITY
   INVOKER).** Il rejette toute écriture des colonnes sensibles quand
   `current_user ∈ {authenticated, anon}` (rôles clients de PostgREST). Les
   écritures serveur restent autorisées :
   - `service_role` (webhook Stripe) → `current_user = service_role`
   - fonctions `SECURITY DEFINER` (RPC admin, `handle_new_user`) → `current_user`
     = propriétaire de la fonction.
   Les écritures **légitimes** du profil (`name`, `weight`, `fc_max`,
   `runner_profile`, `dashboard_layout`, `onboarding_done`, …) ne sont pas
   touchées : le trigger ne bloque que si une colonne sensible **change**.

2. **Durcissement des fonctions admin `SECURITY DEFINER`** : `search_path`
   figé à `public`, `EXECUTE` retiré à `anon`/`public`, accordé au seul
   `authenticated` (la vérification interne `is_admin` demeure).

Ce choix (trigger plutôt que refonte immédiate) permet de neutraliser la
vulnérabilité **sans casser** les lecteurs actuels (`usePlanTier`, dashboard
admin, webhook) et sans migration de données risquée.

### Phase 2 — Séparation des domaines (planifiée, non encore appliquée)

Cible : sortir l'entitlement et le rôle de la table éditable.

- **`user_entitlements`** (source de vérité commerciale) : `user_id`, `plan_tier`,
  `status`, `source`, `stripe_customer_id`, `stripe_subscription_id`,
  `stripe_price_id`, `current_period_end`, `cancel_at_period_end`, timestamps.
  RLS : lecture propre autorisée ; **aucune** écriture client (service role /
  fonction serveur uniquement) ; contraintes sur statuts et niveaux.
- **`user_roles`** (`user_id`, `role`) **ou** `app_metadata` Supabase : aucune
  écriture client ; vérification serveur systématique ; ne plus utiliser un champ
  de `profiles` pour autoriser l'administration.

Jusqu'à la Phase 2, `is_admin`/`plan_tier` restent dans `profiles` mais sont
**inaccessibles en écriture au client** grâce au trigger ci-dessus, ce qui ferme
la vulnérabilité tout en laissant le temps de migrer les lecteurs proprement.

## Conséquences

- ✅ Un utilisateur standard ne peut plus modifier `plan_tier`, `plan_expires_at`,
  `plan_note`, `stripe_customer_id`, `is_admin`, ni son rôle.
- ✅ Les RPC admin ne sont plus atteignables par `anon`.
- ✅ Écritures serveur (webhook) et RPC admin légitimes préservées (tests de
  non-régression 7 et 10 du harnais SQL).
- ⚠️ La confiance dans `is_admin`/`plan_tier` de `profiles` reste correcte tant que
  le trigger est en place ; la Phase 2 supprimera cette dépendance structurelle.

## Vérification

`scripts/test-rls.sh` — 10 assertions sur PostgreSQL local, dont la démonstration
de la vulnérabilité **avant** correction puis son blocage **après**.
