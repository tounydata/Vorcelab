# Base de connaissance — gaps & méthodes récentes (route & trail)

> Synthèse de 4 audits (route · trail/ultra · transverse · revues récentes 2021-2026).
> Compare notre bibliothèque (`workouts.ts`, ~47 séances) à la littérature et liste ce qui
> **manque** + les **méthodes nouvelles** exploitables de façon déterministe. Sources en §6.

## 0. Périmètre (cadrage produit)
- **Vorcelab = 5K et plus** : route 5k/10k/semi/marathon + trail/ultra. **Le demi-fond et le sprint (100 m → 1500 m/mile) sont HORS périmètre** — donc « pas de bucket 800/1500/mile » et « pas de tier capacité anaérobie/tolérance lactique » **ne sont PAS des gaps** : c'est un choix assumé. `DistanceFocus = 5k|10k|half|marathon|ultra` reste tel quel.
- On garde malgré tout les qualités **neuromusculaires/économie** utiles dès le 5K (strides, R courts, sprints en côte, overspeed) — sans en faire un moteur de demi-fond.

## 0bis. Constats structurants
- **Dérive doc↔code** : `session-library.md` annonce 57 séances, le code en a **47** ; ids périmés (`descent_reps`, `hill_long/short`) → source de vérité cassée à réaligner.
- **Beaucoup de savoir déjà en prose** (`knowledge-base.md`) **non opérationnalisé** en séances/dimensions (descente excentrique, gut 60-120 g/h, chaleur, VAM, durabilité).

---

## 1. Séances/dimensions manquantes — ROUTE (5K → marathon)
> Le demi-fond (800/1500) est exclu — les lignes ci-dessous valent pour **5k+**.

| Pri | Ajout | Qualité | Distances | Gabarit 1-ligne |
|---|---|---|---|---|
| P1 | `sub_threshold` / `double_threshold` | LT1 vs LT2 (norvégien, contrôlé) | 5k→marathon | sous-seuil 6×6 min @ 2-3 mmol (ou HR LT1↔LT2) ; double AM 5×6 min + PM 10×1000 |
| P1 | `specific_endurance` (Canova court) | spécificité course | 5k,10k | 6-8×1000 @ 95-100 % allure course, récup décroissante |
| P1 | `float_recovery` | clairance lactique | 5k-semi | 5-6×1000 @ 5-10k, 400 m « float » sous seuil (pas trot) |
| P1 | `time_trial` / test | benchmark + recalibrage VDOT/CS | toutes | 3-5 km all-out ou 30 min CLM, toutes 4-6 sem |
| P2 | `downhill_strides` | économie/vitesse de jambe | 5k→semi | overspeed −3 à −5 %, relâché, récup complète |
| P2 | **dimension `pacing`** (target) | discipline d'allure | 5k→marathon | négatif-split, calibration RPE ; promouvoir `negative_split` ici |

**Nettoyage catalogue** : séparer cible `aerobic_threshold (LT1)` vs `threshold (LT2)` (tempo/threshold conflés) ; re-taguer `fartlek_libre`→aérobie ; renommer `canova_special/extensive`→`canova_marathon_*`.

---

## 2. Séances/dimensions manquantes — TRAIL / ULTRA
| Pri | Ajout | Qualité / cible | Gabarit |
|---|---|---|---|
| P0 | `fuel_long` (gut-training) | tolérance GI / 50k-100mi | 2-3 h @ effort course, glucides g/h programmés (glu:fru), progressif |
| P0 | `me_uphill` (Uphill Athlete) | force-endurance jambes / montagne | sac 10-20 % PdC, 60-90 min Z3-Z4 en côte (ou circuit gym) |
| P0 | **VAM + GAP en cibles** (dim.) | quantifier la montée | bande VAM par séance (amateur 400-700) ; allure ajustée pente |
| P1 | `vk_specific` | km vertical / skyrace | 2×20 min ou 3×10 min @ ≥20-25 %, 80-90 % FCmax |
| P1 | `downhill_eccentric_prep` (early/easy) | inoculation excentrique (RBE) | 30-45 min descente facile −10/−17 %, ≥ 6-8 sem avant, pas en taper |
| P1 | **technicité terrain + type de course** (dim.) | spécificité | `technicality: smooth/moderate/technical` ; `dplusPerKm`, runnable vs vertical |
| P1 | `heat_session` (bloc) | thermorégulation / ultras chauds | sauna 15-20 min ×7-10 j, fin vers le taper |
| P2 | `technical_agility`, `pole_technique` | skill descente/montée | footwork terrain technique ; double-bâton |
| P2 | **stratégie courir/marcher** (dim.) | pacing trail | grade de transition + flag de séance |
| P3 | `night_run`/`kit_sim` (flags) | spécificité expérientielle 100k+ | variantes de `long_trail_specific` |

