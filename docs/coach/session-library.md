# Coach Vorcelab — Bibliothèque de séances (science-backed) + adaptation au profil

> Source de vérité pour l'enrichissement du catalogue `WORKOUTS` et le moteur d'adaptation.
> 57 séances sur 11 systèmes, citées (Daniels/VDOT, Canova, Koop, Billat, Magness, Seiler, Pfitzinger, Uphill Athlete, Roche). Daté 2026-05-31.

**Paces (réf. VDOT/Daniels)** : E easy (65-78 %VO2max) · M marathon (80-84) · T seuil (88-92, ~allure 1 h) · I VO2max (95-100, ~3-5k) · R répétition (~1500m). VMA ≈ vVO2max ≈ I. D+ dénivelé · B2B back-to-back.

**Champs (mappés au modèle `WorkoutTemplate` + adaptation)** : système · structure chiffrée · intensité (easy/moderate/hard) · terrain (flat/rolling/uphill/downhill/any) · durée réf (min) · phases · niveaux (beginner/intermediate/advanced) · distances (5k/10k/half/marathon/ultra) · target (qualité/point faible visé) · trailOnly.

`target` ∈ { aerobic_base, threshold, vo2max, economy, speed, climbing, descending, durability, race_specificity, recovery }.

---

## 1. Endurance & récupération
| id | nom | sys | structure | int | terr | min | phases | niveaux | distances | target |
|---|---|---|---|---|---|---|---|---|---|---|
| recovery_jog | Footing de récupération | recovery | 30-50' E | easy | any | 40 | toutes | b,i,a | toutes | recovery |
| endurance_easy | Endurance fondamentale | endurance | 45-75' E | easy | any | 60 | base,build,spe | b,i,a | toutes | aerobic_base |
| long_run | Sortie longue | long | 90-150' E (≤25-30% hebdo) | easy | any | 120 | base,build,spe | i,a | half→ultra | aerobic_base |
| long_progressive | Longue progressive | long | 90-120' : E → 20-30' M | moderate | rolling | 110 | build,spe | i,a | half→ultra | durability |
| long_fast_finish | Longue finish rapide | long | 100-130' E + 15-20' T | hard | flat | 120 | spe | a | marathon,ultra | race_specificity |
| long_fasted | Longue à jeun | long | 75-100' E, glucides bas | easy | rolling | 90 | base,build | i,a | marathon,ultra | aerobic_base |
| long_marathon | Longue marathon-spé | long | 25-35 km dont 2-3×5-8 km M | hard | flat | 150 | spe | a | marathon | race_specificity |
| hike_recovery | Marche active / hike | recovery | 40-60' marche soutenue | easy | any | 50 | base,taper | b,i,a | ultra | recovery |

## 2. Seuil
| id | nom | sys | structure | int | terr | min | phases | niveaux | distances | target |
|---|---|---|---|---|---|---|---|---|---|---|
| tempo_run | Tempo continu | tempo | 20' T | hard | flat | 50 | build,spe | i,a | 10k,half,mar | threshold |
| tempo_long | Tempo long | threshold | 30-40' T | hard | flat | 60 | spe | a | half,marathon | threshold |
| threshold_cruise | Cruise intervals | threshold | 4-5×8' T r1-2' | hard | flat | 55 | build,spe | i,a | 10k,half,mar | threshold |
| threshold_cruise_short | Cruise courts | threshold | 6-8×5' T r1' | hard | flat | 55 | build,spe | i,a | 10k,half | threshold |
| over_under | Over-under (alternance) | threshold | (2' T+ / 2' T-)×... | hard | flat | 55 | spe | a | 10k,half | threshold |
| tempo_progressif | Tempo progressif | tempo | 25-30' E→M→T | moderate | rolling | 50 | build,spe | i,a | half,marathon | threshold |
| fartlek_seuil | Fartlek au seuil | threshold | 5-6×(4' T/2' E) libre | hard | rolling | 50 | build,spe | i,a | 10k,half | threshold |
| threshold_hill | Seuil en côte longue | threshold | 3-4×6-8' seuil montée | hard | uphill | 55 | spe | i,a | half,mar,ultra | climbing |

