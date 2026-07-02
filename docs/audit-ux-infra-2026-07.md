# Audit UX · Features · Infra — Vorcelab (2026-07-02)

> Objectif de l'audit : identifier ce qui sépare le dépôt actuel d'une **app commerciale
> viable** ("en vivre") et de la meilleure app de trail running.
> Complète `docs/audit-roadmap.md` (santé du dépôt, 2026-05-30) — ici on regarde
> le **produit** (UX, funnel de conversion) et l'**infra business** (paiement,
> acquisition, monitoring, mobile).
>
> Sévérité : 🔴 bloquant pour monétiser · 🟠 important · 🟡 amélioration · ✅ sain.
> Méthode : lecture du code (web `src/`, `mobile/`, `supabase/`, workflows), pas de
> test manuel en conditions réelles — les points UX "à vérifier en live" sont signalés.

---

## Synthèse

| # | Domaine | Constat clé | Sévérité |
|---|---|---|---|
| 1 | Paiement | Stripe Payment Links sans **webhook de fulfillment** → personne ne devient PRO automatiquement après paiement | 🔴 |
| 2 | Paiement | `VITE_STRIPE_MONTHLY_URL` / `VITE_STRIPE_ANNUAL_URL` **absents du build prod** (`deploy-pages.yml` n'injecte que `VITE_MAPTILER_KEY`) → le CTA PRO retombe sur `mailto:` | 🔴 |
| 3 | Infra DB | **Schema drift** : `user_events`, `update_last_seen()`, `profiles.is_admin`, `profiles.plan_expires_at` utilisés par le code mais **aucune migration** ne les crée | 🔴 |
| 4 | Acquisition | Pas de landing publique, pas de meta description ni Open Graph, HashRouter (`#/…`) → **SEO ≈ zéro**, previews de partage vides | 🔴 |
| 5 | Légal | CGU / politique de confidentialité manquantes (déjà tracké) — **bloquant pour encaisser** (Stripe, RGPD, Strava, App Store) | 🔴 |
| 6 | Mobile | `mobile/` = **~20 000 lignes dupliquées à la main** (moteur coach "porté fidèle à 100%") — chaque fix devra être fait 2×, dérive garantie | 🟠 |
| 7 | Mobile | Abonnement via liens Stripe = **refus quasi certain au review Apple** (IAP obligatoire pour du contenu digital) | 🟠 |
| 8 | Observabilité | Aucun monitoring d'erreurs (web, mobile, Edge Functions) — en prod payante tu es aveugle sur les crashs | 🟠 |
| 9 | Conversion | Le funnel d'upgrade n'est pas instrumenté (pas d'événements `upgrade_modal_open` / `upgrade_cta_click`) alors que `user_events` + admin stats existent | 🟠 |
| 10 | CI | E2E Playwright jamais exécutés en CI · `mobile/` hors CI (aucun tsc/lint) · pas de Dependabot | 🟡 |
| 11 | PWA iOS | Icône SVG uniquement — iOS exige un `apple-touch-icon` PNG → installation A2HS dégradée sur iPhone (le cœur de cible) | 🟡 |

✅ **Points forts confirmés** : moteur métier profond et testé (55 fichiers de tests,
`src/lib` pur et séparé), RLS solide + tokens Strava server-only, CI lint+tests+build
sur PR, PWA au caching bien pensé, freemium déjà câblé (plan_tier, `ProGate`,
`UpgradeModal` avec teaser VDOT — bonne mécanique de conversion), analytics maison
(`user_events` + dashboard admin), onboarding + spotlight tours, partage public de
stratégie (`/s/:token`) + stickers — un vrai levier viral en attente d'être exploité.

---

## 1. Monétisation — le tuyau est posé, l'eau ne coule pas

### 1.1 🔴 Pas de fulfillment automatique

`UpgradeModal.handleCTA()` ouvre un Stripe Payment Link dans un nouvel onglet.
Ensuite : rien. Aucune Edge Function `stripe-webhook` dans `supabase/functions/`,
et la migration `profiles_plan_tier.sql` dit elle-même :
*« mise à jour réservée à un futur webhook de paiement »*.

Conséquence : un client paie → il revient dans l'app → il est toujours `free` →
frustration immédiate, remboursement probable. À l'inverse, une annulation
d'abonnement ne repasse jamais le compte en `free`.

**Action (la priorité n°1 du repo)** — Edge Function `stripe-webhook` :
- `checkout.session.completed` → `plan_tier='pro'`, `plan_expires_at` (période + marge),
  mapping client via `client_reference_id` (passer l'`user_id` dans l'URL du Payment Link :
  `?client_reference_id={userId}`) ;
- `invoice.paid` → prolonger `plan_expires_at` ;
- `customer.subscription.deleted` / `invoice.payment_failed` → retour `free` ;
- vérification de la signature `stripe-signature` (secret webhook en env server-only) ;
- page/état de retour post-checkout (`?upgraded=1` → toast "Bienvenue en PRO" + invalidation
  du cache React Query `plan-tier`) ;
- lien vers le **Customer Portal** Stripe dans Réglages (gérer/annuler l'abonnement —
  exigence Stripe et anti-churn).

### 1.2 🔴 Les URLs Stripe ne sont pas dans le build de prod

`deploy-pages.yml` ne passe que `VITE_MAPTILER_KEY` à `npm run build`. Les deux
`VITE_STRIPE_*_URL` sont donc vides en prod et le CTA retombe sur
`mailto:hello@vorcelab.com`. Quick win : ajouter les deux secrets au workflow
(et les documenter dans `.env.example`, où ils sont absents).

### 1.3 🟠 Funnel non mesuré

`useTrackEvent` n'est branché que sur 3 pages (stratégie, ajout course, coach).
La boucle de conversion elle-même n'émet rien. Ajouter :
`progate_view` (feature en meta), `upgrade_modal_open` (source), `upgrade_cta_click`
(billing mensuel/annuel), `upgrade_success`. Le dashboard admin (funnel) existe déjà —
il suffit de l'alimenter. Sans ça, impossible d'itérer sur le pricing/gating.

### 1.4 🟡 Gating actuel — cohérent, à surveiller en live

1 stratégie GPX gratuite + 2 semaines de plan coach + teaser VDOT chiffré
(« le coach te ferait gagner X min sur ta course ») : c'est une vraie mécanique de
valeur-avant-paywall. Deux points à valider avec les données une fois le funnel
instrumenté : (a) la stratégie GPX gratuite est l'aha-moment — vérifier que
l'onboarding y amène en < 5 min ; (b) le plan coach gaté à 2 semaines doit laisser
le temps de créer l'habitude (2 semaines ≈ 4-6 séances, probablement bien).

---

## 2. Acquisition & partage — le produit est invisible

### 2.1 🔴 SEO / social : quasi rien

- `index.html` : pas de `<meta name="description">`, pas d'Open Graph ni Twitter Card
  (`og.svg` existe à la racine mais n'est référencé nulle part), pas de canonical.
- **HashRouter** : toutes les URLs sont `vorcelab.app/#/…` → une seule page indexable.
  Le fallback SPA (`404.html`) est déjà déployé sur Pages : le passage à
  **BrowserRouter** est possible dès aujourd'hui (attention aux liens de partage
  `#/s/:token` déjà distribués → garder une redirection hash→path au boot).
- La racine du domaine = écran de login. Aucun endroit où un coureur qui ne connaît
  pas l'app comprend ce qu'elle fait. `/demo` (DemoStrategyPage) existe mais rien
  n'y mène depuis l'extérieur.

**Action** : une landing publique (proposition de valeur, screenshots, pricing,
CTA "essayer la démo" → `/demo`, CTA signup), meta OG par défaut + par grande page,
BrowserRouter, sitemap. C'est le chantier n°1 côté croissance — sans acquisition,
le reste ne compte pas.

### 2.2 🟠 Le partage de stratégie ne peut pas devenir viral en l'état

`/s/:shareToken` + `ShareStickers` sont le meilleur levier organique du produit
(un coureur partage sa stratégie UTMB → ses amis voient l'app). Mais :
- en HashRouter, les crawlers des réseaux sociaux ne voient jamais le token →
  **preview générique impossible à personnaliser** (pas de « Stratégie de Tony —
  CCC 2026, objectif 14h30 » avec image de profil d'élévation) ;
- GitHub Pages ne peut pas servir de meta par URL. Pour des OG dynamiques sur les
  pages de partage il faut un edge runtime (Cloudflare Pages/Workers est la
  migration naturelle : même modèle statique + workers pour `/s/*`, previews de PR
  en bonus).

À court terme (sans migration) : BrowserRouter + OG statiques soignés. À moyen
terme : OG dynamiques par stratégie partagée + image générée (le profil d'élévation
en carte de partage — les stickers existent déjà, il faut les servir aux crawlers).

---

## 3. Infra — solide pour un side project, des trous pour un business

### 3.1 🔴 Schema drift Supabase

Le code de prod dépend d'objets DB **absents des migrations** :
- table `user_events` (App.tsx, `useTrackEvent`, admin feed) ;
- RPC `update_last_seen()` ;
- colonnes `profiles.is_admin`, `profiles.plan_expires_at` (`usePlanTier`).

La base de prod a été modifiée hors migrations (dashboard/MCP). Conséquences :
environnement de dev/staging non reproductible, restore risqué, onboarding d'un
contributeur impossible. **Action** : `supabase db diff` contre la prod →
committer les migrations de rattrapage, puis se tenir à la règle "toute modif
passe par une migration".

### 3.2 🟠 Zéro monitoring d'erreurs

Aucun Sentry (ou équivalent) sur le web, l'app Expo ou les Edge Functions.
Premier utilisateur payant = obligation de savoir quand ça casse. Sentry free tier
couvre les trois (React, React Native, Deno). Brancher aussi les logs des
Edge Functions Strava (webhook silencieusement cassé = données qui ne rentrent plus).

### 3.3 🟡 CI/CD

- ✅ `ci.yml` (lint + vitest + build) sur PR — bien.
- Les E2E Playwright existent mais **ne tournent jamais en CI**. Ajouter au minimum
  le projet `react` (smoke, sans auth) sur PR.
- `mobile/` est **totalement hors CI** : pas même un `tsc --noEmit`. Un commit peut
  casser l'app mobile sans qu'aucun signal n'existe.
- Pas de Dependabot/Renovate (Supabase JS, Expo et Stripe bougent vite).
- GitHub Pages : pas de previews de PR ni de rollback simple. Acceptable aujourd'hui ;
  la migration Cloudflare Pages (cf. §2.2) réglerait partage + previews d'un coup.

### 3.4 🟡 PWA sur iOS — le cœur de cible est le moins bien servi

Les traileurs sont massivement sur iPhone. Or :
- manifest : une seule icône **SVG** — iOS ne la prend pas ; pas d'`apple-touch-icon`
  PNG dans `index.html` → icône d'install moche/absente sur iPhone ;
- pas de `screenshots` dans le manifest (install prompt riche Android) ;
- à vérifier en live : comportement du retour OAuth Strava en PWA standalone iOS
  (`window.open`/redirects sont capricieux en standalone).

Quick win : générer les PNG (180/192/512 + maskable) et les référencer.

---

## 4. Mobile — la décision structurante à prendre maintenant

### 4.1 🟠 ~20 000 lignes dupliquées

`mobile/src` réimplémente à la main les écrans **et le moteur** ("Coach porté en
FULL, fidèle à 100%", "Réglages LABO complet"…). Aucun import partagé avec `src/`.
Le moteur coach évolue chaque semaine (cf. historique des commits) : chaque
amélioration devra être portée deux fois, et les deux copies **divergeront** —
un utilisateur verra un plan différent sur web et mobile, mortel pour la confiance
dans un produit de coaching.

**Action** : extraire la logique pure (`src/lib`, déjà sans dépendance UI — c'est
la grande force de l'architecture actuelle) dans un package workspace
`@vorcelab/core` consommé par le web ET Expo. Les tests Vitest suivent le package.
C'est le refactor au meilleur ROI du repo : il rend le mobile viable.

### 4.2 🟠 Apple IAP

Un abonnement vendu dans l'app iOS **doit** passer par l'In-App Purchase — des
liens Stripe pour du contenu digital sont un motif de rejet standard (guideline 3.1.1).
Prévoir **RevenueCat** (gère StoreKit + webhooks + un seul état d'abonnement) et
faire converger IAP et Stripe web vers la même source de vérité
(`profiles.plan_tier` / `plan_expires_at`). À anticiper *avant* de soumettre —
ça influence la conception du webhook Stripe (§1.1).

---

## 5. UX produit — bons fondamentaux, à valider en conditions réelles

Constats depuis le code (audit UX Login/Dashboard/Activités/Onboarding #414 déjà
passé — bien) :

- ✅ Auth complète : mot de passe, magic link, reset, Strava OAuth.
- ✅ Onboarding + `SpotlightTour` par écran ; dashboard réorganisable ; "séance du
  jour" en CTA — la boucle d'engagement quotidienne existe.
- 🟡 **Time-to-value à mesurer** : le moment magique (stratégie GPX ou verdict de
  séance) doit arriver dans les 5 premières minutes après signup. Avec
  `user_events`, mesurer `signup → première stratégie / premier plan` et optimiser
  ce chemin avant tout le reste de l'UX.
- 🟡 Styles inline massifs (`style={{…}}`) en parallèle d'un `style.css` de 52 Ko :
  pas bloquant, mais la cohérence visuelle reposera de plus en plus sur la
  discipline. Consolider progressivement en classes/tokens (`--vl-*` déjà en place).
- 🟡 Accessibilité non auditée (contrastes du thème sombre, focus visible, tailles
  de zones tactiles en trail = gants/pluie). À passer une fois, puis en continu.
- 🟡 Le mode hors-ligne (PWA) est pensé pour le cache, mais un traileur en course
  est **sans réseau** : vérifier en avion/airplane-mode que la stratégie de course
  (l'écran utilisé le jour J !) est 100 % consultable offline — c'est un
  différenciateur majeur face à la concurrence.

---

## Roadmap recommandée

### Phase A — Encaisser proprement (≈ 1-2 semaines) 🔴
1. Edge Function `stripe-webhook` + fulfillment auto + retour post-checkout + Customer Portal (§1.1)
2. Secrets `VITE_STRIPE_*_URL` dans `deploy-pages.yml` + `.env.example` (§1.2)
3. CGU + politique de confidentialité + mentions légales + branding "Powered by Strava" (§ légal)
4. Migrations de rattrapage `user_events` / `update_last_seen` / `is_admin` / `plan_expires_at` (§3.1)
5. Instrumenter le funnel d'upgrade (§1.3)

### Phase B — Être trouvé et partagé (≈ 2-4 semaines) 🔴→🟠
6. Landing publique + meta description/OG + BrowserRouter (+ redirection hash) + sitemap (§2.1)
7. Sentry web + Edge Functions (§3.2) · E2E smoke en CI · Dependabot (§3.3)
8. Icônes PNG/apple-touch + screenshots manifest (§3.4)
9. Mesurer time-to-value et optimiser signup → aha-moment (§5)

### Phase C — Mobile & échelle 🟠
10. Extraire `@vorcelab/core` partagé web/mobile + mobile dans la CI (§4.1)
11. RevenueCat / IAP avant soumission App Store (§4.2)
12. OG dynamiques sur `/s/:token` (migration Cloudflare Pages) — le levier viral (§2.2)
13. Vérifier le mode offline course + audit accessibilité (§5)

> Fil conducteur : **A** fait que l'argent rentre tout seul, **B** fait que des
> coureurs arrivent, **C** fait que ça scale sur iPhone sans doubler le coût de dev.
> Le moteur (la vraie différenciation, pilotée par `docs/coach/backlog.md`) continue
> en parallèle — cet audit ne touche pas à sa roadmap.
