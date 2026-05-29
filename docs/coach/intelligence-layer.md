# Coach Vorcelab — Couche 2 : Coach Intelligence Layer

> Deuxième couche de la base de connaissances. La couche 1 (`knowledge-base.md`) couvre le socle
> d'entraînement classique. **Cette couche rend le plan personnel, sûr et réellement suivable** —
> c'est ce qui sépare une app correcte des meilleures.
>
> Format par section : **Variables** (entrées du moteur) · **Règles IF/THEN** (codables) ·
> **Niveau de preuve** · **Priorité** · **Impact sur le plan** · **Exemple concret**.
>
> Conventions de preuve : `[Établi]` science solide · `[Consensus]` consensus de coachs / preuve modérée ·
> `[Heuristique]` pratique terrain / preuve faible. Priorité : `P0` sécurité (prime sur tout) ·
> `P1` performance · `P2` confort/personnalisation.
>
> ⚠️ **Cadre sécurité (lire avant de coder).** Ce moteur **n'est pas un dispositif médical** et ne
> pose **aucun diagnostic**. Sur tout signal de blessure sérieux il **réduit la charge et oriente vers
> un professionnel** — il ne « soigne » pas. Les règles douleur/blessure ci-dessous sont des adaptations
> de charge prudentes, pas des prescriptions cliniques. La sécurité (P0) prime toujours sur la performance.

---

## 1. Athlete profiling

Le moteur construit un **profil multi-axes** à partir des données Strava + déclaratif. Chaque profil
n'est calculé que si la confiance des données suffit (voir §9).

### 1.1 Profil physiologique
**Variables** : `vo2max_est` (estimé via VDOT/vVO2max), `lthr`, `aet_hr`, `ant_hr`, `fc_max`, `fc_repos`,
`vma`, `vdot`, `aet_ant_spread = ant_hr/aet_hr`, `efficiency_factor` (allure/FC), `decoupling_pct`.
**Règles**
- `[Consensus][P1]` SI `aet_ant_spread < 1,10` → base aérobie sous-développée → biais pyramidal/volume Z1.
- `[Établi][P1]` SI `vdot` connu (course récente <6 sem) → dériver toutes les allures de VDOT ; SINON dériver de VMA (moins précis).
- `[Consensus][P1]` SI `efficiency_factor` en hausse sur 6 sem à FC égale → économie qui progresse → maintenir le cap.
**Impact plan** : fixe les zones, les allures de séance, le choix du modèle de périodisation.
**Exemple** : AeT 145, AnT 158 → spread 1,09 → moteur prescrit +1 longue Z1/sem, réduit l'intensité jusqu'à élargir l'écart.

### 1.2 Profil trail
**Variables** : `vam_by_grade{mild/mod/steep_up}` (m/h par tranche de pente), `descent_speed_by_grade`,
`climb_share` (% du volume en montée), `tech_exposure` (% terrain technique), `flat_vs_trail_ratio`.
**Règles**
- `[Consensus][P1]` SI `vam_steep_up` < p25 du profil ET montée = point faible course → bloc côtes (voir §6).
- `[Consensus][P1]` SI `descent_speed` faible + `cardioCost` bas en descente → limite = musculaire, pas cardio → renfo excentrique + descente dosée (voir §2, §7).
**Impact plan** : pondère côte vs descente vs plat selon le profil de la course cible.
**Exemple** : coureur fort en montée (VAM 850 m/h) mais lent en descente → moteur déplace du volume vers descente technique dosée.

### 1.3 Profil de récupération
**Variables** : `post_climb_hr_recovery` (bpm/min), `hr_drift_typical`, `days_to_baseline_after_long`,
`hrv_baseline` + `hrv_sd` (si dispo), `typical_dom_duration`.
**Règles**
- `[Consensus][P1]` SI récupération post-côte lente (relance < normale) → espacer les séances qualité de +1 jour.
- `[Heuristique][P2]` SI `days_to_baseline_after_long` > 3 → réduire la fréquence des longues à 1/10 j au lieu de 1/7 j.
**Impact plan** : densité des séances dures, placement des jours faciles.