## 3. VO2max
| id | nom | structure | int | terr | min | phases | niveaux | distances | target |
|---|---|---|---|---|---|---|---|---|---|
| vo2_1000 | 5×1000 m | 5×1000 I r2-3' | hard | flat | 55 | build,spe | i,a | 5k,10k | vo2max |
| vo2_800 | 6×800 m | 6×800 I r2' | hard | flat | 50 | build,spe | i,a | 5k,10k | vo2max |
| billat_30_30 | 30/30 Billat | 12-24×(30s vVO2/30s) | hard | flat | 45 | build,spe | i,a | 5k,10k | vo2max |
| billat_15_15 | 15/15 Billat | 18-30×(15s vVO2/15s) | hard | flat | 40 | build,spe | i,a | 5k,10k | vo2max |
| vo2_long_reps | Intervalles longs VO2 | 4-5×3' (1200m) I r2-3' | hard | flat | 50 | build,spe | a | 5k,10k | vo2max |
| vo2_pyramide | Pyramide VO2 | 200-400-600-800-600-400-200 I | hard | flat | 50 | spe | a | 5k,10k | vo2max |
| roche_1_1 | Roche 1/1 | 4-6×(1' I/1' jog)×2-3 | hard | rolling | 45 | build | i,a | 10k,half,ultra | vo2max |
| vo2_hill | VO2max en côte | 5-6×2-3' montée I, récup descente | hard | uphill | 50 | build,spe | i,a | 10k,ultra | climbing |
| billat_200_200 | 200/200 | 10-16×(200 I/200 jog) | hard | flat | 40 | build | i,a | 5k | vo2max |

## 4. Vitesse & économie (système `speed`)
| id | nom | structure | int | terr | min | phases | niveaux | distances | target |
|---|---|---|---|---|---|---|---|---|---|
| strides | Lignes droites | 6-8×20s accel, récup complète | moderate | flat | 25 | base,build,spe,taper | b,i,a | toutes | economy |
| hill_sprints | Hill sprints courts | 6-10×8-10s sprint côte | hard | uphill | 30 | base,build | i,a | toutes | speed |
| reps_r_200 | Répétitions R 200 | 8-10×200 R r200 jog | hard | flat | 40 | base,build,spe | i,a | 5k,10k | economy |
| reps_r_400 | Répétitions R 400 | 6-8×400 R récup complète | hard | flat | 45 | build,spe | a | 5k,10k | speed |
| sprints_alactic | Sprints alactiques | 6-8×60-80m quasi-max r2-3' | hard | flat | 30 | base,build | a | 5k,10k | speed |
| fartlek_libre | Fartlek libre | 30-40' accel libres | moderate | rolling | 40 | base,build | b,i,a | 5k,10k,half | vo2max |
| fartlek_struct | Fartlek structuré | 10×(1' vite/1' E) ou pyramide | hard | rolling | 45 | build,spe | i,a | 5k,10k,half | vo2max |
| drills | Gammes / éducatifs | 6-8 éducatifs | moderate | flat | 25 | base,build | b,i,a | toutes | economy |

## 5. Spécifique course (système `race_pace`)
| id | nom | structure | int | terr | min | phases | niveaux | distances | target |
|---|---|---|---|---|---|---|---|---|---|
| race_5k | Allure 5k | 5-6×1000 @5k r90-120s | hard | flat | 50 | spe | i,a | 5k | race_specificity |
| race_10k | Allure 10k | 4-5×2000 @10k r2' | hard | flat | 55 | spe | i,a | 10k | race_specificity |
| race_half | Allure semi | 3-4×4-5km @semi r2-3' | hard | flat | 65 | spe | a | half | race_specificity |
| race_marathon | Allure marathon (blocs) | 2-3×6-10km @M r1-2km | moderate | flat | 90 | spe | i,a | marathon | race_specificity |
| canova_special | Bloc spécial Canova | AM longue M + PM intervalles M+ | hard | rolling | 180 | spe | a | marathon,ultra | race_specificity |
| canova_extensive | Intervalles longs Canova | 3-4×6-7km @102-105%M r1km | hard | flat | 90 | spe | a | marathon | race_specificity |
| race_sim | Simulation de course | 60-90% distance @ allure cible | hard | any | 90 | spe | i,a | 10k→ultra | race_specificity |
| negative_split | Négative split | continu, 2e moitié + rapide | hard | flat | 60 | spe | i,a | half,marathon | race_specificity |
| race_blocks_long | Bloc allure dans la longue | longue E + 3-4×10' allure course | hard | rolling | 130 | spe | a | marathon,ultra | durability |

