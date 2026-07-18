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
- **§10** : renommer `CLIMB_FATIGUE_*` → `global_climb_fatigue_v1` + diagnostics (sans
  augmenter les coefficients).
- **§11** : extraire `bestClimb100m/300m/500m/1000m` (données uniquement, pas de branchement).
- **§12–§17** : rapport moving+elapsed, couverture d'intervalles recalculée, baselines
  déterministes, bootstrap clusterisé (seed fixe), `evaluation_type`.
- **§14/§23** : table `projection_validation_snapshots` + RLS `user_id = auth.uid()`
  (USING + WITH CHECK), empreinte déterministe d'entrées.
- **§21/§22** : benchmark avant/après réel (2026.07-6 / -7 / -7+profil partagé) ; workflow
  admin idempotent de recalcul des profils périmés.