---

## 3. Dimensions transverses manquantes (route + trail)
| Pri | Dimension | Pour qui | Élément programmable |
|---|---|---|---|
| P0 | **Retour-de-blessure walk-run** | blessés, débutants | générateur walk-run gated par règle douleur + ré-ramp ACWR ; de-rate post-coupure |
| P0 | **Périodisation de la force** (pas juste `strength_link`) | tous | `strength_phase` : adaptation anatomique→max→puissance/plyo→maintien, mappé aux phases |
| P0 | **Cross-training** (vélo/elliptique/aquajogging) | blessés, masters, fort IMC, gros volume | type `cross_training` + équivalence TSS → CTL/ACWR ; substitution auto si surcharge |
| P1 | **Échelle pliométrique + masters** | tous, 40+ | `plyo_low/moderate/high` gated niveau ; maintien puissance toute l'année pour 40+ |
| P1 | **Économie / cadence** | tous | `cadence_target` (+5 % vs SPM Strava) + échelle d'éducatifs ; cadre « levier blessure, pas garantie de vitesse » |
| P1 | **Pacing / calibration RPE** | intermédiaire+ | sorties à finish accéléré, reps « cours à tel RPE » puis score d'écart |
| P1 | **Profils de population** | masters, jeunes (PHV), fort IMC, femmes | couche de modificateurs (récup, plafonds volume/impact, gating plyo) |
| P2 | **Fueling en séance** | marathon/ultra | attribut `fueling_practice` sur longues : g/h glucides progressifs |
| P2 | **Prep environnementale** (chaleur/altitude) | route estivale, trail | bloc auto-planifié vs date course |

---

## 4. Méthodes récentes (2021-2026) à intégrer — usage déterministe
| Pri | Méthode | Hook déterministe dans le moteur | Preuve |
|---|---|---|---|
| 1 | **Critical Speed (CS) / D′** | 2-3 efforts max (3MT…) → CS = ancre seuil ; modèle de bilan D′ pour dimensionner reps/récup ; **garde-fou d'allure course ≤ CS** (prédit le « crash ») | 2024-25, **solide** |
| 2 | **Durabilité / découplage** | découplage pace:HR sur **chaque sortie longue** (< 5 % bon) ; test LT en état fatigué ; insérer des reps en fin de longue si la tendance se dégrade ; **gate de readiness course** | 2022-25, **émergent-fort** (clé trail/ultra) |
| 3 | **Distribution d'intensité état-dépendante** | **pyramidal** en base/gros volume & moins entraînés ; **polarisé** en bloc d'affûtage court (≤ 8-12 sem) pour avancés ; volume + plafond easy = variables primaires | méta 2024, **solide** (tue le dogme « polarisé toujours mieux ») |
| 4 | **Glucides + gut-training** | cible par durée : < 2 h 60 g/h · 2-3 h 75-90 · > 3 h jusqu'à 90-120 **si gut-trained** ; ratio **1:0.8** glu:fru au-delà de 60 ; progression +10 g/h/sem gated par score GI | 2022-24, **solide** (120 g/h = élite) |
| 5 | **Sous-seuil contrôlé (norvégien)** | séances bornées 2-3,5 mmol (ou HR LT1↔LT2) ; auto-correction « couru trop vite » −1-2 % ; double-jour gated par volume + 48 h | 2023-24, **cadre solide, doublage non prouvé** |
| 6 | **HRV-guided (gate, pas optimiseur)** | ln-RMSSD matin vs bande SWC 7 j → feu vert/modifier/récup ; baseline ≥ 4 sem | RCTs 2021-23, **modéré** |
| 7 | **Score de readiness + TID par intention** | somme pondérée **transparente** (HRV+sommeil+FC repos+ACWR+RPE) → vert/ambre/rouge ; calculer la TID par **but de séance**, pas « temps en zone » | 2023-25, **émergent**, garder auditable |
| 8 | **Force (route)** | **lourd ≥ 80 % 1RM** si allures rapides / VO2max élevé ; **plyo** si allures lentes ; 2×/sem, ≥ 6 sem, sur jours durs | méta 2024, **modéré** |
| 9 | **Chaleur/altitude** | doses (chaleur ≥ 35 °C 50-60 min ×5-10 ; LHTL 2200-2500 m) ; de-rate HR/allure ; finir le bloc 2-3 sem avant | 2023-25, **solide** (« chaleur = altitude du pauvre ») |
| 10 | **Super-shoes (AFT)** | tag chaussure/séance → offset économie **1,5-3 %** sur les zones ; modif récup prudente ; **garder les plafonds de charge** | économie solide ; blessure/récup **incertain** |
| 11 | **Garde-fous REDs** | score de risque REDs + garde-fou EA (bloquer la hausse si < 30 kcal/kg FFM/j) ; deload symptomatique | consensus IOC 2023, **solide** |
| — | **À NE PAS coder en dur (faible/hype)** | périodisation par phase du cycle menstruel ; zones pilotées par lactate-sudoral ; allégations blessure/récup des super-shoes | — |

