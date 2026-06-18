# Vorcelab — mémoire projet

PWA pour coureurs de **trail / running** : analyse Strava, coaching, plan de
renforcement (« renfo »), stratégie de course. Objectif : la meilleure app
running/trail possible.

- **Stack** : React + TypeScript + Vite, PWA. État : Zustand + TanStack Query.
  Carto : Leaflet / MapLibre. Auth + DB : Supabase. Tests : Vitest + Playwright.
- **Prod** : https://vorcelab.app (domaine OVH → GitHub Pages, base Vite `/`,
  fichier `CNAME`). Déploiement via `.github/workflows/deploy-pages.yml`.

## Commandes

| But | Commande |
|-----|----------|
| Dev | `npm run dev` (Vite, http://localhost:5173) |
| Build | `npm run build` (`tsc -b && vite build`) |
| Tests unitaires | `npm run test` (vitest) |
| Lint | `npm run lint` (eslint sur `src/`) |
| E2E | `npm run e2e` / `e2e:auth` (Playwright) |

CI (`.github/workflows/ci.yml`) sur chaque PR : **lint + test + build**. Garder
ces trois verts avant de pousser (`npm run lint && npm run test && npm run build`).

## Arborescence

- `src/pages/` — écrans (routeur **hash**) : Dashboard (`/#/`), Coach (`/#/coach`),
  Activities (`/#/activities`), Race (`/#/race`), Profile/Settings, Renfo.
- `src/components/` — UI partagée (dont `Layout`, onboarding).
- `src/lib/` — logique métier (coach, projection course, calculs renfo, Strava…).
- `src/store/` — store Zustand (`vlStore`).
- `src/lib/supabase.ts` — client Supabase, **configurable par env**
  (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`), **fallback codé en dur sur la
  prod** → le build GitHub Pages reste sur la prod sans variables.

## Conventions

- Styles via **tokens CSS `--vl-*`** (couleurs, rayons, polices), pas de valeurs
  en dur. Identité : sobre, dense, data-driven (« le laboratoire du coureur »).
- Commentaires et libellés en **français**.
- Distances Strava en **mètres** ; allures/vitesses en m/s. Types « course » :
  `Run`, `TrailRun` (cf. `isRunning`).

## Supabase

| Env | Projet | Ref | Région |
|-----|--------|-----|--------|
| **Prod** | runnerdata | `wanzrkdgqmcctwvnbmuv` | eu-north-1 |
| **Dev** | runnerprofil | `ibzwikugnsrcjvmonblm` | eu-west-1 |

Le dev réplique le schéma prod (15 tables, RLS, triggers, dont
`on_auth_user_created`). Tables clés : `strava_activities`, `race_calendar`,
`renfo_program`, `renfo_session_log`, `profiles`, `strava_tokens`.

**Compte de test (dev uniquement)** : `test@vorcelab.app` / `vorcelabtest123`
(id `11111111-1111-1111-1111-111111111111`).

> ⚠️ Ne jamais lancer de seed/écriture de test sur la **prod**. Le seed dev
> utilise une plage d'ID réservée (`strava_activity_id >= 900000000`) + préfixe
> `[DEV]` pour rester supprimable.

## Design sur écrans connectés (workflow)

Faire du design sur le **rendu réel**, pas à l'aveugle :

1. `bash scripts/dev-setup.sh` — crée `.env.local` (→ projet dev). *(Optionnel :
   le câbler en hook `SessionStart` dans `.claude/settings.json` pour automatiser
   chaque session.)*
2. `/seed-dev` — données réalistes si les écrans sont vides.
3. `/shot '/#/activities' /tmp/acts.png` puis `Read /tmp/acts.png`.
4. `/design-review` — critique design/accessibilité contextualisée.

**Gotcha clé** : l'environnement headless **intercepte le TLS** (CA inconnue de
Chromium) → toute requête HTTPS échoue en « Failed to fetch » dans le navigateur
(alors que `curl` marche). `scripts/shot.mjs` neutralise ça via
`ignoreHTTPSErrors`. Le chromium est auto-détecté sous `/opt/pw-browsers`.

## Skills projet (`.claude/skills/`)

- **`/shot`** — capture un écran connecté (PNG mobile).
- **`/seed-dev`** — seed le projet dev.
- **`/design-review`** — critique design/accessibilité sur le rendu réel.

## Environnement (conteneur éphémère)

Conteneur recréé à chaque session : tout ce qui n'est pas committé (ou dans
`~/.claude`) disparaît. `.env.local` est gitignored et recréé par `dev-setup.sh`.
MCP branchés : **Supabase** + **GitHub**. Pour ajouter d'autres connecteurs
(Figma, Sentry…), passer par la config de l'environnement web
(https://code.claude.com/docs/en/claude-code-on-the-web).
