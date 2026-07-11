# Audit sécurité — Phase 1 (P0) — 2026-07-10

Audit vérifié **dans le code réel** (migrations, RLS, Edge Functions, web, mobile),
sans se fier aux anciens fichiers d'audit. Chaque correction est protégée par un
test exécuté.

## 1. Vulnérabilités identifiées et corrigées

| # | Sévérité | Fichier / objet | Cause | Scénario d'exploitation | Correction | Test | Statut |
|---|----------|-----------------|-------|-------------------------|------------|------|--------|
| V1 | **Critique** | `profiles` policy `p_update_own` (`20260506000000`) | RLS sans contrôle colonne : `with check (auth.uid() = id)` couvre toute la ligne | `supabase.from('profiles').update({ is_admin:true, plan_tier:'pro', plan_expires_at:'2099-…' })` → escalade admin + PRO gratuit | Trigger `profiles_reject_sensitive_writes` (`20260710000000`) bloque l'écriture client des colonnes sensibles | `rls_profiles_admin.sql` tests 1-6 (+ démo vuln) | ✅ Corrigé |
| V2 | **Critique** | RPC `admin_*` (`20260702100000`) | `CREATE FUNCTION` accorde `EXECUTE` à `PUBLIC` par défaut ; jamais révoqué | `anon`/utilisateur standard peut invoquer `admin_grant_pro`, `admin_get_users`, etc. (seule la vérif interne `is_admin` protégeait, elle-même contournable via V1) | `REVOKE EXECUTE … FROM anon, public` + `GRANT … TO authenticated` (`20260710000000`) | tests 8-9 | ✅ Corrigé |
| V3 | Élevée | `admin_get_kpis`, `admin_get_signups_daily`, `admin_get_sessions_daily`, `admin_get_event_breakdown`, `admin_get_funnel`, `admin_get_weekly_retention`, `admin_get_activity_feed`, `admin_get_user_activity`, `admin_get_users_activity_summary`, `update_last_seen` | `SECURITY DEFINER` sans `SET search_path` | Injection de `search_path` → résolution d'objets non intentionnels avec les droits du définisseur | `ALTER FUNCTION … SET search_path = public` (`20260710000000`) | migration rejouée par le harnais | ✅ Corrigé |
| V4 | **Critique** | `vite.config.ts` (Workbox `runtimeCaching`) | `NetworkFirst` cache 24 h de **toutes** les réponses `*.supabase.co` (REST/Auth authentifiées) | Sur un appareil partagé : données du compte A servies au compte B après déconnexion ; données périmées hors ligne | Suppression de la règle Supabase + `cleanupOutdatedCaches` + purge `supabase-api` au démarrage (`purgeDangerousCaches`) + déconnexion nettoyante (`signOutAndClear`) | `tests/sessionCache.test.ts` | ✅ Corrigé |
| V5 | Élevée | `mobile/src/lib/supabase.ts` | Tokens stockés dans **AsyncStorage (clair)** ; commentaire prétendant à tort « stockage chiffré » | Extraction des tokens sur appareil rooté / sauvegarde non chiffrée | Adaptateur `expo-secure-store` (Keychain/Keystore) avec fragmentage, migration depuis AsyncStorage, gestion d'erreurs sans fuite de token ; commentaire corrigé | `tests/secureStorage.test.ts` (10 cas) | ✅ Corrigé |
| V6 | Moyenne | `mobile/LICENSE` | Licence **MIT d'Expo** laissée par `create-expo-app` → ambiguïté : le projet paraît réutilisable | Un tiers réutilise le moteur propriétaire en invoquant une licence MIT | Remplacée par notice propriétaire + `LICENSE` racine « Tous droits réservés » | Revue | ✅ Corrigé |

## 2. Points vérifiés — aucun problème

- **Secrets dans le dépôt** : seuls des JWT `role:anon` (publics par conception,
  protégés par la RLS) sont embarqués. Aucun `service_role`, `sk_live/sk_test`,
  `whsec_`, secret Strava/Anthropic ni clé privée dans le working tree.
- **Historique git** (`git rev-list --all`) : aucun secret réel committé puis
  retiré ; les seules occurrences sont des **formats** cités en documentation.
  Aucun fichier `.env` (hors `.example`) n'a jamais été suivi.
- `.gitignore` couvre `.env`, `.env.test`, `playwright/.auth/*.json`, `*.zip`.

## 3. Migrations ajoutées

### `20260710000000_secure_profiles_and_admin.sql`

- **Idempotente** : `create or replace`, `drop … if exists`, boucles gardées par
  `to_regprocedure(...) is not null`. Réexécutable sans effet de bord ; sans effet
  destructeur sur la prod (ajoute un trigger, fige des `search_path`, ajuste des
  GRANT).
- **Ordre** : après `20260702110000` (dernière migration Stripe/plan). Aucun
  prérequis de données.
- **Rollback** : `drop trigger trg_profiles_reject_sensitive_writes on public.profiles;`
  `drop function public.profiles_reject_sensitive_writes();` puis
  `grant execute on function public.admin_* to public;` (déconseillé — réouvre les
  vulnérabilités). Les `ALTER FUNCTION … SET search_path` se défont avec
  `RESET`. Aucune donnée modifiée, donc rollback sans perte.

## 4. Tests exécutés

```
scripts/test-rls.sh                     # 10 assertions SQL (PostgreSQL local)
npm run test                            # 62 fichiers, 609 tests (dont cache + SecureStore)
```