### 1.4 Profil de risque blessure
**Variables** : `acwr`, `weekly_ramp_pct`, `monotony` (Foster : moyenne/écart-type de charge journalière),
`strain = charge_hebdo × monotony`, `injury_history[]`, `surface_change_flag`, `chronic_load_ctl`.
**Règles**
- `[Consensus][P0]` SI `acwr ≥ 1,5` OU `weekly_ramp_pct > 30 %` → drapeau risque → plafonner la semaine suivante (voir §2.4).
- `[Consensus][P1]` SI `monotony > 2,0` → trop d'uniformité → forcer la variation dur/facile (polariser).
- `[Établi][P1]` `ctl` élevé = protecteur (« fit but tired beats unfit and fresh ») → tolérer des pics ponctuels si CTL solide.
**Impact plan** : plafonds de progression, déclenchement des décharges.
**Exemple** : ramp +35 % + monotony 2,3 → moteur impose une semaine plate + alternance dur/facile.

### 1.5 Profil de régularité (adhérence observée)
**Variables** : `sessions_planned_vs_done_4w`, `avg_sessions_per_week_real`, `skip_pattern` (quels jours sautés),
`longest_streak`, `volume_variance_week_to_week`.
**Règles**
- `[Heuristique][P2]` SI `done/planned < 70 %` sur 4 sem → le plan est trop ambitieux → réduire le nombre de séances cible (voir §10).
- `[Heuristique][P2]` SI un jour de semaine est systématiquement sauté → ne plus y placer de séance clé.
**Impact plan** : calibre le réalisme du plan sur le comportement réel, pas l'idéal.

---

## 2. Injury and pain adaptation  *(P0 — sécurité prime)*

**Variables** : `pain_zone` (enum), `pain_level` (0-10), `pain_timing` (avant/pendant/après/au repos),
`pain_trend` (↑/→/↓ sur 3 sorties), `pain_with_swelling` (bool), `night_pain` (bool), `days_since_onset`.

### 2.1 Zones douloureuses fréquentes (cartographie → séances à risque)
| Zone | Suspicion fréquente (NON diagnostic) | Séances à éviter | Alternatives |
|---|---|---|---|
| Genou antérieur | syndrome fémoro-patellaire | descente, pliométrie, côtes raides | vélo/elliptique, plat doux, renfo quadri isométrique |
| Tendon d'Achille | tendinopathie achilléenne | côtes, pliométrie, vitesse | plat à plat, renfo mollet excentrique progressif |
| Tibia (face interne) | périostite/stress tibial | volume, surfaces dures, vitesse | réduction volume, surfaces souples, aqua-jogging |
| Fascia plantaire | fasciite plantaire | longues, côtes | vélo, renfo pied, réduction volume |
| ITB (genou externe) | syndrome de l'essuie-glace | longues, descente | plat court, renfo hanche/fessier |
| Ischio (haut) | tendinopathie proximale | vitesse, longues, côtes | plat doux, excentrique léger contrôlé |

### 2.2 Séances à éviter / 2.3 alternatives — règles
- `[Consensus][P0]` SI `pain_zone` connu → retirer du plan les séances marquées « à risque » pour cette zone et substituer l'alternative à charge équivalente (cross-training).
- `[Heuristique][P1]` Substitution iso-charge : remplacer une séance course par vélo/elliptique/aqua de durée ajustée (≈ +30-50 % de durée pour charge équivalente, faible impact).

### 2.4 Règles de réduction de charge (douleur)
- `[Consensus][P0]` SI `pain_level ≤ 3` ET `pain_trend` non-↑ ET pas au repos → poursuivre en surveillant, −20 % volume sur la zone sollicitée.
- `[Consensus][P0]` SI `pain_level 4-6` OU douleur **pendant** la course qui modifie la foulée → stopper les séances à impact, cross-training only, −50 % charge.
- `[Consensus][P0]` SI `pain_level ≥ 7` OU `night_pain` OU `pain_with_swelling` OU douleur **au repos** → **stop course + orienter vers un professionnel de santé** (drapeau rouge, jamais de diagnostic).
- `[Établi][P0]` Douleur osseuse localisée + gonflement + nocturne = motif d'arrêt et d'avis médical (suspicion fracture de fatigue).

