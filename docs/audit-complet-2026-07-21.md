# Audit complet Vorcelab — 21 juillet 2026

Objectif fixé : **publication sur l'App Store d'ici ~2 mois** (mi-septembre 2026) et
un **moteur de projection trail de référence mondiale**. Audit mené sur le dépôt
(branche `main`, commit `d6feebc`), la base Supabase de production (`runnerdata`)
et le compte Stripe live (Vorcelab).

## 1. Verdict global

| Domaine | État | Note |
| --- | --- | --- |
| Code, tests, CI | 944 tests verts (105 fichiers), build + lint OK, CI verte | ★★★★★ |
| Moteur / algo | Banc anti-fuite, MAPE réel 9,7 %, couverture IC 91 %, versionné, explicable | ★★★★☆ |
| Sécurité Supabase | RLS partout, RPC admin durcis, webhooks signés — quelques réglages restants | ★★★★☆ |
| Paiements Stripe | Live et fonctionnel (1 abonnement réel encaissé) ; idempotence non câblée | ★★★☆☆ |
| App Store readiness | Fondations là (Expo, EAS, delete-account) mais 4 bloquants ouverts | ★★☆☆☆ |
| Dette technique | Duplication web/mobile non gardée, 30 Mo de binaires, drift migrations | ★★★☆☆ |

**Conclusion : le go App Store en 2 mois est réaliste.** Le socle (code, sécurité,
moteur) est nettement au-dessus de la moyenne d'un projet solo. Le chemin critique
n'est pas le code : c'est la **décision monétisation iOS (IAP)**, le **Sign in with
Apple**, et la **conformité confidentialité** (fiche App Privacy + Info.plist).

## 2. Preuves collectées

- `npm test` : **944/944 verts** en 8 s ; `npm run build` (tsc + vite) et `npm run lint` : OK.
- Supabase prod : 22 tables, **RLS activé sur 100 %** ; 14 Edge Functions actives ;
  advisors sécurité = 0 erreur (2 familles de WARN, voir §3) ; Postgres 17.
- Stripe live : 2 prix actifs (PRO 5 €/mois, 50 €/an), **1 abonnement réel actif**
  (encaissement → grant PRO → résiliation planifiée : la chaîne complète a tourné en prod).
- Moteur : banc réel (`npm run backtest:real`, workflow `engine-backtest.yml`) —
  **MAPE 9,7 %**, biais −1,4 %, **couverture des intervalles 91 %** (route 100 %,
  trail 89 %) après calibration ; cross-validation par folds ; snapshots prospectifs
  (`projection_validation_snapshots`) en place.

## 3. Sécurité — constats

### Solide (vérifié)

- **RPC admin** (`admin_get_users`, `admin_grant_pro`, …) : vérifient tous
  `is_admin` via `auth.uid()` en interne — les WARN advisors « executable by
  authenticated » sont du bruit (un non-admin reçoit `forbidden`).
- **Webhook Stripe** : signature HMAC-SHA256 vérifiée, tolérance 5 min,
  multi-`v1` (rotation de secret) gérée.
- **Webhook Strava** : verify token à l'abonnement ; tokens Strava jamais renvoyés
  au client (server-only, conforme au README).
- **Partage de course** : `share_token = crypto.randomUUID()` (122 bits), policy
  d'énumération supprimée (migration `20260523`), RPC `get_shared_race` n'expose ni
  `user_id` ni le token. Sain.
- **`ai-analysis`** : tombstone HTTP 410 — cohérent avec l'interdiction Strava
  d'envoyer des données à un fournisseur d'IA.
- **RGPD / Apple 5.1.1(v)** : `delete-account` (CASCADE vérifié, 16 tables → 0 résidu)
  + bouton in-app mobile (`DeleteAccount.tsx`). Exigence Apple déjà couverte.

### À corriger

