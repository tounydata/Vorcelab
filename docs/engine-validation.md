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

## Validité historique du banc (lot « fix/historical-backtest-validity »)

Ce lot corrige des défauts **méthodologiques** du banc — il ne change **aucun coefficient**
de projection, ne recalibre **ni** l'intervalle de confiance **ni** la fatigue du dénivelé,
et n'ajoute aucun modèle appris. But : produire une **baseline fiable et reproductible**.

### 1. Horloge historique injectable (`asOfMs`)

Le banc filtrait déjà les activités futures, mais plusieurs fonctions lisaient encore
l'horloge réelle (`Date.now()`, `new Date()`, `dayAnchoredNow()`) — la récence des
entraînements, les fenêtres 7 j / 42 j, l'ACWR, la fraîcheur, la pondération trail et la
récence des PR étaient donc calculées « comme en juillet » pour une course de mars.

`computeRaceProjection(..., { asOfMs })` injecte désormais une **date de référence**.
En production, `asOfMs` est absent → `Date.now()` (comportement **strictement inchangé**).
Le banc passe `asOfMs = Date.parse(race.start_date)`. L'horloge circule vers
`dayAnchoredNow(nowMs?)`, `computeTrainingLoad(..., asOfMs?)`, `computeLoadTrend(..., asOfMs?)`,
`computeFreshnessAdjustment(..., asOfMs?)` et `deriveAutoPrs(..., nowMs?)` — sans jamais
monkey-patcher l'horloge JS globale du code de production. Résultat : **deux exécutions du
banc à des dates système différentes produisent exactement les mêmes projections**
(`computed_at` = instant d'exécution ; `as_of_at` = date historique du moteur). Testé
(`tests/historicalClock.test.ts`, `tests/backtestHistoricalValidity.test.ts`) ; le test de
déterminisme échoue avec l'ancienne implémentation (fuite d'horloge) et réussit avec la nouvelle.

### 2. Lissage altimétrique robuste (`smoothElevationProfile`)

Les altitudes brutes Strava oscillent de ±1-3 m par point ; cumulées, elles surestiment
fortement le D+ (ex. 52 m stockés → ~217 m bruts). `src/lib/elevationProfile.ts` (pur,
parité web/mobile) : interpolation par distance, filtre médian, lissage par fenêtre (~30 m),
**accumulation à seuil vertical** (hystérésis), et **recalage proportionnel optionnel** des
variations positives vers `total_elevation_gain` Strava (borné, distance JAMAIS modifiée,
tracé si appliqué). Chaque ligne du banc porte `stored_dplus_m`, `raw_gpx_dplus_m`,
`smoothed_gpx_dplus_m`, `dplus_calibration_ratio`, `dplus_was_calibrated`. Testé
(`tests/elevationProfile.test.ts`, plat bruité, montée continue, aberrations,
distance inchangée, semi non classé « fort D+/km »).

**Post-baseline (branchement production + précision du recalage).** Après la première
baseline réelle (D+ brut vs Strava : écart moyen **67 m → 22 m** après lissage), deux
améliorations sans toucher aux coefficients moteur : (a) le lissage est branché en
**production** — `computeRaceProjection(..., { smoothElevation: true })`, parité
web/mobile — pour débruiter les GPX importés ; (b) le recalage Strava utilise une
**dichotomie** qui vise précisément le D+ Strava (les tracés plats très bruités,
52 m réel → ~272 m brut, étaient auparavant sous-corrigés : ratio faible refusé, ou
profil écrasé à zéro). Le profil de sortie est **débruité par morceaux** (linéaire
entre extrêmes confirmés) pour que la somme naïve des D+ du moteur ≈ le D+ seuillé.
Défauts : fenêtre 50 m, seuil 3 m. Testé (`tests/productionElevationSmoothing.test.ts`).

### 3. FC max — cascade tracée (banc seulement)

La logique produit est inchangée (saisie → Strava observée → 220 − âge → repère fixe) et
`profiles.fc_max` n'est **jamais** modifiée. Le banc charge désormais l'âge/date de naissance
du profil pour rendre le fallback « 220 − âge » réellement disponible, et trace l'origine via
`fcmax_source` ∈ `user | strava | age_formula | fixed_fallback` (`resolveFcMaxWithSource`).

### 4. Temps écoulé vs temps en mouvement

