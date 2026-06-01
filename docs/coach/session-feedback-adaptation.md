# Boucle d'adaptation : séance validée ↔ activité Strava (design)

> **Statut : conception (à valider avant implémentation).** Objectif : fermer la
> boucle *prévu → réalisé → adaptation*. 100 % déterministe, aucune IA, aucune
> donnée envoyée à l'extérieur (règle Vorcelab).

## 1. Pourquoi
Aujourd'hui le plan s'adapte au **profil** (niveau, distance, points faibles) mais
pas à l'**exécution réelle** des séances. Lier une séance validée à l'activité
Strava correspondante permet de comparer la consigne au réalisé et de moduler la
suite : c'est le levier d'adaptation le plus puissant après les points faibles.

## 2. Appariement séance ↔ activité (linking)
Au moment où l'athlète tape **« Valider ma séance »** :
1. Chercher les activités Strava synchronisées dans une fenêtre (±36 h autour du
   jour planifié), même `sport_type` (Run/TrailRun).
2. **Match automatique** si une seule candidate plausible (durée/distance dans
   l'ordre de grandeur de la séance) ; sinon proposer un **choix manuel** (liste
   courte) ou « pas d'activité » (séance faite hors montre / ressenti seul).
3. Persister le lien dans une table `session_log` (voir §5).

> Garde-fou : jamais de match silencieux ambigu — en cas de doute, on demande.

## 3. Métriques extraites (réutilise l'existant, rien à réinventer)
| Signal | Source code existante | Usage adaptation |
|---|---|---|
| Allure réalisée vs cible (par bloc) | `paceEngine` (allures) + streams | **Compliance** d'allure : a-t-il tenu la cible ? |
| Dérive cardiaque (découplage) | `runnerProfile.computeDriftStatus` / `hrDriftPct` | Fatigue/endurance : drift élevé → séance trop dure ou forme basse |
| FC moy/max vs zones | `paceEngine` zones FC + `fcMax` | Intensité réelle vs prescrite (trop haut/bas) |
| D+ encaissé | `total_elevation_gain` / streams altitude | Charge spécifique trail |
| Coût cardio par gradient | `runnerProfile` buckets | Met à jour les **points faibles** (montée/descente) |
| Charge (TSS-like) / ACWR | `trainingLoad` (`computeDailyPMC`, `computeACWR`) | Surcharge → décharge ; sous-charge → progression |
| Ressenti (RPE) + raisons | `SessionFeedback` (déjà en place) | Pondère le quantitatif ; douleur = garde-fou sécurité |

## 4. Comment ça module l'algo (règles déterministes)
Calcul d'un **verdict de séance** ∈ {trop_facile, conforme, trop_dur, manquée} à
partir de : (allure vs cible) × (FC/zone vs cible) × (RPE) × (drift).

- **trop_dur** (RPE haut + drift marqué + FC au-dessus de la zone) → la prochaine
  séance qualité est allégée d'un cran et/ou on insère une récup. Cohérent avec
  `safetyGuards` (surcharge ≥ 2 signaux).
- **trop_facile** (allure tenue large sous cible, FC basse, RPE bas) → progression
  (volume/intensité +1 cran) au prochain bloc du même système.
- **conforme** → on continue la progression planifiée.
- **manquée / sautée** → ne pas culpabiliser (cadence non anxiogène) ; recaler le
  bloc sans empiler.
- **Mise à jour des points faibles** : si la montée reste « weak » sur les séances
  réalisées → maintenir le boost `climbing` (déjà géré par `weaknessesFromRunnerProfile`,
  ici rafraîchi par les dernières sorties au lieu d'un profil figé).
- **Estimation du niveau** : convergence douce du `level` si les allures réelles
  sortent durablement de la fourchette VDOT supposée.

Tous les seuils sont des constantes documentées (pas d'apprentissage opaque).

## 5. Modèle de données (proposé)
Table `session_log` (Supabase, RLS par `user_id`) :
```
id, user_id, planned_workout_id, planned_week_index,
strava_activity_id (nullable), linked_at,
verdict, compliance_pace, hr_drift_pct, avg_hr_pct_fcmax, dplus_m,
rpe, feedback_reasons[], pain_flag,
computed_at
```
Réutilise les calculs purs existants ; `session_log` ne stocke que le résultat
agrégé (pas les streams bruts, déjà cachés ailleurs).

## 6. Confidentialité & déterminisme
- Tout est calculé **localement** (client) ou via fonctions pures ; persistance
  Supabase du projet. **Aucun appel à un fournisseur d'IA.**
- Le verdict et la modulation sont **reproductibles** (mêmes entrées → même sortie).

## 7. Phasage proposé
- **v1 (mince, testable)** : linking (auto + choix manuel) + `session_log` +
  compliance d'allure + RPE → verdict affiché (pas encore de modulation auto).
- **v2** : drift + zones FC + D+ → verdict enrichi + rafraîchissement des points
  faibles depuis les dernières sorties.
- **v3** : modulation automatique de la séance suivante (allègement/progression)
  sous garde-fous `safetyGuards`, + convergence du niveau.

## 8. Questions ouvertes (pour validation)
1. **Match** : auto-confirm quand une seule candidate, ou toujours confirmation
   manuelle de l'athlète ?
2. **Portée de la modulation** : seulement suggérer (badge/explication) ou
   réécrire la séance suivante ?
3. **Fenêtre d'appariement** : ±36 h convient-il (sorties décalées d'un jour) ?
4. **Sans montre** : garder le ressenti seul (RPE) comme entrée valable du verdict ?