| # | Constat | Gravité | Effort |
| --- | --- | --- | --- |
| S1 | **Leaked password protection désactivée** (Supabase Auth → HaveIBeenPwned) | Moyenne | 5 min (dashboard, action manuelle) |
| S2 | **Idempotence Stripe non câblée** : `stripe-webhook` écrit `profiles` en direct ; le ledger `stripe_webhook_events` (0 ligne) et `user_entitlements` ne sont pas branchés. Un replay dans la fenêtre de 5 min re-crédite. C'est le lot « 2C » de la roadmap — à faire **avant** l'ouverture large des paiements | Moyenne | 1–2 j (logique `stripeEntitlement.ts` déjà testée) |
| S3 | **Perf RLS** : ~15 policies avec `auth.uid()` non wrappé en `(select auth.uid())` (re-évalué par ligne), **doubles policies permissives** sur les 4 tables `renfo_*`, **index dupliqué** sur `renfo_exercise_log` | Faible aujourd'hui, réelle à l'échelle | ½ j (une migration corrective) |
| S4 | Comparaison de signature webhook via `Array.includes` (non constant-time) | Très faible | 30 min |
| S5 | FK non indexées : `plan_grants` (2), `projection_validation_snapshots.race_id`, `race_calendar.result_activity_id` | Faible | inclus dans S3 |

## 4. Paiements Stripe

- **Ça marche en prod** : checkout → webhook → grant PRO → renouvellement
  (`invoice.paid` via `stripe_customer_id`) → expiration douce (grace 3 jours).
- Source de vérité actuelle = `profiles.plan_tier` ; bascule vers
  `user_entitlements` (S2) prévue et souhaitable — d'autant qu'elle est **prérequis
  de l'IAP Apple** (le champ `source` accepte déjà `apple`/`google`).
- Prix centralisés (`src/lib/pricing.ts`), taxonomie d'événements testée. Propre.
- Points d'attention : pas d'essai gratuit configuré (levier de conversion à
  considérer) ; `tax_behavior: unspecified` sur les prix — activer **Stripe Tax**
  avant volume significatif (TVA UE sur services numériques).

## 5. App Store — bloquants et checklist

### B1 — Monétisation iOS (LA décision à prendre cette semaine)

Apple (guideline 3.1.1) impose l'In-App Purchase pour vendre un abonnement numérique
dans l'app. Deux options viables :

1. **RevenueCat + StoreKit 2** (recommandé) : abonnement achetable dans l'app iOS,
   webhook RevenueCat → `user_entitlements` (`source='apple'`). Compter ~2 semaines
   (setup App Store Connect, produits, sandbox, webhook). Commission Apple 15 %
   (Small Business Program, à demander). C'est l'option qui maximise la conversion
   et l'objectif « en vivre un jour ».
2. **Modèle multiplateforme sans achat in-app** (guideline 3.1.3(b)) : l'app iOS ne
   vend rien et n'affiche **aucun lien ni mention d'achat** (c'est déjà le choix
   actuel : la carte ABONNEMENT est volontairement absente du mobile). Publiable
   plus vite, mais conversion quasi nulle depuis l'app.

Chemin pragmatique : soumettre la v1 en option 2 pour tenir les 2 mois, brancher
RevenueCat en v1.1.

### B2 — Sign in with Apple

Câblé mais désactivé (`EXPO_PUBLIC_APPLE_ENABLED`). **Obligatoire à la soumission**
dès qu'un login tiers (Google) est proposé. Passer au bouton natif
`expo-apple-authentication` (déjà identifié comme voie idéale dans le code).

### B3 — `mobile/app.json` incomplet pour iOS

Manquent : `ios.infoPlist` (`ITSAppUsesNonExemptEncryption: false`, et les
`NS*UsageDescription` pour toute permission réellement demandée), `ios.buildNumber`,
et la config des Associated Domains si les liens `vorcelab://` / universels sont
utilisés pour l'OAuth de prod.

### B4 — Confidentialité App Store

- URL publique de **politique de confidentialité** (obligatoire, champ App Store Connect).
- **Fiche App Privacy** : données fitness/santé (activités Strava), identifiants,
  diagnostics (Sentry) — à déclarer honnêtement.
- Expo SDK 54 génère les privacy manifests des SDK ; vérifier au premier build EAS.

### Déjà en place (bon niveau)

Suppression de compte in-app ✅ · icônes/splash ✅ · `eas.json` ✅ ·
expo-updates (OTA) ✅ · SecureStore pour les tokens ✅ · légal versionné ✅ ·
mode sombre natif ✅.

## 6. Moteur — état et plan « meilleur algo trail »