Le banc évalue les **deux** références : `elapsed_time` (heure d'arrivée réelle) devient la
métrique **principale**, `moving_time` reste l'analyse sportive secondaire. Chaque ligne
porte `error_vs_moving_*`, `error_vs_elapsed_*`, `stop_gap_s/pct` et `stop_class`
(`large` si elapsed − moving > 5 %). Le rapport publie les deux jeux de métriques et
`coverage_vs_moving` / `coverage_vs_elapsed`.

### 5. Validation hors échantillon

`leave-one-date-out` (les courses d'une même date/événement ne sont jamais scindées) et
`leave-one-athlete-out`. **Aucun coefficient n'est ajusté** : le découpage garantit
l'intégrité des groupes et expose la sensibilité (macro-moyenne des MAPE par fold). Le
rapport publie `in_sample`, `leave_one_date_out`, `leave_one_athlete_out`.

### 6. `used_fallback` réel + qualité des données

`used_fallback` / `fallback_sources` reflètent les **vraies** sources mobilisées (allure
générique route/trail, absence de profil, sections sans bucket), issues du moteur — plus un
simple compte de buckets. Chaque ligne porte `prior_runs_count`, `prior_runs_with_streams`,
`prior_stream_coverage_pct` et `historical_data_quality` (`poor` < 50 % · `partial` 50-85 % ·
`good` > 85 %) ; le rapport présente les métriques **toutes courses** et **bonne qualité
uniquement**. L'intervalle : largeur inchangée, seule sa **couverture** est re-mesurée — la
calibration n'est pas annoncée tant que le hors-échantillon n'est pas stable.

### Reproduction

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run backtest:real   # lecture seule
```

Les artefacts (`artifacts/engine-backtest/`) et fixtures (`*.backtest-fixture.json`) restent
**gitignorés** (données personnelles / GPS jamais commitées).

## Snapshots prospectifs (validation « live », audit §P0.2)

Un snapshot fige, **avant le départ d'une course future**, la projection produite (temps
central/prudent/agressif), la provenance (versions moteur/profil), le **manifeste complet
des entrées** (`input_manifest` : agrégats par activité, jamais de GPS brut) et la
**séparation dev/validation** (`data_split`). Après la course, seul le **résultat réel**
peut être ajouté — une seule fois. C'est la preuve qu'une prédiction n'a pas été
recalculée après coup.

### Garanties (côté base, table `projection_validation_snapshots`)

- **Création serveur uniquement** : le client n'a plus le privilège `INSERT` ; seule
  l'Edge Function `lock-projection-snapshot` (service_role) crée un snapshot, après avoir
  vérifié serveur que la course n'a pas commencé (borne depuis `race_calendar`).
- **Immuabilité** : prédiction, versions, empreinte, `input_manifest` et `data_split` sont
  figés après création (trigger `enforce_snapshot_immutability`, `SECURITY INVOKER`).
- **Résultat écrit une fois** : `result_moving_s`/`result_elapsed_s` non ré-inscriptibles
  une fois `result_recorded_at` posé.
- **Invalidation tracée** : passer à `invalidated` exige une `invalidation_reason`, figée ensuite.
- **Pas de suppression** : le privilège `DELETE` est retiré à `authenticated`.

Migrations : `20260719000000_projection_validation_snapshots` → `_pvs_hardening` →
`_pvs_server_authoritative` (ajoute `input_manifest` + bascule serveur) →
`_pvs_data_split` (ajoute `data_split`). Test de cycle complet reproductible :
`supabase/tests/pvs_lifecycle.sql` (via `scripts/test-rls.sh`, base éphémère).

### Métriques (lecture seule, à exécuter sur la prod ou une réplique)

```sql
-- Répartition + erreur par version moteur × split × statut × type de course.
-- MAPE = moyenne(|réel − prédit| / réel) sur les snapshots évalués.
select
  s.engine_version,
  s.data_split,
  s.status,
  coalesce(r.type, 'inconnu')                         as race_type,
  count(*)                                            as n,
  count(*) filter (where s.used_fallback)             as n_fallback,
  count(*) filter (where s.used_personal_fade)        as n_personal_fade,
  count(*) filter (where s.used_steepness_calibration) as n_steepness,
  round(avg(
    case when s.status = 'evaluated' and s.result_elapsed_s > 0
      then abs(s.result_elapsed_s - s.prediction_central_s)::numeric / s.result_elapsed_s
    end
  ) * 100, 1)                                          as mape_pct
from public.projection_validation_snapshots s
left join public.race_calendar r on r.id = s.race_id
group by s.engine_version, s.data_split, s.status, race_type
order by s.engine_version desc, s.data_split, s.status;
```

Tant que `evaluated` reste à 0 (aucune course terminée avec résultat enregistré), le MAPE
est `null` : **ne pas** en tirer de promesse publique de précision (cf. §7 de l'audit).

## Honnêteté

Ne pas prétendre que le moteur est « le plus puissant au monde » sans ce benchmark.
Les fallbacks génériques (ex. 7:00/km trail, 5:20/km route) doivent apparaître avec
une confiance faible et ne pas alimenter de promesses trop précises (voir le teaser
paywall, déjà passé en « scénario indicatif »). Le versionnement moteur
(`engine_version`, `profile_version`) et l'explicabilité (part de chaque ajustement)
restent à ajouter pour relier chaque projection à sa version et comparer les versions.
