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

### Dette connue à résorber (portages incomplets à reprendre EN FULL)
- `Réglages` : actuellement lean → porter **tout** `ProfilePage.tsx` (~930 lignes :
  profil coureur calculé, météo & contexte, récup post‑montée, dérive cardiaque…).
- `Coach` : actuellement placeholder → porter **tout** `CoachPage.tsx` + le moteur
  `src/lib/coach/` (périodisation, replanification, calibration, séances…).
- Écrans restants à porter en full : détail d'activité, stratégie de course + carte,
  renfo (bibliothèque + séance), ajout de course.
