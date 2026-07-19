# Parité du profil coureur & garde-fous de durabilité (2026.07)

Cette note documente les changements livrés dans la branche
`fix/profile-parity-and-scientific-validation` et **délimite honnêtement** ce qui reste à
faire (les étapes nécessitant un runtime Deno, des identifiants Supabase de production, ou
un run réel du benchmark ne pouvaient pas être exécutées/vérifiées dans l'environnement de
développement de cette PR — elles sont listées en fin de document).

## 1. Version de schéma du profil (§2, §24)

Nouveau module partagé **`src/lib/runnerProfileSchema.ts`** (miroir `mobile/`) :

- `RUNNER_PROFILE_SCHEMA_VERSION = 'runner-profile-2026.07-2'`
- `isRunnerProfileCompatible(profile)` : conservateur — un profil absent, sans
  `schemaVersion`, à une version antérieure, ou dépourvu d'un champ obligatoire
  (`bestEfforts`, `criticalSpeed`, `bestClimb`, `buckets`, `schemaVersion`, `computedAt`,
  `asOfAt`, `historyDays`, `detailedProfileDays`) est déclaré **incompatible**.
- `buildProfileSchemaMeta(...)` : en-tête de provenance commun apposé par tout producteur.

`PROFILE_VERSION` (benchmark) passe de `atDate-2026.07-1` → `atDate-2026.07-2`.
`ENGINE_VERSION` reste `2026.07-7` : **aucune projection affichée ne change tant qu'un
profil ne fournit pas de records fiables au nouveau schéma** — donc pas d'incrément moteur.

Quand un profil est absent/incompatible : le moteur reste fonctionnel via ses fallbacks ;
la page peut proposer un recalcul ; **aucun ancien profil n'écrase les nouveaux champs**
(cf. §3).

## 2. Garde-fous de la durabilité personnelle (§6)

`fitFadeExponent` (100 % pur, identique web/mobile) intègre désormais la **qualité de la
régression** (le R² était calculé mais inutilisé) et la **provenance** :

| Confiance | efforts | activités distinctes | spreadRatio | R²    |
|-----------|---------|----------------------|-------------|-------|
| `high`    | ≥ 4     | ≥ 3                  | ≥ 3         | ≥ 0.95 |
| `medium`  | ≥ 3     | ≥ 2                  | ≥ 1.8       | ≥ 0.90 |
| sinon     | —       | —                    | —           | exposant par défaut, **aucune activation** |

Le résultat expose `confidence`, `distinctActivityCount`, `r2`, `spreadRatio`, `reason`.
**Le moteur n'utilise l'exposant personnel que pour une confiance `medium` ou `high`.**
Seuils NON calibrés sur le benchmark : garde-fous statistiques conservateurs.

Diagnostics ajoutés à `ProjectionResult` : `personal_fade_r2`, `personal_fade_confidence`,
`personal_fade_effort_count`, `personal_fade_distinct_activity_count`,
`personal_fade_spread_ratio`, `personal_fade_reason` (en plus de `used_personal_fade` /
`personal_fade_exponent`).

## 3. Provenance & qualité des records (§7, §8)

- `BestEffortSource` (anonymisable) : `activityId`, `activityDate`, `sportType`,
  `rawTimeSec`, `gapTimeSec`, `suspectDownhill`, `hasTimeGap`, `altitudeCoveragePct`.
  `MergedBestEffort` conserve `rawSource` / `gapSource` (provenance du gagnant).
- `assessBestEffortQuality(record)` : **dépondération robuste** plutôt que filtrage brutal
  — descente suspecte (0.3), trou temporel (0.4), couverture altimétrique < 80 % (0.5),
  hors running (0), vitesse invraisemblable (0). `eligibleForFade` = poids ≥ 0.5.
- Le moteur filtre les records `eligibleForFade` **avant** l'ajustement du fade, et compte
  les activités distinctes via `gapSource.activityId`.

> Les identifiants réels ne doivent jamais apparaître dans un rapport : `activityId` est
> destiné à être pseudonymisé (hash court) au moment de la publication.

## 4. Edge Function `compute-runner-profile` — persistance non destructive (§3)