### 2.5 Critères de reprise
- `[Consensus][P0]` Reprise SI douleur 0/10 au quotidien ≥3 j ET test marche/footing court indolore.
- `[Heuristique][P1]` Reprise progressive : run-walk, volume = 25-50 % d'avant arrêt, +10-15 %/sem, pas d'intensité avant 2 sem sans douleur (croise §A.3 couche 1 : retour de coupure).
**Impact plan** : peut suspendre/réécrire tout le bloc en cours ; reconstruit une rampe douce.
**Exemple** : douleur Achille 4/10 pendant les côtes → moteur retire côtes+pliométrie 2 sem, ajoute mollet excentrique, remplace côtes par tempo plat, réévalue.

---

## 3. Recovery and readiness (adaptation quotidienne)

Calcule un **score de readiness** (0-100) agrégeant des sous-signaux pondérés, puis applique une action.

**Variables** : `sleep_h`, `sleep_quality` (1-5), `stress` (1-5), `subjective_fatigue` (1-5),
`doms` (0-10, + localisation), `hrv_today` vs `hrv_baseline±SWC`, `resting_hr` vs baseline,
`illness_flag` (gorge/fièvre/etc.), `hard_physical_work_today` (bool/intensité), `motivation` (1-5).

**Règles (ordre de priorité)**
- `[Établi][P0]` SI `illness_flag` avec fièvre OU symptômes sous le cou (poitrine/corps) → **repos complet** (règle « above-the-neck » : symptômes au-dessus du cou = footing easy toléré ; en dessous = repos).
- `[Établi][P1]` SI `hrv_today` < baseline−SWC (moy. 7 j) → remplacer la séance dure du jour par easy/repos (cf. couche 1 §A.5).
- `[Consensus][P1]` SI `sleep_h < 6` deux nuits de suite OU `sleep_quality ≤ 2` → pas de séance qualité aujourd'hui, easy.
- `[Consensus][P1]` SI `doms ≥ 6` sur le groupe ciblé par la séance → reporter la séance ou changer de système (ne pas charger un muscle endolori, surtout excentrique/plio).
- `[Heuristique][P2]` SI `hard_physical_work_today` (déménagement, métier physique) → traiter comme charge ajoutée → downgrader d'un cran l'intensité prévue.
- `[Heuristique][P2]` SI `stress ≥ 4` ET `motivation ≤ 2` → proposer une séance plus courte/ludique pour préserver l'adhérence (mieux qu'un zéro).

**Score readiness → action** : `≥75` séance prévue OK · `50-74` downgrade d'un cran (dur→modéré, modéré→easy) · `<50` easy/repos.
**Impact plan** : ajuste **la séance du jour** sans casser la structure hebdo ; si downgrade répété ≥3 j → revoir la charge du bloc (escalade vers §1.4/§6).
**Exemple** : sommeil 5 h + HRV basse + DOMS quadri 7 → readiness 42 → la séance VO2max devient footing easy 40 min ; la VO2max est replanifiée +2 j.

---

## 4. Trail technicality

**Variables (par segment et agrégé course)** : `tech_score` (0-100), `surface` (route/piste/sentier/rocaille/neige),
`avg_grade`, `grade_distribution`, `runnable_pct` (% sous le seuil de pente runnable), `tech_descent_pct`,
`gps_roughness` (variabilité cap/altitude).

**Calcul `tech_score`** `[Heuristique]` : combinaison pondérée de surface (coef rocaille>sentier>piste>route),
densité de virages/variabilité de cap, % de pente >25 %, et `gps_roughness`. Normalisé 0-100.

**Seuil runnable** `[Consensus]` : montée **runnable jusqu'à ~15-20 %**, au-delà le power-hike devient plus
économique (croise §5). Descente technique = pente raide **+** surface non lisse.