---

## 5. Restauration : liste de produits nutrition (perdue en migration React)
- **Legacy** (`legacy/nutrition.js`) : catalogue ~35 produits (Näak, Maurten, TA, Decathlon, Nduranz, Baouw, Nutripure) avec `carbs/caféine/eau/notes` ; l'user **cochait** ses produits (`nutrition_products`) → utilisés par la **stratégie de course**.
- **React** : remplacé par un seul `nutrition_level` ; la colonne **`nutrition_products` existe mais est orpheline** (jamais lue/écrite).
- **À faire** : reporter le catalogue en TS, **case à cocher dans le Profil** (écrit `nutrition_products`), rebrancher dans la stratégie de course (plan de ravito basé sur **les vrais produits** + g/h). Borné, gros gain produit.

---

## 6. Feuille de route consolidée (ré-priorisée)
- **P0 (socle moteur)** : réviser la modulation v3 selon `adaptation-engine-spec.md` §2 ; **CS/D′** (ancre de zones + garde-fou d'allure) ; **durabilité/découplage** sur les longues ; **retour-de-blessure** walk-run ; fixer dérive doc↔code + split LT1/LT2. *(Demi-fond hors périmètre.)*
- **P1** : charge persistée (sRPE-load partout) + spike-guard + décharges 3:1 ; **gut-training + cibles glucides par durée** ; **restauration produits nutrition** ; force périodisée ; TID état-dépendante ; cross-training dans la charge ; séances trail clés (`me_uphill`, `fuel_long`, `vk_specific`, `downhill_eccentric_prep`).
- **P2** : dimensions trail (VAM/GAP cibles, technicité, type de course, courir/marcher) ; chaleur ; pacing/RPE ; cadence/économie ; populations.
- **(P3 capteurs — exclu pour l'instant)** : HRV-guided, readiness score, core-temp ; menstruel **non codé en dur**.

## 7. Sources (extraits)
Norvégien : sjsp.aearedo.es, marathonhandbook. TID méta 2024 : PMC11329428 ; ML responders : nature s41598-025-25369-7. Durabilité : japplphysiol.00343.2025, PMC11889008. CS/D′ : PMC11933073, runningwritings 2024. Glucides : PMC9560939, practicalgastro 2023. Super-shoes : PMC12821614, nature s41598-025-03029-0. Chaleur/altitude : JP289874 (2025), IJSPP 2024. Force : s40279-024-02018-z, PMC11052887. HRV : PMC7432021, tandfonline 2023. REDs : redinsport.org (BJSM 2023). Demi-fond : s40279-021-01481-2, Bakken mariusbakken.com, Oztrack. Trail : Uphill Athlete (ME), Koop trainright (descente/chaleur), Strava VAM/GAP. Transverse : PMC (cadence/plyo/proprio/return-to-run/cross-training), World Athletics (PHV).