## 6-7. Trail — côtes & descente
| id | nom | sys | structure | int | terr | min | phases | niveaux | dist | target | trailOnly |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hill_short | Côtes courtes | hills | 8-10×30-45s montée vive | hard | uphill | 45 | build,spe | i,a | half→ultra | climbing | oui |
| hill_long | Côtes longues | hills | 5-6×3-5' montée seuil/I | hard | uphill | 55 | build,spe | i,a | ultra | climbing | oui |
| hill_30_30 | 30/30 en côte | hills | 12-16×(30s montée I/30s desc.) | hard | uphill | 40 | build,spe | i,a | ultra | climbing | oui |
| vert_push | Vert push (D+ continu) | hills | 600-1200 m D+ continu | hard | uphill | 75 | spe | i,a | ultra | climbing | oui |
| power_hike | Rando-course (power hiking) | hills | 60-120' marche rapide + replats | moderate | uphill | 90 | base,build,spe | b,i,a | ultra | climbing | oui |
| vert_specific | Bloc D+ spécifique course | hills | simulation D+ cible | hard | uphill | 150 | spe | a | ultra | race_specificity | oui |
| descent_reps | Répétitions descente (excentrique) | descent | 6-8×1-2' descente contrôlée | hard | downhill | 50 | build,spe | i,a | marathon,ultra | descending | oui |
| descent_tech | Descente technique | descent | 4-6×descente technique | hard | downhill | 50 | spe | i,a | ultra | descending | oui |
| descent_long | Descente longue (durabilité) | descent | 20-40' descente continue | hard | downhill | 40 | spe | a | ultra | durability | oui |

## 8. Force-endurance (système `strength`)
| id | nom | structure | int | terr | min | phases | niveaux | dist | target | trailOnly |
|---|---|---|---|---|---|---|---|---|---|---|
| hill_heavy | Côtes lourdes/lestées | 4-6×3-4' montée force, cadence basse | hard | uphill | 50 | base,build | i,a | ultra | climbing | oui |
| strength_circuit | Circuit renfo coureur | 3-4 tours squats/fentes/gainage | moderate | flat | 40 | base,build | b,i,a | toutes | economy | non |
| plyometrics | Pliométrie / sauts | 4-6 exos bonds/sauts récup complète | hard | flat | 30 | base,build | a | 5k,10k,half | economy | non |

## 9. Blocs choc / B2B (ultra)
| id | nom | sys | structure | int | terr | min | phases | niveaux | dist | target | trailOnly |
|---|---|---|---|---|---|---|---|---|---|---|---|
| b2b_long | Back-to-back longues | long | J1 2-3 h + J2 1,5-2,5 h | hard | rolling | 150 | spe | a | ultra | durability | non |
| block_choc | Bloc choc (week-end gros D+) | long | 2-3 j enchaînés volume + D+ | hard | uphill | 240 | spe | a | ultra | durability | oui |
| long_trail_specific | Longue trail spécifique terrain | long | 3-5 h terrain représentatif | moderate | any | 210 | spe | i,a | ultra | race_specificity | oui |

---

## Logique d'adaptation au profil (déterministe)

**Entrée** : `{ niveau, distanceCible, typeCourse (route|trail), phase, pointsFaibles[], terrainDispo[] }` → **sortie** : séances surfacées + score.