**Règles**
- `[Consensus][P1]` SI course cible `tech_descent_pct` élevé → ajouter descente technique dosée dans le bloc spé (cf. couche 1 : repeated-bout, ≥72 h entre séances descente).
- `[Consensus][P1]` SI `runnable_pct` faible (course très raide) → prescrire entraînement spécifique power-hike (montée bâtons/mains sur cuisses) plutôt que course en côte.
- `[Heuristique][P1]` Le `tech_score` **majore la charge** d'une sortie : `charge_ajustée = charge_base × (1 + k·tech_score/100)` (k≈0,15-0,25, à caler) — le terrain technique coûte plus que le D+/distance seuls ne le disent (cf. caveat GAP couche 1).
- `[Heuristique][P2]` SI l'athlète s'entraîne surtout sur route mais course technique → insérer des sorties sentier dédiées (habituation cheville/proprioception).
**Impact plan** : choix des séances spécifiques, ajustement de la charge perçue, contenu de la longue.
**Exemple** : course 60 % non-runnable → moteur remplace « côtes en courant » par séances power-hike chronométrées + renfo, et majore la charge des sorties techniques de ~20 %.

---

## 5. Race strategy

**Variables** : `race_dist`, `race_dplus`, `race_tech_score`, `target_time` ou `goal=finish`,
`segments[]` (issus du découpage GPX : dist, D+, D−, pente, tech), `runner_profile` (§1), `weather_forecast`,
`aid_stations[]`, `crew_points[]`.