L'Edge Function déployée calcule encore uniquement les buckets/récup/dérive sur 56 jours et
**remplaçait** intégralement `profiles.runner_profile`, supprimant `bestEfforts`,
`criticalSpeed`, `bestClimb` et l'en-tête de schéma produits par le builder TS.

Correctif livré : la fonction **charge le profil existant et fusionne** — les champs récents
recalculés gagnent, tout champ moteur/schéma préexistant est **préservé**. La réponse liste
`preserved_fields`. Ceci garantit qu'un recalcul ne supprime plus les records (test de
non-régression côté TS : `bestEffortQuality` + `runnerProfileSchema`).

## 5. Fatigue GLOBALE de montée v1 — clarification (§10)

Le coefficient de fatigue intra-course (montées de plus en plus lentes à mesure que le D+
s'accumule) est **global** (niveau population), pas personnel. Renommé
`GLOBAL_CLIMB_FATIGUE_V1_*` avec un commentaire explicite pour ne pas le confondre avec la
durabilité personnelle (fadeModel) ni les buckets appris. **Valeurs inchangées** (0.09 / 1000 m,
plafond 0.18) — aucune hausse dans cette PR.

Diagnostics ajoutés (n'altèrent PAS le temps calculé) : `global_climb_fatigue_active`,
`global_climb_fatigue_max_multiplier` (borné à 1.18), `global_climb_fatigue_seconds_added`.

> Limite honnête : le coefficient s'applique aujourd'hui au **chemin VAM** (bucket de montée
> fiable). L'étendre au repli Minetti « sans profil » — pour que le fallback ne soit pas plus
> optimiste que le profil personnalisé (§10) — **change les projections affichées** et exige
> un run du benchmark ; laissé ouvert plutôt qu'appliqué sans mesure.

## 6. Courbe verticale — extraction seule (§11)

`extractVerticalEfforts(streams, source?)` : temps minimal (VAM max) pour grimper 100 / 300 /
500 / 1000 m de D+ (équivalent « mean-max » vertical). Chaque effort conserve
`ascent / duration / distance / VAM / grade / source / hasTimeGap`. Fusion multi-activités
par `mergeVerticalEfforts` (meilleure VAM par palier). Stocké dans le profil
(`bestClimbByTier`). **Non branché sur la projection centrale** (cf. §11) : fondation +
tests uniquement.

## Ancienne vs nouvelle architecture (profil)

```
AVANT
  web/mobile  → buildRunnerProfile (TS)  → profil complet (records, CS, climb)   ─┐
  benchmark   → buildAthleteBestEfforts (TS, pur)                                  ├ divergents
  Edge Func   → implémentation Deno indépendante → profil PARTIEL, écrase tout   ─┘

APRÈS (cette PR)
  primitives PURES partagées : bestEfforts.ts (extract/merge/quality/provenance),
    fadeModel.ts (confiance), criticalSpeed.ts, runnerProfileSchema.ts (version + compat)
  web/mobile/benchmark → mêmes primitives → même contrat (schéma 2026.07-2)
  Edge Func            → persistance non destructive (préserve les champs moteur)
```

## Reste à faire (non exécutable/vérifiable dans cette PR — à ne PAS annoncer comme fait)

Ces points exigent un runtime Deno, des secrets Supabase de production, ou un run réel du
benchmark GitHub Actions, indisponibles ici. Ils sont volontairement laissés ouverts plutôt
que « faits » de façon non vérifiée :

- **§1/§4/§18** : extraire `buildRunnerProfileFromActivitiesAndStreams({activities,
  streamsByActivityId, fcMax, asOfMs})` sans dépendance navigateur/Supabase et l'appeler
  depuis l'Edge Function (Deno) ; test de contrat commun aux 4 producteurs ; **déploiement**.
- **§4/§5** : cache-first `activity_streams` avant Strava, diagnostics de cache, suppression
  du `.limit(30)`, pagination temporelle sur les deux fenêtres (183 / 56 j) côté Edge Func.
- **§21/§22** : comparaison benchmark multi-versions (2026.07-6 / -7) ; workflow admin
  idempotent de recalcul des profils périmés (diagnostic déjà obtenu : 5 profils, 4 périmés,
  1 absent, 0 au schéma courant — recalcul piloté côté client par `isRunnerProfileCompatible`).

## 8. Validation scientifique du benchmark (§15, §16, §17, §18) — LIVRÉ

- **§15 baselines** (`backtestBaselines.ts`, pur+testé) : `kilometre_effort`,
  `riegel_distance_only`, `riegel_with_dplus`, `recent_average_pace`,
  `best_similar_past_race`, `previous_engine_version` (= `predicted_s_no_be`). Référence
  par athlète en leave-one-out (anti-fuite). Table comparative dans le rapport.
- **§16 `evaluation_type`** : le lot rétrospectif est marqué `development_sample` (aucune
  généralisation annoncée) ; `prospective_locked` réservé aux snapshots verrouillés.
- **§17 intervalles de confiance** (`backtestBootstrap.ts`, pur+testé) : bootstrap
  **clusterisé par athlète** (rééchantillonne les athlètes, pas les lignes), **seed fixe**
  → reproductible. IC 95 % sur MAPE / MAE / biais / couverture, dans le rapport.
- **§18 test de contrat** : `profileContract.test.ts` vérifie que les producteurs (web,
  mobile, benchmark) renvoient la même structure (schemaVersion, bestEfforts,
  criticalSpeed, bestClimb, buckets, hrDriftPct, streamCoverage…) ; **échoue** si un champ
  manque. **Correctif de parité** : le profil du benchmark émet désormais `bestClimb` +
  l'en-tête de schéma (auparavant absents).

## 7. Snapshots prospectifs de validation (§14, §23) — LIVRÉ

- Migration `20260719000000_projection_validation_snapshots.sql`, **appliquée en production**
  (`runnerdata`) : table `projection_validation_snapshots`, **RLS `user_id = auth.uid()`**
  (SELECT/INSERT/UPDATE/DELETE, USING + WITH CHECK), aucune donnée GPS brute.
- **Immuabilité** garantie par trigger `enforce_snapshot_immutability` (SECURITY INVOKER,
  `search_path=''`) : après création, seuls le résultat réel (moving + elapsed) et la
  transition de `status` (locked → evaluated/invalidated) sont autorisés ; les champs de
  preuve (prédiction, versions, empreinte, fenêtre) sont figés ; le résultat ne s'écrit qu'une
  fois. Vérifié en base (insert → écriture résultat OK ; tampering prédiction REJETÉ ;
  réécriture résultat REJETÉE ; lignes de test nettoyées).
- Cœur PUR TS `projectionSnapshot.ts` (web+mobile) : `buildProjectionSnapshot`,
  `computeInputFingerprint` (empreinte déterministe cyrb53 sur JSON canonique → preuve
  anti-recalcul), `snapshotToDbRow`, `isSnapshotLockedAt`.
- Advisors sécurité relus : le seul point lié à cette PR (search_path mutable) est corrigé ;
  les autres avertissements (fonctions admin SECURITY DEFINER, `strava_tokens`,
  leaked-password) sont **préexistants** et hors périmètre.

> Reste : brancher la création du snapshot dans le parcours UI (au moment où une projection de
> course future est affichée) — c'est un changement produit, pas une fondation.

## 9. Lissage altimétrique unifié des records (§9) — LIVRÉ

Le calcul GAP des `bestEfforts` utilisait un lissage simple (moyenne glissante 5 échantillons)
DIFFÉRENT du pipeline GPX principal. Extrait dans une primitive commune
`elevationSmoothing.ts` (`smoothAltitudeByDistance`) — mêmes 3 étapes robustes que
`elevationProfile` : interpolation par distance, filtre médian (anti-spike), moyenne par
fenêtre de DISTANCE (50 m). `bestEfforts` (GAP, détection de montées, courbe verticale)
l'utilise désormais. **La distance du stream n'est jamais recalculée** (§9). Batterie de tests
`elevationSmoothing.test.ts` : plat bruité, longue descente, montée régulière, escalier,
altitude partielle, spike barométrique, trous temporels, déterminisme + parité web/mobile.

> Effet : les records GAP sont désormais cohérents avec le D+ affiché en production. Comme ce
> lissage change les valeurs GAP → records → durabilité, le benchmark est re-exécuté sur la
> branche pour vérifier l'absence de régression avant tout merge.
