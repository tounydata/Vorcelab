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

## Honnêteté

Ne pas prétendre que le moteur est « le plus puissant au monde » sans ce benchmark.
Les fallbacks génériques (ex. 7:00/km trail, 5:20/km route) doivent apparaître avec
une confiance faible et ne pas alimenter de promesses trop précises (voir le teaser
paywall, déjà passé en « scénario indicatif »). Le versionnement moteur
(`engine_version`, `profile_version`) et l'explicabilité (part de chaque ajustement)
restent à ajouter pour relier chaque projection à sa version et comparer les versions.
