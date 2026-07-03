# Migration Cloudflare Pages — pour les OG dynamiques sur /s/:token

> **Pourquoi** : les crawlers (WhatsApp, Facebook, Discord…) n'exécutent pas le
> JavaScript. Pour qu'une stratégie partagée affiche « Stratégie de Tony — CCC
> 2026 · objectif 14h30 » + l'image du profil d'élévation dans les previews, il
> faut un serveur qui génère les balises `<meta>` par token. GitHub Pages ne
> sert que des fichiers statiques ; **Cloudflare Pages + Workers** (gratuit à
> notre échelle) fait exactement ça. Réf. audit §2.2.

## Phase A — Mise en place à iso-fonctionnalités (SANS toucher au domaine)

Le repo est prêt : `scripts/pages-postbuild.mjs` porte la logique de
publication partagée (routes publiques + canonicals). GitHub Pages reste le
hosting actif tant que la phase C n'est pas faite.

### Ce que Tony fait (~10 min, une fois)

1. Crée un compte sur **https://dash.cloudflare.com/sign-up** (gratuit).
2. Dans le dashboard : **Workers & Pages** → **Create** → onglet **Pages** →
   **Connect to Git** → autorise l'app GitHub Cloudflare Pages sur le repo
   `tounydata/Vorcelab` (tu peux limiter l'accès à ce seul repo).
3. Configuration du build :
   - **Production branch** : `main`
   - **Build command** : `npm run build && node scripts/pages-postbuild.mjs --cloudflare`
   - **Build output directory** : `dist`
   - **Variables d'environnement** (Settings → Environment variables, en
     production ET preview) — reprendre celles de `deploy-pages.yml` :
     - `VITE_MAPTILER_KEY` = (la valeur du secret GitHub homonyme)
     - `VITE_STRIPE_MONTHLY_URL` = `https://buy.stripe.com/5kQ5kv9kS6wg35h6XC4ko00`
     - `VITE_STRIPE_ANNUAL_URL` = `https://buy.stripe.com/00w9ALeFcf2McFRgyc4ko01`
     - `VITE_SENTRY_DSN` = (la DSN Sentry, cf. docs/sentry-setup.md)
4. **Save and Deploy** → Cloudflare builde et publie sur
   `https://<projet>.pages.dev`.

### Validation (Claude, sur l'URL *.pages.dev)

- [ ] Landing, /login/, /demo/, pages légales → 200, canonicals corrects
- [ ] Route SPA profonde (ex. /activities) → 200 avec l'app (fallback natif)
- [ ] /s/:token → app + appel Supabase OK
- [ ] Redirection hash `#/…` → chemins
- [ ] sitemap.xml, robots.txt, manifest PWA, service worker
- [ ] Auth Supabase depuis le domaine de preview (ajouter
      `https://*.pages.dev/**` aux Redirect URLs Supabase le temps des tests)

## Phase B — Worker OG dynamiques (le but de la manœuvre)

Une Pages Function `functions/s/[token].ts` intercepte `GET /s/:token` :
- User-Agent crawler (facebookexternalhit, WhatsApp, Twitterbot, Discordbot…)
  → fetch du RPC public `get_shared_race` (anon, RLS déjà en place) → HTML
  avec `og:title` (« Stratégie de {athlète} — {course} »), `og:description`
  (distance, D+, objectif), `og:image` dynamique.
- Navigateur normal → `next()` (l'app SPA, comportement inchangé).
- `og:image` : une seconde Function dessine la carte de partage (profil
  d'élévation SVG → PNG via resvg-wasm) — données du même RPC, cache 24 h
  (Cache API), ~1200×630.

## Phase C — Bascule du domaine (après validation A + B)

1. Cloudflare → projet Pages → **Custom domains** → ajouter `vorcelab.app`.
2. Deux options DNS :
   - **Option simple (recommandée)** : transférer la zone DNS chez Cloudflare
     (Cloudflare affiche 2 nameservers → chez OVH : Web Cloud → Noms de
     domaine → vorcelab.app → Serveurs DNS → remplacer par ceux de
     Cloudflare). Propagation quelques heures ; Cloudflare recopie la zone
     (vérifier l'enregistrement TXT google-site-verification et le MX s'il y en a).
   - Option minimale : rester chez OVH et pointer un CNAME `vorcelab.app` →
     `<projet>.pages.dev` (CNAME flattening non supporté par OVH à l'apex →
     préférer l'option simple).
3. Vérifier https://vorcelab.app (certificat auto), puis laisser GitHub Pages
   en place quelques jours comme filet (rollback = re-pointer les DNS).
4. Après stabilisation : désactiver le workflow `deploy-pages.yml` (ou le
   garder en fallback manuel `workflow_dispatch`).

## Rollback

À tout moment avant la phase C : rien à faire (GitHub Pages inchangé).
Après la phase C : remettre les serveurs DNS OVH d'origine (`ns109.ovh.net` /
`dns109.ovh.net`) — GitHub Pages est toujours actif derrière.
