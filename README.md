# Vorcelab

> Le laboratoire du coureur — application PWA de coaching **trail / running**.

Vorcelab relie la préparation physique, la charge d'entraînement, la stratégie de
course et l'exécution le jour J : profil du coureur par gradient (VAM, FC, dérive),
suivi de charge (PMC / ACWR), renforcement musculaire co-périodisé, stratégie de
course sur GPX, nutrition, météo, et un coach algorithmique qui construit le plan
vers une course cible.

## Stack

- **Frontend** : React 19 + TypeScript + Vite 6 (PWA via `vite-plugin-pwa`)
- **État / data** : Zustand (session) + TanStack Query (cache serveur)
- **Routing** : React Router 7 (`HashRouter`)
- **Backend** : Supabase — Auth, Postgres (RLS), Edge Functions
- **Cartographie** : Leaflet
- **Tests** : Vitest (unitaire) + Playwright (e2e)

Le frontend de production est l'app React (`index.html` → `src/main.tsx`).
`legacy.html` + les `.js` à la racine sont l'ancien monolithe, conservé comme
backup le temps de finir la migration (voir « Migration » plus bas).

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner les valeurs (voir .env.example)
npm run dev            # serveur de dev Vite
```

### Scripts

| Commande            | Rôle                                             |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Serveur de développement Vite                    |
| `npm run build`     | Typecheck (`tsc -b`) + build de production Vite  |
| `npm run preview`   | Prévisualiser le build de production             |
| `npm test`          | Tests unitaires (Vitest, `tests/**`)             |
| `npm run lint`      | ESLint sur `src/`                                |
| `npm run e2e`       | Tests end-to-end Playwright                      |

## Structure

```
src/
  pages/        écrans (Dashboard, Activities, Race, Renfo, Coach, Profile…)
  components/   composants partagés (Layout, …)
  lib/          logique métier pure et testée (TS)
    coach/      moteur du Coach algorithmique (bibliothèque de séances + plan)
  store/        Zustand (session utilisateur)
supabase/
  functions/    Edge Functions (Strava OAuth/refresh/webhook, delete-account…)
  migrations/   migrations SQL (RLS, index, tables renfo…)
tests/          tests unitaires Vitest
e2e/            tests Playwright (legacy + react + react-auth)
docs/           ADR + plan de migration + checklist sécurité
legacy.html     ancien monolithe (backup, déployé sur /Vorcelab/_legacy.html)
```

## Modèle de sécurité

- **RLS activé** sur toutes les tables de données utilisateur ; chaque utilisateur
  n'accède qu'à ses propres lignes.
- **Tokens Strava côté serveur uniquement** — jamais renvoyés au navigateur. Les
  opérations sensibles passent par des Edge Functions (`strava-*`).
- **Pas d'IA externe** sur les données Strava : l'analyse et le coaching sont
  **100% locaux/déterministes** (l'API Strava interdit l'envoi des données à un
  fournisseur d'IA). Voir `docs/architecture/adr-001-foundation.md`.

## Déploiement

Déploiement automatique sur **GitHub Pages** (workflow `.github/workflows/deploy-pages.yml`)
à chaque push sur `main`. L'app React est servie sous `/Vorcelab/app/` ; la racine
redirige vers l'app.

## Documentation

- `docs/architecture/adr-001-foundation.md` — décisions d'architecture & sécurité
- `docs/architecture/migration-plan.md` — plan de migration monolithe → modulaire
- `docs/security-checklist.md` — checklist sécurité