### A. Gating par NIVEAU (exclusions dures)
- **beginner** : exclure over_under, vo2_pyramide, sprints_alactic, reps_r_400, plyometrics, canova_*, b2b_long, block_choc, descent_long, vert_specific, long_fast_finish, negative_split. VO2 seulement format doux (30/30, roche, fartlek). Qualité ≤ 2/sem, intensité ≤ 15-20 % hebdo. Prioriser endurance/récup/strides/renfo/tempo.
- **intermediate** : exclure canova_special, canova_extensive. Introduire over_under et b2b avec prudence (1×/cycle).
- **advanced** : tout autorisé ; spécificité élevée en phase `specific`.

### B. Priorité par DISTANCE (score++)
| Distance | Prioritaire (++) | Secondaire | Sous-pondérer |
|---|---|---|---|
| 5k | vo2max, speed/economy, race_5k | threshold | long, ultra |
| 10k | vo2max, threshold, race_10k | speed | très longues, blocs trail |
| half | threshold, race_half, long_progressive | vo2max | sprints purs |
| marathon | race_pace M, long, tempo_long | vo2max léger | speed pur, vo2 lourd |
| ultra | long/B2B/block_choc, climbing, descending, power_hike | threshold, force | reps R, sprints, race_5k |

### C. Type de course
- **route** : exclure `trailOnly` (sauf terrainDispo + point faible climbing/descending). Terrain flat/rolling.
- **trail** : surfacer climbing/descending/power_hike/long_trail/threshold_hill/vo2_hill ; remplacer équivalents plats par variantes côte (tempo_run→threshold_hill, vo2_1000→vo2_hill) ; pondérer durabilité.

### D. Point faible détecté (boost +++, levier le plus fort)
`aerobic_base`→longues/à jeun ; `threshold`→tempo/cruise/over-under ; `vo2max`→1000/800/30-30/longs I ; `economy`→strides/R/gammes/plio ; `speed`→hill sprints/R400/alactiques/fartlek ; `climbing`→côtes/vert/force [trail] ; `descending`→descente reps/tech/longue **(priorité haute)** [trail] ; `durability`→progressive/fast finish/B2B/block_choc ; `race_specificity`→blocs allure/simulation ; `recovery`→récup + plus de jours faciles.

### E. Phase (filtre temporel) — quelle séance à quel moment

> **Principe (Friel) :** plus on approche de la course, plus la séance lui ressemble.
> La spécificité augmente de façon monotone ; on ne rétrograde jamais vers un type
> MOINS spécifique comme séance dominante à l'approche du jour J.

| Phase | Séances AUTORISÉES | Séances INTERDITES (et pourquoi) |
|---|---|---|
| **base** | endurance, récup, longue douce, **strides**, hill_sprints (force), gammes, fartlek libre, côtes force ; intro douce descente [trail] (amorce repeated-bout effect). | VO2max lourd, blocs race_pace, gros volume seuil — corps pas encore prêt, fonde la base aérobie d'abord (Daniels FI ; Friel Base). |
| **build** | + **vo2max** (à plat route / **en côte `vo2_hill` pour le trail**), **threshold**, fartlek structuré, côtes longues, **pic descente/excentrique [trail]**. | blocs *race-spécifiques* longs (trop tôt pour pointer la forme). |
| **specific** | + **race_pace** de la distance, blocs Canova, simulation sur terrain de course (D+/D- pour trail), B2B/vert (ultra), over-under, longues spé. | VO2max pur qui évince le race_pace ; descente neuve max trop proche de la course. |
| **taper** (affûtage) | **−40 à 60 % de volume, intensité gardée mais BRÈVE** : strides à plat (`sharpener`) / **rappels en côte (`sharpener_hill`) pour le trail**, easy sur terrain de course. | **VO2max, seuil (volume), descente/excentrique, renfo lourd, longues/B2B/blocs choc.** Aucun gain de forme en < 2 sem. : ces séances n'ajoutent que de la fatigue qui gâche la surcompensation (Bosquet 2007 ; Mujika & Padilla ; PLOS One 2023). La descente est bannie : la protection excentrique se construit AVANT, jamais dans les 10 derniers jours (Millet/Giandolini). |
| **race** | récup, hike, strides/rappels d'activation seulement. | toute vraie séance (intervalles, seuil, longue) : zéro bénéfice, pure fatigue. |

