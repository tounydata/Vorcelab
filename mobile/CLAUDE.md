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

- `Ajout de course` : `AddRacePage` → `app/race/add` (branché au Calendrier).
- `Détail d'activité` : `ActivityDetailPage` (~1160 l) porté en full → `app/activities/[activityId]` :
  débrief, répartition FC, lecture de séance, facteurs de course (météo Open-Meteo),
  profil altitude+FC (SVG, survol tactile), tracé GPS (carte WebView + Leaflet, fond
  relief MapTiler — `RouteMap`), montées/VAM, profil athlète, qualité de séance
  (dérive/découplage/durabilité), métriques, charge TRIMP, marquage course, et
  **partage en story** (stickers Canvas via WebView, identiques au web, partagés par
  `expo-sharing`). Libs pures copiées (`sessionDebrief`, `durability`, `weather`,
  `gpxCore`, `sessionAnalysis`, `staticMap` adapté). Carte/partage : WebView (validé
  par le propriétaire — reste compatible Expo Go).

- `Stratégie de course` : `RaceStrategyPage` (~2400 l avec ses composants) portée en
  full → `app/race/[raceId]` : projection (`computeRaceProjection`), profil d'effort
  SVG interactif (survol tactile), **carte 3D MapLibre** (WebView + relief MapTiler,
  `RouteMap3D`), conditions météo (Open-Meteo + pénalités profil), sections clés,
  toutes-sections, nutrition, **plan assistance** (ravitos + checkpoints, `CrewPlan`),
  **débrief post-course** (`RaceResult` : verdict, allure prévu/réel en SVG, étiquetage
  des arrêts, pacing, cardiaque, terrain, banc d'essai, enseignements). Import GPX via
  `expo-document-picker` + parseur regex natif (sans DOMParser). Partage via la feuille
  native (`Share`). Branchée depuis le Calendrier (lignes de course cliquables).
  Carte 3D/import : WebView + deps natives (validé par le propriétaire, Expo Go OK).

- `Réglages` : `ProfilePage.tsx` porté en full — onglets PROFIL / RECORDS / LABO.
  LABO complété : « Ton moteur » (`CoachEngine`), calibrage demi‑Cooper permanent
  (`CalibrationCard`), allures de référence (`PaceZonesCard`), zones FC éditables
  (`HrZonesCard`), **recalcul du profil coureur** (`buildRunnerProfile` +
  `fetchActivitiesForProfile` + `fillMissingWeather`) avec barre de progression,
  plus l'analyse existante (profil par gradient, conditions météo, récup par
  gradient, dérive cardiaque).
- `Dashboard` : `DashboardPage.tsx` porté en full → statut d'entraînement (PMC 42 j
  en SVG + statut multi‑facteurs ACWR/CTL/EF + triad), widget course (countdown +
  **projection live** `useRaceProjection` + tracé GPX + mini‑alti SVG), `CoachCard`
  (séance du jour + frise semaine), « ce mois » + dernières sorties, sections
  **réorganisables** (▲▼ + persistance `dashboard_layout`), recalcul profil en tâche
  de fond + rattrapage Strava→renfo (`syncStravaRenfo`).
- `Réglages app` : `SettingsPage.tsx` porté → `app/settings` (2 sous-onglets
  RÉGLAGES / NUTRITION) : connexion Strava (statut/sync/déco, `StravaConnectionCard`),
  orientation coach (`coach_motivation`), jours de course, cible renfo, 1RM force
  (`OneRMSettingsCard` + test guidé), accès matériel renfo (`app/renfo/equipment`),
  compte (email + changement de mot de passe), préférences nutrition (sans caféine +
  catalogue produits par marque). Branché depuis l'onglet Profil.

### Dette connue à résorber (portages incomplets à reprendre EN FULL)
- **Abonnement PRO (`SubscriptionCard`) volontairement absent sur iOS** : Apple impose
  l'In-App Purchase (Guideline 3.1.1) pour l'abonnement — Stripe hors-app = rejet. À
  porter en StoreKit/IAP une fois le compte Apple Developer souscrit (cf. suivi App Store).
  Corollaire : le gating PRO du web (`usePlanTier`) n'est pas encore porté (tout est
  débloqué sur natif tant que l'IAP n'existe pas).
- Onboarding / tour guidé non requis sur natif.
- Limites physiques natives (≠ simplification) : impression (`window.print`) absente
  du menu stratégie ; saisie date/heure en texte faute de date-picker sans dépendance ;
  réorganisation du dashboard via ▲▼ (le drag&drop pointer du web → boutons natifs) ;
  éditeur matériel renfo : sliders `<input range>` → steppers − / + (mêmes plages/pas).
