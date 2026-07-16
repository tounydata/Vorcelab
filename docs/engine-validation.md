# Banc de validation du moteur de projection

Objectif : mesurer la qualité **réelle** du moteur (pas déduite du nombre de règles)
sur des courses passées, **sans fuite temporelle**.

## Principe (anti-fuite)

Pour chaque course passée dont on connaît le résultat réel :
1. ne fournir au moteur que les activités **strictement antérieures** au départ ;
2. recalculer le profil coureur comme il aurait existé **avant** la course ;
3. produire la projection (temps + intervalle de confiance) ;
4. comparer au **résultat réel**.

`src/lib/engineBacktest.ts` garantit le point 1 par construction :
`runBacktest(cases, project)` filtre les activités via `activitiesBefore()` avant
d'appeler la fonction `project` injectée — le moteur ne peut donc **jamais** voir
une activité postérieure au départ. Testé (`tests/engineBacktest.test.ts`).

## Métriques calculées

`computeErrorMetrics` + ventilations (`runBacktest`) :

- erreur absolue moyenne (**MAE**, s) et en **%** (MAPE) ;
- **biais moyen** signé (predicted − actual) → détecte une sur/sous-estimation systématique ;
- **médiane**, **P75**, **P90** de l'erreur absolue ;
- **calibration des intervalles** : fraction des résultats réels tombant dans
  `[low, high]` (idéalement ≈ le niveau de confiance annoncé) ;
- ventilation **par distance**, **par terrain** (route/trail) et **par D+/km**.

## Brancher le vrai moteur (orchestration)

Le banc est pur et découplé. Un script (à exécuter avec des données réelles, hors
CI car il nécessite l'accès aux activités) construit les `RaceCase[]` depuis
`race_calendar` (courses avec `result_activity`) + `strava_activities`, puis injecte :

```ts
runBacktest(cases, ({ activitiesBefore, distanceKm, dplusPerKm }) => {
  const profile = buildRunnerProfile(activitiesBefore)          // profil « d'époque »
  const p = computeRaceProjection(profile, { distanceKm, dplusPerKm /* … */ })
  return { predictedS: p.centralS, low: p.lowS, high: p.highS }
})
```

## Banc RÉEL sur données Supabase (`npm run backtest:real`)

Le banc pur ci-dessus est désormais **branché sur le vrai moteur et les vraies courses**
via `scripts/run-real-engine-backtest.ts` (orchestration pure dans `src/lib/realBacktest.ts`).

Chaîne, par course confirmée :

1. `validateRaceCandidate` (`raceValidation.ts`) — écarte échauffements, décrassages,
   temps « à confirmer », distances < 3 km, dates/sports invalides… (prudent : au doute → `pending`).
2. `selectPriorActivities` — anti-fuite STRICT : mêmes athlète, `start_date < course`, non supprimées.
3. `reconstructGpx` (`gpxReconstruct.ts`) — tracé lat/lon/alt depuis `activity_streams`
   (gère tailles différentes, trous GPS, altitude manquante).
4. `buildRunnerProfileAtDate` (`runnerProfileAtDate.ts`) — profil « d'époque » (buckets/VAM/
   dérive/récupération) reconstruit à partir des seuls streams **antérieurs** (fenêtre 56 j).
   Ne lit **jamais** le `runner_profile` stocké (postérieur à certaines courses).
5. `computeRaceProjection` — le VRAI moteur, avec les formats attendus (m/s, m, s, ISO…).
6. Comparaison au réel (`moving_time` ; `elapsed_time` conservé pour info).

Sorties (dossier **gitignoré** `artifacts/engine-backtest/`) : `summary.json`, `results.csv`,
`report.md`. Identifiants **pseudonymisés** (`A1…`, `R01…`), **aucune** coordonnée GPS ni nom.

Lecture seule, connexion via variables d'environnement uniquement :

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run backtest:real
# ou, hors ligne / déterministe :
npm run backtest:real -- --fixture ./data.backtest-fixture.json
```

Note sur les fixtures hors ligne : une fixture peut fournir un tracé reconstruit à partir
de la distance + altitude réelles (ligne synthétique fidèle en distance et D+). Dans ce
cas la **sinuosité est nulle** → la pénalité « descente technique » n'est pas appliquée
(le vrai tracé GPS, lui, la déclenche). Le chemin Supabase utilise le tracé GPS réel.

Versionnement : chaque ligne porte `engine_version` (`engineVersion.ts`), `profile_version`
(`PROFILE_VERSION`), `computed_at` (instant « d'époque »), `confidence`, `used_fallback`.
La météo n'agit aujourd'hui qu'à travers les surfaces OSM (souvent absentes) → non
consommée quand `surfaces` est vide ; `has_weather` reste tracé. Voir
`docs/examples/engine-backtest-example.md` pour le format (chiffres fictifs).

## Résultats de référence (baseline) & calibration des intervalles

Premier run réel (11 courses à streams, 3 athlètes, profils « d'époque ») avec le
moteur `2026.07-1` : **MAPE 9,7 %**, erreur médiane ~6,6 %, biais moyen ≈ **−1,4 %**
(quasi neutre). Deux défauts mesurés : intervalles **trop étroits** (couverture ~27 %)
et **optimisme sur les trails à fort D+/km**.

Correction `2026.07-2` (intervalles uniquement — projection centrale inchangée) : la
demi-largeur est dimensionnée par confiance + terrain (croissante avec le D+/km) +
extrapolation, sans resserrage agressif sur « bonne couverture stream ». Résultat sur
le même échantillon : **couverture 27 % → 82 %** (route 100 %, trail 78 %), MAPE
inchangée.

Confirmé sur les **tracés GPS réels** (pénalité descente technique réactivée) :
**couverture 91 %** (route 100 %, trail 89 %), MAPE 9,9 % — cible >75 % atteinte.
La pénalité « lacets » ramène dans la fourchette une des courses à fort D+ qui, en
tracé synthétique, en sortait (artefact). Reste **une** course hors intervalle : la
plus raide (D+/km ~51) à ~−23 % → **optimisme réel sur les très forts D+**, cible de
la prochaine calibration (modèle de montée VAM/bucket).

## Honnêteté

Ne pas prétendre que le moteur est « le plus puissant au monde » sans ce benchmark.
Les fallbacks génériques (ex. 7:00/km trail, 5:20/km route) doivent apparaître avec
une confiance faible et ne pas alimenter de promesses trop précises (voir le teaser
paywall, déjà passé en « scénario indicatif »). Le versionnement moteur
(`engine_version`, `profile_version`) et l'explicabilité (part de chaque ajustement)
restent à ajouter pour relier chaque projection à sa version et comparer les versions.