### Ce qui est déjà au-dessus du marché

- **Validation prospective honnête** : banc anti-fuite par construction, profil
  « d'époque » reconstruit, snapshots immuables avant course. Aucun concurrent
  grand public (Strava, COROS, Suunto) ne publie ça.
- **Intervalle de confiance calibré** (91 % de couverture mesurée) — plus utile
  qu'un temps sec.
- Modélisation trail réelle : VAM par buckets de pente, fatigue de montée globale,
  durabilité, descente technique, sinuosité, chaleur, dérive cardiaque.
- Versionnement + explicabilité de chaque projection (`engineVersion`).

### Les vraies limites (et le plan)

1. **Le dataset est le goulot, pas les règles.** Le backtest réel porte sur les
   courses d'un petit nombre d'athlètes (5 comptes en base). Un « algo le plus
   puissant du monde » se prouve sur des centaines de courses multi-athlètes.
   → Ajouter un **opt-in consentement** « mes courses passées alimentent
   anonymement le banc de validation », et automatiser le rapport (le workflow
   manuel existe déjà). Chaque nouvel utilisateur devient un point de validation.
2. **Calibration circulaire** : la couverture 91 % a été calibrée puis mesurée sur
   un échantillon proche. Le doc `engine-validation.md` le reconnaît — maintenir la
   règle « pas d'annonce tant que le hors-échantillon n'est pas stable », et geler
   un jeu de courses de test jamais utilisé pour calibrer.
3. **Généralisation inter-athlètes** : les folds actuels sont intra-athlète.
   Introduire un hold-out **par athlète** dès que N ≥ ~10.
4. Features candidates à fort ROI trail : altitude/hypoxie (>1 500 m), pacing
   intra-course (plan de splits vs réalisé, la donnée existe via streams),
   dégradation nocturne sur ultra.
5. **En faire un argument public** : publier la méthodologie + les métriques
   (MAPE/couverture par terrain) sur le site. La transparence est un avantage
   concurrentiel que les gros ne peuvent pas copier facilement.

## 7. Architecture & dette

| Constat | Détail | Reco |
| --- | --- | --- |
| Duplication web/mobile | `mobile/src/lib` est une copie de `src/lib` (identique aujourd'hui — vérifié par diff sur échantillon) mais **seul runner-core est protégé** par `sync-runner-core` + test. Le reste peut diverger silencieusement | Étendre le pattern sync+test aux libs coach/renfo, ou monorepo (P3 roadmap) — au minimum un test de drift global |
| Binaires dans git | ~30 Mo de `.zip`/`.gif` GymVisual **à la racine** du dépôt (44 Mo trackés, .git 40 Mo) | Déplacer vers Supabase Storage / release assets, retirer du dépôt |
| Drift migrations | Timestamps repo ≠ prod (déjà identifié en roadmap) | `supabase db pull` re-baseline avant tout onboarding d'un 2e dev |
| README obsolète | Annonce Vite 6 / React Router 7 / Leaflet ; le projet est en Vite 8 / RR 8 / maplibre | Mise à jour 10 min |

## 8. Plan 8 semaines vers l'App Store

| Sem. | Livrable |
| --- | --- |
| 1 | **Décision B1 (IAP)** ; actions manuelles : leaked password protection, branch protection `main`, demande Apple Developer Program + Small Business Program ; migration corrective S3/S5 |
| 2 | Lot Stripe 2C (S2) : idempotence + bascule `user_entitlements` (prérequis IAP) |
| 3 | Sign in with Apple natif (B2) + `app.json` iOS complet (B3) ; premier build EAS sur TestFlight |
| 4 | Politique de confidentialité publiée + fiche App Privacy (B4) ; purge binaires du dépôt |
| 5–6 | Bêta TestFlight (10–20 coureurs) ; corrections ; si option RevenueCat : intégration + sandbox |
| 7 | Gel : screenshots, description ASO (FR/EN), vidéo preview, review notes (compte démo) |
| 8 | Soumission App Review ; buffer pour un rejet (compter 1 aller-retour) |

En parallèle (fil continu) : opt-in consentement backtest + rapport mensuel
automatique du banc — c'est l'investissement qui construit « l'algo le plus
puissant » pendant que l'app se publie.
