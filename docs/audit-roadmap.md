# Roadmap d'audit — Vorcelab

> Audit du dépôt sur 4 dimensions (architecture, tests/qualité, sécurité, maturité du moteur coach), mené le 2026-05-30, puis priorisé en phases.
> Sévérité : 🔴 majeur · 🟠 moyen · 🟡 mineur · ✅ sain.
> La maturité fonctionnelle du **moteur de coaching** est traitée à part dans `docs/coach/backlog.md` — non répétée ici.

---

## Synthèse — tableau consolidé

| # | Dimension | Constat clé | Sévérité |
|---|---|---|---|
| 1 | CI/CD | ~~Aucune CI ne lance tests ni lint~~ → **✅ FAIT** : `ci.yml` (lint + tests + build) sur PR & push | ✅ |
| 2 | Tests | 219 tests verts, mais 5 modules critiques `src/lib` non couverts en TS | 🟠 |
| 3 | Archi | ~40 fichiers JS legacy à la racine du dépôt + dossier `apps/web/` vestige | 🟠 |
| 4 | Sécurité | RLS solide ✅ ; clé **anon** en dur (hygiène de config, **pas** une fuite) ; XSS/CGU à finaliser avant public | 🟡→🟠 |
| 5 | Typage | `Record<string, unknown>` pervasif sur les données Strava | 🟠 |
| 6 | Lint | 3 warnings mineurs (console.log, exhaustive-deps) | 🟡 |

> ✅ **Points sains confirmés** : tooling moderne (React 19, Vite 6, ESLint 9, Playwright), zéro dépendance circulaire, séparation `lib` (pures fonctions) / `pages` / `store` nette, PWA bien pensée, RLS Supabase complète et isolée par `user_id`, secrets serveur (service role, Strava) jamais exposés au client.

---

## 1. CI/CD — 🔴 le trou le plus important

**Constat** : `.github/workflows/` ne contient que `deploy-pages.yml`. Les 219 tests unitaires, le lint et les E2E **ne tournent jamais automatiquement** → le déploiement peut partir avec du code cassé.

**Action** : créer `.github/workflows/ci.yml` (lint + `vitest run` + E2E smoke) déclenché sur PR et push, **requis avant merge**.

## 2. Tests — 🟠 modules critiques non couverts

**Constat** : tests concentrés sur `runnerProfile`, `renfoUtils`, `crewPlan`. **Non couverts en TS** : `buildRunnerProfile` (760 l.), `computeRaceProjection` (584 l.), `nutritionPlan`, et `trainingLoad`/`sessionQuality` (tests restés en JS legacy).

**Action** : prioriser `computeRaceProjection` et `buildRunnerProfile` (logique cœur, risque de régression élevé), puis migrer les tests JS→TS. Le nouveau `paceEngine.ts` est déjà couvert (16 tests).

## 3. Architecture — 🟠 dette de vestiges

**Constats** :
- **~40 fichiers JS du monolithe legacy à la racine** du dépôt (`app.js`, `dashboard-*.js`, `race-*.js`…) servis par `legacy.html` → pollution, confusion code actif/mort.
- **Dossier `apps/web/`** : vestige d'une tentative de monorepo, contient un `useThemeStore.ts` orphelin (non importé).
- Alias `@/*` configuré mais jamais utilisé.

**Actions** : archiver les JS legacy dans `/legacy/` (+ adapter `legacy-server.mjs` et `playwright.config.ts`) · supprimer `apps/web/` · décider du sort du projet e2e `legacy`.

## 4. Sécurité — 🟡→🟠 (avec correction d'analyse)

**RLS et OAuth : solides ✅** (politiques per-user complètes, `strava_tokens` en deny-all client, service role server-only, CORS whitelistée, suppression de compte en cascade).

**⚠️ Correction d'une surévaluation d'audit** : la clé **anon** Supabase en dur dans `src/lib/supabase.ts` a été qualifiée de « critique » par un agent. **C'est inexact** : une clé anon/publishable est **conçue pour être publique** (elle est de toute façon livrée dans le bundle client) ; la sécurité repose sur la RLS, jugée solide. Ce n'est donc **pas une fuite** et **aucun re-keying n'est nécessaire**. Reste un point d'**hygiène de config** (la passer en `import.meta.env.VITE_*` pour gérer plusieurs environnements) → 🟡.

**Vrais points avant ouverture publique** :
- **Audit XSS/innerHTML** (🟠) : marqué « à faire » dans la checklist ; le scan React n'a rien trouvé (JSX safe), mais le code legacy et le parsing GPX méritent une passe.
- **CGU / politique de confidentialité** (🟠) : à finaliser + branding « Powered by Strava ».
- **Signature HMAC des POST webhook Strava** (🟡) : seul le handshake est vérifié (verify token) ; valider si Strava exige la signature sur les events.

## 5-6. Typage & lint — 🟠 / 🟡

`Record<string, unknown>` pervasif sur les objets Strava/profil → typer explicitement (`StravaActivity`, `ProfileData`). Lint : retirer le `console.log` de `buildRunnerProfile.ts:491`, corriger `exhaustive-deps` (DashboardPage).

---

## Roadmap priorisée

### Phase 0 — Garde-fous (P0, avant toute ouverture publique)
1. ✅ **CI tests + lint + build** (`.github/workflows/ci.yml`) — à rendre *required* dans les réglages de branche.
2. **Audit XSS/innerHTML** complet + CSP (#4).
3. **CGU/confidentialité** + branding Strava (#4).

### Phase 1 — Dette structurelle (P1)
4. Archiver les **JS legacy** dans `/legacy/` ; supprimer **`apps/web/`** (#3).
5. **Tests** des modules cœur non couverts (`computeRaceProjection`, `buildRunnerProfile`) (#2).

### Phase 2 — Robustesse (P2)
6. **Typage Strava** (remplacer `Record<string, unknown>`) (#5).
7. Clé anon → **variable d'env** Vite (#4, hygiène).
8. **HMAC webhook** si requis par Strava (#4).
9. Migrer tests JS→TS ; corriger les warnings lint (#2, #6).

### Phase 3 — Confort (P3)
10. Activer l'alias `@/` · découpage de bundle (lazy-load race/renfo) si la perf le justifie.

---

## Articulation avec le moteur coach

Cette roadmap d'audit traite la **santé du dépôt** (CI, dette, sécurité). La **construction du moteur** (épopées A-E : `paceEngine`, `sessionGenerator`, `periodization`, `coachContent`, `safetyGuards`) est pilotée par `docs/coach/backlog.md`. Recommandation : **Phase 0 de l'audit en parallèle** du **Sprint fondation** du moteur (Épopée A, déjà démarrée avec `paceEngine.ts`), car la CI protège justement le nouveau code.
