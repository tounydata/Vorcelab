# Coach Vorcelab — Spec d'UI (guide de câblage)

> Issue d'un benchmark (Campus Coach, Runna, Nike Run Club, Garmin Coach, TrainingPeaks, Strava, adidas Running, Wahoo SYSTM, Decathlon Coach) croisé avec la couche comportementale (couche 4).
> Posture **imposée** : déterministe (aucune IA), **pull-pas-push**, anti-pop-up, anti-fatigue de notifications. Daté 2026-05-31.

## Principe directeur

L'engagement vient de **l'outil qui est bon**, pas d'un habillage de jeu. Toute information d'engagement est **tirée** (consultée dans l'app), jamais **poussée** (notification/pop-up). Les célébrations scriptées et messages « motivationnels » automatiques sont **bannis** (cf. anti-patterns).

### Choix-first (jamais de prescription)

Vorcelab **ne dira jamais « aujourd'hui tu fais ça »**. L'athlète **choisit librement** sa séance dans un **catalogue** ; le moteur se contente de **recommander** via un **badge** discret (« ✦ Recommandée », « Récup conseillée », « Déjà faite cette semaine »…). Aucune séance n'est imposée ni masquée — l'autonomie (TAD) prime. Implémenté par `sessionRecommender.ts` (`recommendSessions` retourne **toutes** les candidates annotées d'un score + badge, jamais un ordre contraignant).

---

## 1. Écran de séance

Cible visuelle : Campus Coach / TrainingPeaks (lisibilité d'intervalles d'un coup d'œil).

- **Hero** : nom de séance + chip de type (Endurance / Seuil / VO2 / Côtes / Récup / Renfo) + méta en ligne (durée estimée · D+ si trail · difficulté 1-5). Pas de prose dans le hero.
- **Profil d'intensité** = **barres horizontales segmentées** — *composant le plus important*. Chaque bloc : **hauteur = zone (Z1→Z5)**, **largeur = durée/distance**. Couleurs **stables et déterministes** par zone. C'est le rendu direct de `sessionGenerator.Workout.blocks[]`.
- **Naming hybride** : nom descriptif **toujours lisible** + sous-titre « ce que ça travaille » (ex. « Seuil — tenir l'allure semi »). Le créatif (« Amuses-bouches ») reste secondaire, jamais seul (anti-débutant).
- **Liste des blocs** sous le profil : tap → highlight + détail. Allure en **range** (4:15–4:25), pas valeur unique → réduit l'anxiété de perf (pattern TrainingPeaks). Source : `paceEngine.trainingPaces()`.
- **Actions** : « Valider ma séance » + « Exporter » (montre).
- **Post-séance** : overlay **planifié vs réalisé** (récompense d'information, pas interrogatoire).

## 2. Planning / liste de séances

- **Vue semaine par défaut**, vue jour au tap. Source : `periodization.buildPlan()`.
- **États silencieux** : `À venir` (contour) · `Aujourd'hui` (accent) · `Fait` (✓ + données) · `Manqué` (**gris neutre, jamais rouge/punitif**).
- **Position en pull** : bandeau discret « Semaine 4/12 — Bloc Spécifique » (`getCurrentPhase`), « Séance 2 sur N ». Jamais notifié.
- **Drag-and-drop** pour replanifier sans casser le plan ni générer d'alerte (pattern Runna).
- **Barre de progression de bloc** (segments remplis) en tête de semaine = progression visible, sans gamification.

## 3. Pendant la séance

- **Export workout structuré vers la montre** (Garmin/Coros/Apple Watch) = priorité ; transitions de blocs pilotées au poignet.
- ⚠️ **Piège Auto Lap Garmin** : l'auto-lap (tous les 1 km) désaligne les blocs → **forcer les laps sur les frontières de blocs** (manual lap par step) + avertir de désactiver l'Auto Lap.
- **Guidage audio léger et optionnel** : annonce de transition + fin de rep. Pas de coach bavard scripté. Fallback vibration/écran (Coros sans audio).

## 4. Feedback post-séance (point le plus sensible — anti-anxiété)

Aligné sur `safetyGuards.painCheckCadence` et `coachContent.buildDebrief`.

- **Étage 1 (toujours, 1 tap)** : ressenti global 👍 / 😐 / 👎. Aucune obligation, swipe pour ignorer.
- **Étage 2 (conditionnel)** : si 😐/👎 → raisons fixes en chips (« Allures trop dures », « Trop long », « Pas en forme », « Douleur »). « Douleur » → localisation factuelle, **non alarmiste** (et seulement alors le questionnaire détaillé `assessPain`).
- **RPE 0-10 optionnel** (avancés), proposé en *pull*, pas demandé par défaut au débutant.
- **Inline dans l'écran de fin**, **jamais en notification**, **jamais relancé** s'il est ignoré. Pas de « tu n'as pas noté ta séance d'hier ».
- **Douleur par défaut : aucune question** (cf. `painCheckCadence` : détaillé seulement en fenêtre à risque).

## 5. Rétention (ce qui marche vs gadgets)

- **Moteur n°1 : progression visible contre soi-même** — PB par distance/segment, allures tenues (« tu respectes tes allures X % du temps »), courbes de charge par bloc. Tout en *pull*.
- **Jalons naturels étagés**, affichés à la consultation (premier 1000 D+ cumulés, première séance seuil tenue). Pas en notification.
- **Streak : hebdomadaire et tolérant uniquement** (ex. « X semaines avec ≥ le volume prévu »), passif. **PAS de streak quotidien** (toxique : anxiogène, sape la motivation intrinsèque, « streak freeze » payant détesté).
- **Contenu éducatif en pull** (« pourquoi cette séance », glossaire `coachContent.GLOSSARY`).
- **Limiter le nombre de mécaniques ludiques** (courbe en S : trop de gamification → fatigue). Progression + jalons + streak hebdo, stop.

## 6. Onboarding

- **Court et progressif** (style Runna conversationnel, 4-6 questions) : objectif (course/date/distance/D+), volume actuel, allures de référence (ou test terrain proposé), jours dispo.
- **Calibration déterministe** via `paceEngine` (un temps récent → VDOT → allures, règles transparentes). Le coureur comprend d'où sortent ses allures.
- **Skippable / ajustable** plus tard (pattern adidas). Pré-remplissage optionnel si montre connectée — jamais exigé.

## 7. Règles dures à coder (anti-patterns)

1. **Zéro notification push non sollicitée.** Seule exception : rappel de séance **opt-in** explicitement configuré.
2. **Zéro message « motivationnel » auto** (le travers Strava le plus détesté).
3. **Zéro pop-up modal de célébration.** Feedback positif = inline, discret, dismissible d'un swipe.
4. **États « manqué » neutres**, jamais punitifs.
5. **Feedback post-séance optionnel et non répété.**
6. **Fiabilité technique d'abord** (export montre, alignement des laps) = socle de confiance.

---

## Mapping UI → modules existants

| Élément UI | Module source |
|---|---|
| Profil d'intensité + blocs | `sessionGenerator.ts` (`Workout.blocks[]`) |
| Allures cibles (range) par bloc | `paceEngine.ts` (`trainingPaces`, zones FC) |
| Vue semaine, position dans le plan, états | `periodization.ts` (`buildPlan`, `getCurrentPhase`) |
| Feedback 2 étages + douleur opt-in | `safetyGuards.ts` (`painCheckCadence`, `assessPain`) |
| Débrief 1 conseil, glossaire, ton, adhérence | `coachContent.ts` |
| Surcharge → suggestion décharge (pull) | `safetyGuards.detectOverload` + `trainingLoad` |
| Overlay planifié vs réalisé | `sessionGenerator` (plan) + `sessionQuality` (réalisé) |

## Ordre de câblage suggéré (tranches vérifiables)

1. **Écran séance** (profil d'intensité + blocs + allures) — la pièce la plus visible, branche A+B.
2. **Vue semaine** (planning + états + position) — branche C.
3. **Feedback post-séance 2 étages** — branche E+D, respecte l'anti-anxiété.
4. **Export montre** (workout structuré + laps alignés) — fiabilité/confiance.
5. **Progression & jalons en pull** — rétention saine.
6. **Onboarding** déterministe — branche A.

> Anti-doublon : le **gameplay narratif scripté** (pop-ups de célébration, « chapitre de la semaine », notifs motivantes) est **abandonné** — décision actée pour ne pas le reconstruire par réflexe.