### 5.1 Pacing
- `[Consensus][P1]` **Marathon/route** : pacing régulier ou léger negative split ; cible une fraction de VMA/VDOT soutenable selon durée.
- `[Consensus][P1]` **Trail** : pacing par **effort/puissance‑grade**, pas par allure (l'allure varie avec la pente). Cible une intensité < seuil sur les premières heures.
- `[Établi][P1]` **Ultra** : départ délibérément conservateur (les meilleurs finishers ralentissent moins, pas accélèrent) ; cible Z1-bas Z2 sur les premières heures, gestion de la dérive.

### 5.2 Power-hike
- `[Consensus][P1]` SI pente segment **> 15-20 %** OU coût marche < coût course (selon profil) → prescrire power-hike sur ce segment ; estimer le temps via VAM de marche, pas allure de course.
- `[Heuristique][P2]` Entraîner le power-hike spécifiquement si la course en contient beaucoup (cf. §4).

### 5.3 Nutrition / hydratation (plan par segment)
- `[Établi][P1]` Glucides **60-90 g/h** (jusqu'à 120 pour ultra entraîné), répartis par segment selon durée estimée ; nécessite glucose+fructose au-delà de 60 g/h.
- `[Établi][P1]` Hydratation **500-1000 mL/h**, **~500-1000 mg sodium/h** (≈1500 mg/L), **majorée par la chaleur** (croise météo).
- `[Heuristique][P1]` Caler les prises sur les ravitos/crew points (§ découpage) → produire une **fiche par ravito** (déjà aligné avec le crew plan existant).

### 5.4 Découpage GPX
- `[Consensus][P1]` Segmenter par changement de pente/terrain (réutilise `buildDetailedSections` en prod) ; pour chaque segment estimer temps (VAM montée + vitesse descente/plat du profil + pénalité Minetti + tech) et cumul.
**Note** : le moteur de projection existe déjà (`computeRaceProjection`) — la Race Strategy s'appuie dessus, ne le réinvente pas.

### 5.5 Gestion montée/descente
- `[Consensus][P1]` Montée = gérer l'effort cardio (ne pas dépasser le seuil tôt) ; descente = gérer le coût **musculaire** (préserver les quadriceps pour la fin, cf. durabilité).
**Impact plan** : produit le plan de course (pacing + nutrition + power-hike + fiches crew) ; alimente aussi la sélection des séances spécifiques en amont.
**Exemple** : ultra 70 km / 4000 D+ chaud → segments découpés, power-hike >18 %, 80 g/h glucides + 800 mg sodium/h majorés chaleur, négatif split visé, fiche par ravito.

---

## 6. Training blocks

Chaque bloc = `{type, durée, objectif, contenu, progression, risques, prérequis}`. Le moteur enchaîne les blocs
selon la périodisation (couche 1 §1) et la distance/le profil.

| Bloc | Durée | Objectif | Progression | Risques principaux |
|---|---|---|---|---|
| **Base** | 4-12 sem | volume aérobie, décantation, économie | volume ↑ ≤10 %/sem, intensité basse (Z1/Z2) | ennui, négliger l'intensité |
| **Seuil** | 4-6 sem | repousser LT2 | durée au seuil ↑ (ex 4×8→4×12 min) | accumulation de fatigue si trop fréquent |
| **VO2max** | 3-5 sem | puissance aérobie max | volume à I ↑ (15→20 min) | haute charge neuro, blessure si fatigue |
| **Côte** | 3-5 sem | force-vitesse spécifique montée | pente/durée ↑, D+ ≤+20 %/sem | Achille/mollet |
| **Descente** | 3-6 sem (tôt) | durabilité musculaire excentrique | dose ↑ très progressive, ≤2/sem ≥72 h | DOMS, dommages si trop vite |
| **Ultra/spécifique** | 4-8 sem | time-on-feet, back-to-backs, nutrition | volume/B2B ↑, simulation course | surcharge, sous-récupération |
| **Taper** | 1-3 sem (selon dist) | retrait fatigue | volume −41 à −60 %, intensité maintenue | trop couper (perte de feel) |
| **Retour blessure** | variable | reprise sûre | run-walk → volume 25-50 % → +10-15 %/sem, intensité après 2 sem indolore | rechute si trop rapide (P0) |

**Règles**
- `[Consensus][P1]` Séquence par défaut : Base → (Côte/Descente tôt) → Seuil → VO2max/Spécifique → Taper → Course.
- `[Consensus][P0]` Bloc descente **avant** la phase spécifique (repeated-bout protège ; économie altérée 5 j après).
- `[Heuristique][P1]` Un seul système « dur » dominant à la fois (éviter de cumuler VO2max + descente lourde + côtes la même semaine).
**Impact plan** : c'est l'ossature ; les §1-5 modulent le contenu, les §2-3 peuvent suspendre/réécrire.
**Exemple** : 16 sem vers un trail montagneux → 6 base (avec descente dosée dès S3) → 4 côte/seuil → 4 spé D+ → 2 taper.

---

## 7. Ability model (capacités + détection faiblesses + prescription auto)

Le moteur note chaque capacité **0-100** avec un **niveau de confiance** (§9), compare au profil de la
**course cible**, et prescrit pour combler l'écart le plus pénalisant.

| Capacité | Variable / proxy | Détection faiblesse | Prescription auto |
|---|---|---|---|
| Endurance aérobie | CTL, longue max, décroissance fin de longue | longue plafonne, fade tardif | ↑ volume Z1, longues progressives |
| Seuil (LT2) | allure/FC au seuil, durée tenable | seuil bas vs distance cible | bloc seuil (§6) |
| VO2max | vVO2max/VMA, perf reps courtes | VMA basse | bloc VO2max |
| Économie | EF (allure/FC), coût à allure donnée | EF stagnant | renfo lourd + pliométrie (croise §10 couche1) |
| Montée | VAM par pente (§1.2) | VAM steep_up < cible course | bloc côte, power-hike si non-runnable |
| Descente | vitesse descente, dérive descente | lent + cardio bas en descente | descente dosée + renfo excentrique |
| Durabilité | decoupling, fade sur longues | decoupling >5-10 % | volume aérobie + intensité/renfo en fin de longue |
| Nutrition | g/h tolérés à l'entraînement | tolérance < besoin course | gut training 6-8 sem |
| Chaleur | perf/FC en conditions chaudes | dérive forte à la chaleur | acclimatation 7-10 j avant course chaude |

**Règles**
- `[Consensus][P1]` Calcul de l'écart `gap = besoin_course − capacité` par axe ; trier par `gap × poids_course` (le poids dépend du profil de la course : un 100 mi pondère durabilité/nutrition, un KV pondère montée).
- `[Consensus][P1]` Prescrire pour **le plus gros gap pondéré** d'abord, **un axe dominant par bloc** (cohérent §6).
- `[Heuristique][P2]` Ne prescrire que si confiance données suffisante (sinon proposer un field test §8 d'abord).
**Impact plan** : pilote le choix et l'ordre des blocs et le contenu des séances.
**Exemple** : course 100 km/chaude ; gaps = durabilité 40, nutrition 35, chaleur 30 → blocs spécifiques + gut training + acclimatation programmés dans cet ordre.

---

## 8. Field tests

Le moteur **propose** des tests quand une donnée manque ou est périmée, et **met à jour les zones** avec le résultat.

| Test | Protocole | Fréquence | Met à jour |
|---|---|---|---|
| FCmax | côte longue progressive max OU 2-3×3 min all-out (sécurisé) | 1×/saison ou si incohérent | toutes les zones FC |
| LTHR | CLM 30 min solo, moy FC 20 dern. min | toutes 6-8 sem | seuil, zones FC %LTHR |
| VMA / vVO2max | demi-Cooper, Vameval, ou 6 min max | toutes 6-10 sem | allures I/R, VMA-anchors |
| AeT | nez-respiration progressif (Uphill Athlete) OU decoupling ≤5 % | toutes 8-12 sem | borne haute Z2, spread AeT/AnT |
| VAM | montée référence chronométrée à effort donné | toutes 6-8 sem (en bloc côte) | profil trail §1.2 |
| Decoupling | longue régulière ≥60-90 min, calcul (EF₁−EF₂)/EF₁ | mensuel sur une longue | durabilité §7, readiness base |
| Descente | descente référence chronométrée + DOMS J+1 | début/fin bloc descente | profil descente, dosage |
| Nutrition | longue avec dose g/h cible + tolérance GI notée | pendant gut training | tolérance nutrition §7 |

**Règles**
- `[Consensus][P1]` SI une zone repose sur une donnée > sa période de péremption → proposer le test correspondant (sans bloquer le plan).
- `[Consensus][P0]` Test FCmax/VO2max **uniquement si readiness OK et pas de drapeau douleur** (un test est une séance dure).
- `[Heuristique][P2]` Caler les tests sur les transitions de bloc (début de bloc côte → test VAM).
**Impact plan** : remplace une séance qualité par le test ; recalibre les zones → recalcule les allures cibles.
**Exemple** : LTHR vieux de 10 sem → moteur insère un test seuil à la place de la séance seuil de la semaine, puis met à jour toutes les zones %LTHR.

---

## 9. Data confidence

Toute donnée porte un **niveau de confiance** ; les règles dégradent gracieusement quand la confiance baisse.

**Variables** : `hr_confidence` (capteur optique vs ceinture, dropouts), `gps_confidence` (précision, tunnels, forêt),
`dplus_confidence` (baro vs GPS — le D+ GPS est notoirement bruité), `pace_confidence` (GPS + terrain),
`stream_coverage` (% de la séance avec streams), `data_age`.

**Règles**
- `[Établi][P1]` `dplus` GPS non barométrique → confiance basse → préférer le D+ de la trace officielle de course si dispo ; lisser le D+ des activités.
- `[Consensus][P1]` SI `hr_confidence` basse (FC optique avec décrochages) → ne pas piloter une séance à la FC seule → fallback allure/RPE.
- `[Consensus][P1]` SI une métrique manque (ex pas de FC) → utiliser le proxy disponible (RPE, allure-grade) et **abaisser la confiance du profil correspondant** (§1) plutôt que d'inventer.
- `[Heuristique][P1]` SI `stream_coverage < 50 %` sur une activité → ne pas l'utiliser pour calibrer VAM/decoupling (déjà la logique de `computeRaceProjection`).
- `[Consensus][P2]` Afficher la confiance à l'utilisateur (« profil fiable / partiel / à confirmer ») et proposer un field test (§8) pour monter la confiance.
**Impact plan** : pas de décision agressive sur donnée douteuse ; le moteur demande un test ou utilise un défaut prudent.
**Exemple** : montre à FC optique bruitée → readiness et zones basculent sur allure-grade + RPE, profil physio marqué « partiel », test LTHR suggéré.

---

## 10. Adherence and personalization

Le meilleur plan théorique est inutile s'il n'est pas suivi. Cette section **rend le plan réaliste**.

**Variables** : `available_days[]` (jours + créneaux), `max_session_min_per_day`, `long_run_day`,
`equipment_access`, `terrain_access` (route/piste/sentier/montagne proche), `pref_session_types`,
`work_constraint` (horaires, métier physique), `family_constraint`, `travel_weeks[]`,
`mental_load` (1-5), `observed_adherence` (§1.5).

**Règles**
- `[Heuristique][P1]` Le plan ne place de séances que sur `available_days` ; la longue va sur `long_run_day`.
- `[Heuristique][P1]` SI `nb_jours_dispo < nb_séances_idéal` → prioriser : 1 longue + 1 qualité spécifique au gap dominant (§7) + le reste en easy ; sacrifier d'abord les séances à plus faible ROI.
- `[Heuristique][P2]` SI `observed_adherence < 70 %` (§1.5) → réduire d'une séance/sem et raccourcir, jusqu'à retrouver >85 % (mieux vaut un plan suivi à 90 % qu'un plan parfait suivi à 60 %).
- `[Heuristique][P2]` SI `mental_load ≥ 4` OU `travel_week` → semaine allégée/flexible (« faire ce que tu peux », objectifs minimaux) plutôt qu'un plan rigide qui sera abandonné.
- `[Heuristique][P1]` Respecter `terrain_access` : ne pas prescrire de côtes à qui n'a pas de relief → substituer (treadmill incliné, escaliers, renfo) ; ne pas prescrire de sentier à qui n'a que de la route.
- `[Consensus][P2]` Respecter `max_session_min_per_day` : fractionner ou raccourcir, garder l'objectif physiologique de la séance.
**Impact plan** : transforme le plan « optimal » en plan **suivable** ; c'est la couche qui maximise l'adhérence réelle.
**Exemple** : 4 jours dispo, longue le dimanche, pas de relief, gros stress boulot mardi → moteur place longue dim, qualité jeu/sam, easy lun/mer, côtes remplacées par treadmill incliné, mardi jamais chargé.

---

## Interaction entre les couches (ordre de résolution du moteur)

Quand plusieurs règles s'appliquent, le moteur résout dans cet ordre (priorité décroissante) :

1. **P0 sécurité** — blessure/douleur (§2), maladie (§3) → peut tout suspendre/réécrire.
2. **Readiness du jour** (§3) → ajuste/downgrade la séance du jour.
3. **Risque de charge** (§1.4, ACWR/ramp/monotony) → plafonne la semaine.
4. **Confiance des données** (§9) → dégrade les décisions sur donnée douteuse, propose un test (§8).
5. **Performance** (§6, §7) — blocs et prescription par gap.
6. **Adhérence/personnalisation** (§10) → rend le tout réellement suivable.

> Règle d'or : **la sécurité et l'adhérence priment sur l'optimalité théorique.** Un plan sûr et suivi
> bat un plan parfait et abandonné. C'est précisément ce qui distingue les meilleures apps de coaching.

---

## Sources & rattachement à la couche 1

Cette couche réutilise les fondations chiffrées de `knowledge-base.md` (couche 1) : zones (§2 couche1),
charge/ACWR/PMC (§4 couche1), trail/durabilité/nutrition/chaleur (§5 couche1), affûtage (§6 couche1),
arbre d'adaptation et co-périodisation (§8-9 couche1). Les ajouts terrain (profils, douleur, readiness,
technicité, stratégie, adhérence) sont majoritairement `[Consensus]`/`[Heuristique]` — étiquetés comme tels.
Re-vérifier toute constante avant hard-code ; les coefficients `k` (technicité), poids de readiness et seuils
d'adhérence sont **à calibrer** sur données réelles avant d'être figés.