**Strides = l'outil universel d'affûtage** : autorisés à TOUTES les phases (y compris taper et semaine de course), coût de fatigue quasi nul (Daniels R-pace).

**Garde-fou code (`isTaperSafe`, planGenerator)** : en `taper`, on rejette d'office tout système ∈ {`vo2max`, `threshold`, `descent`, `strength`} **et** toute intensité `hard`. Le `sharpener` (système `speed`, jamais `vo2max`) se structure en strides — *jamais* en « X × 30 s à VMA ». Pour le trail, le sélecteur (terrain +2) préfère `sharpener_hill` (rappels en côte) au `sharpener` à plat.

**Spécificité trail (VO2max & terrain)** : pour une cible trail, la VO2max/puissance aérobie se fait **en côte** (`vo2_hill`) — même charge cardiaque à vitesse moindre, donc moins d'impact, plus de recrutement musculaire spécifique montée, pilotage à l'effort/puissance (GAP) plutôt qu'à l'allure (Uphill Athlete ; Koop ; Run Baldwin).

### F. Scoring (pseudo)
```
pour chaque séance S :
  si S.trailOnly et route et pas d'exception → SKIP
  si niveau ∉ S.niveaux → SKIP ; si phase ∉ S.phases → SKIP
  score=0
  si distanceCible ∈ S.distances → +3
  si S.système prioritaire(distance) → +2
  si S.target ∈ pointsFaibles → +4         # levier le plus fort
  si trail et S.terrain ∈ {uphill,downhill} → +2
  si S.terrain ∈ terrainDispo|any → +1
  si S.intensité==hard → −densitéQualitéSemaine
trier desc → top N en respectant 80/20 (Seiler).
```

### G. Garde-fous (invariants)
- **80/20** (Seiler) : ≥ 75-80 % easy/semaine, ≤ 20-25 % qualité. Jamais 2 `hard` consécutifs hors B2B/block_choc (advanced+specific).
- Volume **I ≤ 8 %**, **T ≤ 10 %** du hebdo (Daniels).
- B2B/block_choc/descent_long/canova → advanced + specific uniquement.
- Progressivité : côtes courtes avant longues ; descente contrôlée → technique → longue.
- Récup forcée (récup ou repos) après B2B/block_choc.

---

## Sources
Daniels (VDOT, E/M/T/I/R ; phases FI→EQ→TQ→FQ) · Canova (special block, intervalles longs M) · Billat (30/30, vVO2max) · Koop *Training Essentials for Ultrarunning* (ultra : B2B, montée/descente, spécificité, hiérarchie des besoins) · Seiler (80/20 polarisé) · Friel (périodisation de l'intensité : spécificité croissante) · Pfitzinger (*Advanced Marathoning*) · Magness (*Science of Running* : over-under, hill sprints, plio) · Uphill Athlete (force-endurance, power hiking, affûtage trail) · Roche (*Some Work All Play* : 1/1) · Fitzgerald (*80/20 Running*).

**Affûtage (périodisation des séances) :** Bosquet et al. 2007 — méta-analyse de l'affûtage ([PubMed](https://pubmed.ncbi.nlm.nih.gov/17762369/)) : réduire le volume de 41-60 %, garder intensité et fréquence. Mujika & Padilla — l'entraînement intense, clé avant/pendant l'affûtage. PLOS One 2023 — revue systématique : aucune Δ VO2max/économie en affûtage (le gain vient de la levée de fatigue) ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/)).

**Trail (spécificité & excentrique) :** Millet/Giandolini — fatigue neuromusculaire & dommages excentriques en trail ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6282050/)) ; *repeated-bout effect* : une descente protège plusieurs semaines, dernier gros descente 14-21 j avant la course, zéro excentrique dans les 10 derniers jours. VO2max en côte : spécificité + moindre impact ([Uphill Athlete](https://uphillathlete.com/trail-running/tapering-for-race-event-what-to-do/), [TrainRight/Koop](https://trainright.com/hierarchy-ultramarathon-training-needs-jason-koop/)).