Résultats : voir le résumé de session. La démonstration de la vulnérabilité V1
avant correction est émise en `WARNING` par le harnais SQL, puis les 10 assertions
prouvent le blocage après application de la migration.

## 5. Opérations MANUELLES restantes (hors périmètre du code)

Ces actions nécessitent un accès aux dashboards / comptes externes et **ne peuvent
pas** être réalisées depuis le dépôt. Elles sont **obligatoires avant toute
ouverture commerciale** :

### GitHub
- [ ] **Passer le dépôt principal `tounydata/vorcelab` en PRIVÉ.** Le code
      propriétaire (moteurs, formules, migrations, Edge Functions, logique de
      paiement) est actuellement exposé publiquement. Le code ne peut pas modifier
      la visibilité — action manuelle dans *Settings → Danger Zone → Change
      visibility*.
- [ ] Vérifier/retirer un éventuel dépôt secondaire `aplication-vorcelab`
      (référencé dans les consignes) — le supprimer ou l'archiver s'il duplique le
      code, pour éviter la confusion.
- [ ] Protéger `main` : PR obligatoire, CI verte requise, review obligatoire sur
      sécurité/migrations, pas de push direct, squash merge (voir Phase 3 CI).

### Supabase
- [x] **Migration `20260710000000` appliquée en prod** (projet `runnerdata` /
      `wanzrkdgqmcctwvnbmuv`) le 2026-07-11 via l'outil Supabase, + suivi
      `20260710010000` (voir addendum ci-dessous). Vérifié en base : trigger
      présent, attaque `is_admin`/`plan_tier` rejetée en rôle `authenticated`
      simulé, `anon` privé des RPC admin, advisors propres.
- [ ] Activer *Leaked password protection* (réglage Auth, non scriptable en SQL).
- [ ] Confirmer que la clé `service_role` n'a **jamais** été exposée côté client
      ni dans un build ; sinon la **faire tourner**.

### Rotation de secrets (par précaution, si doute sur une exposition passée)
- [ ] Ne concerne PAS la clé anon (publique). À évaluer uniquement pour
      `service_role`, `STRIPE_WEBHOOK_SECRET`, `STRAVA_CLIENT_SECRET`,
      `ANTHROPIC_API_KEY`, `VITE_MAPTILER_KEY` si l'un a pu fuiter hors dépôt.

### Mobile
- [ ] Lancer `npx expo install expo-secure-store` dans `mobile/` pour verrouiller
      la version exacte compatible SDK 54 (la dépendance a été ajoutée au
      `package.json` mais l'install/lock doit être faite dans l'environnement de
      build mobile).

> ⚠️ Les actions non cochées ci-dessus restent **à faire manuellement** et ne sont
> pas supposées actives.

---

## Addendum 2026-07-11 — Application en production + durcissement de suivi

Le connecteur Supabase (projet `runnerdata` / `wanzrkdgqmcctwvnbmuv`, Postgres 17,
ACTIVE) a permis de vérifier l'état réel et d'appliquer la correction :

**État avant (vérifié en prod)**
- Policy unique `"Users see own profile"` `FOR ALL USING ((select auth.uid()) = id)`
  **sans `WITH CHECK`** → Postgres réutilise le `USING` comme check → un client
  pouvait écrire toute sa ligne, y compris les 5 colonnes sensibles. (Le nom de
  policy diffère du dépôt : **drift de schéma** — les migrations du repo ont été
  appliquées en prod sous d'autres timestamps.)
- Les 13 fonctions `admin_*` étaient exécutables par `anon` (ACL `anon=X`), 10
  sans `search_path`.

**Appliqué**
1. `secure_profiles_and_admin` (= `20260710000000`) — trigger garde-fou +
   durcissement admin.
2. `secure_hardening_followup` (= `20260710010000`) — `search_path` sur la
   fonction trigger + retrait du `GRANT PUBLIC` résiduel sur `update_last_seen`.

**Vérifié après**
- Simulation en rôle `authenticated` réel : `update is_admin=true` et
  `update plan_tier='pro'` → **rejetés** (`insufficient_privilege`) ; écriture
  légitime → OK ; `anon` → `admin_get_kpis()` **refusé**.
- Advisors sécurité : plus aucun avertissement actionnable. Restent des WARN
  **intentionnels et documentés** :
  - `get_shared_race` exécutable par `anon` → page de partage publique par token.
  - `admin_*`, `update_last_seen`, `get_shared_race` exécutables par
    `authenticated` → volontaire (contrôle `is_admin`/périmètre en interne).
  - `strava_tokens`, `strava_webhook_events` : RLS active sans policy → deny-all
    voulu (accès service-role uniquement).
  - `auth_leaked_password_protection` → à activer dans le dashboard Auth.

**Note drift** : parce que les migrations du repo ont des timestamps différents de
la prod, un `supabase db pull`/rebaseline de l'historique de migrations est
recommandé (voir roadmap) pour garantir qu'un environnement vierge est recréable
**uniquement** depuis le dépôt.

## Chaîne d'approvisionnement (ajouté)

- `.github/dependabot.yml` : npm racine, npm mobile (bumps majeurs Expo/RN
  ignorés — à faire via `npx expo install`), GitHub Actions, regroupés.
- CI job `supply-chain` : `scripts/scan-secrets.sh` (bloquant, distingue clés anon
  publiques / secrets serveur) + `npm audit` web & mobile (informatif).

