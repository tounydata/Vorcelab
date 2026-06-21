@AGENTS.md

# RÈGLE ABSOLUE DE PORTAGE — AUCUNE SIMPLIFICATION

> Décidée par le propriétaire du projet. Non négociable. S'applique à **toute**
> session qui travaille sur `mobile/`.

Le portage du web (`../src`) vers l'app native est **intégral et fidèle** :

- **JAMAIS** de version « lean / simplifiée » d'un écran.
- **JAMAIS** de placeholder laissé comme état final (« Bientôt disponible »).
- **AUCUNE** fonctionnalité, donnée, état, ou calcul abandonné ou raccourci.
- Toute la **logique métier** (moteur Coach `src/lib/coach/`, projection de course,
  calculs renfo, profil coureur, etc.) est **portée à l'identique** en TypeScript.
- Mêmes écrans, mêmes sections, mêmes libellés, mêmes règles, mêmes nombres que
  le web — à la virgule près.

### Avant de porter un écran
1. Lire **en entier** la page web correspondante (`src/pages/…`) **et toutes ses
   dépendances** (composants `src/components/…`, hooks/lib `src/lib/…`).
2. Porter aussi ces dépendances (pas seulement la page) — rien n'est « mocké ».
3. Vérifier le rendu réel (capture via `npx expo start --web`) **et** comparer au web.

### Seule limite physique (à ne pas confondre avec « simplifier »)
Le natif et le navigateur n'utilisent pas le même moteur de rendu : un pixel‑perfect
strictement identique au CSS n'est pas atteignable (polices, sous‑pixel). On vise
l'**équivalence fidèle** du design et du comportement — mais **jamais** au prix d'une
fonctionnalité ou d'un contenu en moins.

### Portages réalisés en FULL
- `Coach` : `CoachPage.tsx` porté à l'identique + le moteur `src/lib/coach/`
  (périodisation `planGenerator`/`workouts`, replanification réactive `replan`,
  modulation v3 `sessionModulation`, calibration demi‑Cooper, fusion renfo
  `renfoFusion`, menu de la semaine `WeekProgram`/`WeekMenu`, feedback + verdict
  `SessionFeedback`/`verdictFromActivity`, frise de périodisation en SVG natif).
  Les libs pures sont des copies à l'octet près du web ; le hook `useCoachPlan`
  est adapté au pattern loader natif (Supabase direct au lieu de TanStack Query),
  calculs identiques.

- `Renfo` : `RenfoLibraryPage`, `RenfoExerciseDetailPage` (graphe 1RM en SVG natif)
  et `RenfoSessionPage` (déroulé complet warmup → série → repos minuté → bilan,
  progression de charge `computeNextLoad`, DUP/deload, test 1RM guidé `OneRMTestPopup`,
  sélection lieu maison/salle, média d'exercice animé `ExerciseMedia`) portés en full.
  Routes `app/renfo/library`, `app/renfo/library/[exerciseId]`,
  `app/renfo/session/[focusKey]` — branchées depuis le Coach. Libs pures copiées à
  l'octet près (`renfoProgram`, `renfoMedia`, `oneRepMax`). Limites physiques :
  bips Web Audio → `Vibration` native ; input date → chips des 7 derniers jours.

### Dette connue à résorber (portages incomplets à reprendre EN FULL)
- `Réglages` : si encore lean → porter **tout** `ProfilePage.tsx` (~930 lignes :
  profil coureur calculé, météo & contexte, récup post‑montée, dérive cardiaque…).
- Écrans restants à porter en full : détail d'activité, stratégie de course + carte,
  ajout de course.
