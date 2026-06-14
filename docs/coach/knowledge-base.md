# Coach Vorcelab — Base de connaissances (science + terrain)

> Socle de recherche pour le moteur de coaching **algorithmique et déterministe** (aucune IA, conforme à la règle Strava).
> Cible : trail court→marathon **et** ultra-trail · tous niveaux (le moteur s'adapte) · approche science + terrain.
> Chaque section donne des **chiffres, seuils et formules codables**. Sources citées en bas. Daté 2026-05-29.
> 📊 Ce fichier couvre surtout la **planification** ; pour la **lecture d'une séance réalisée**
> (métriques post-séance, route vs trail, verdict), voir **`session-analysis.md`**.

⚠️ **Garde-fou transversal** : plusieurs constantes (ACWR « sweet spot », règle des 10 %, équivalence D+) sont des **heuristiques contestées**, pas des lois. Le moteur les traite comme des garde-fous, jamais comme des vérités — et croise toujours plusieurs signaux (charge + forme + ressenti).

---

## 1. Périodisation

| Modèle | Distribution intensité | Phases (semaines) | Quand l'utiliser |
|---|---|---|---|
| **Linéaire/classique** | Volume↓ intensité↑ au fil du macrocycle | Base 20-24 · Build/Peak 12-16 · Taper ~1 ; macro 16-20 sem | Débutant/intermédiaire, 1er objectif, 1 pic saisonnier |
| **Polarisé 80/20 (Seiler)** | Z1 ~80 % · Z2 ~5 % · Z3 ~15 % (ordre Z1>Z3>Z2) | Base/Build/Spé/Taper classiques | Athlète entraîné, ≥8-12 h/sem, plateau à casser ; 5k→marathon |
| **Pyramidal** | Z1 ~75-80 % · Z2 ~15-20 % · Z3 ~5-10 % (Z1>Z2>Z3) | idem | Base-building, débutants, **longues distances/ultra** (plus de Z2 tolérée) |
| **Seuil (THR)** | Z2 >35 % du volume (ex 40/50/10) | blocs ~6 sem | Athlète pressé (~5-8 h/sem) |
| **Bloc (Issurin)** | Charge concentrée sur 1 qualité | blocs 2-4 sem : accumulation→transmutation→réalisation | Avancé, plusieurs pics/saison |
| **Inversé** | Intensité d'abord, volume ajouté vers la course | ex 16 sem intensité → base → 12 sem spécifique | Hiver rigoureux, ou 2e pic après course majeure ; documenté en ultra-trail élite |

**Preuve** : Stöggl & Sperlich 2014 (RCT 9 sem, 4 groupes) → polarisé meilleur (VO2max +11,7 %). Méta-analyse 2024 : VO2peak SMD 0,24 en faveur du polarisé (plus fort <12 sem et chez athlètes entraînés), **mais pas de différence sur contre-la-montre/TTE/vitesse au seuil**.

**Règle moteur** : choisir le modèle selon (distance cible × niveau × semaines dispo × heures/sem). Défaut : pyramidal pour base/ultra/débutant, polarisé pour build/athlète entraîné. Toujours finir par Spé → Taper → Course.

---

## 2. Zones d'intensité (chiffrées)

**3 zones (Seiler)** — bornes physiologiques : Z1 < LT1/VT1 (~2 mmol) · Z2 entre LT1 et LT2 (~2-4 mmol) · Z3 > LT2/VT2 (~4 mmol).

**5 zones %FCmax (échelle norvégienne)** : Z1 60-72 · Z2 72-82 · Z3 82-87 · Z4/Z5 au-dessus.
**5 zones %FCréserve (Karvonen)** : Z1 50-60 · Z2 60-70 · Z3 70-80 · Z4 80-90 · Z5 90-100.
→ `FC_cible = ((FCmax − FCrepos) × intensité%) + FCrepos`.

**Friel — 7 zones FC en %LTHR (course)** : Z1<85 · Z2 85-89 · Z3 90-94 · Z4 95-99 · Z5a 100-102 · Z5b 103-106 · Z5c >106.
**Friel — zones d'allure en % de l'allure-seuil** (⚠️ inversé : % plus bas = plus rapide) : Z1>129 · Z2 114-129 · Z3 106-113 · Z4 99-105 · Z5a 97-100 · Z5b 90-96 · Z5c<90.
**Test LTHR Friel** : CLM 30 min solo, moyenne FC des 20 dernières min ≈ LTHR.

**Daniels (VDOT)** — %VO2max / %FCmax / part du volume :
| Zone | %VO2max | %FCmax | Part hebdo | Usage |
|---|---|---|---|---|
| E (easy/long) | 59-74 | 65-79 | 70-80 % | base, récup ; longue ≤2 h30 |
| M (marathon) | 75-84 | 80-90 | ≤20 % | allure marathon, ≤110 min/séance |
| T (seuil) | 83-88 | 88-92 | ≤10 % | tempo 20 min / cruise intervals |
| I (VO2max) | 95-100 | 98-100 | ≤8 % | reps 3-5 min |
| R (répétition) | >100 | n/a | ≤5 % | reps ≤2 min, économie/vitesse |

**VMA ≡ vVO2max** (même construct). Ancrages %VMA (approx, varie bcp entre individus → préférer VDOT si course récente dispo) : seuil ~84-88 % · marathon ~80-85 % · easy ~60-70 %. Reps 200-400 m ≈ 100-110 % VMA ; 1000 m ≈ 95-100 % VMA.

**Uphill Athlete (4 zones trail, ancrées AeT/AnT)** : Z1 = AeT−20 % à −10 % · Z2 = AeT−10 % à AeT · Z3 = AeT à LT/AnT · Z4 > AnT. **Spread AnT/AeT** : ratio <~1,10 = base aérobie sous-développée (signal à exploiter dans le moteur). Test AeT : nez-respiration, plus haute allure tenable en respirant par le nez 10-15 min.

---

## 3. Volume & progression

**Volume hebdo par distance / niveau** (km ; heures pour l'ultra) :
- **Marathon** : débutant 48-64 km · intermédiaire 72-89 km · avancé 97-137+ km (Pfitzinger pics 88/113/137 ; Daniels 2Q pic 113).
- **Ultra (modèle heures, Koop/CTS)** : 50k & 50mi → **min 6 h/sem × 3 sem** avant course ; 100k & 100mi → **min 9 h/sem × 6 sem**. Au-delà de ~9 h/sem, rendements décroissants. Relation **non-linéaire** (un 100mi ≠ 2× un 50mi).
- **Ultra (modèle km, iRunFar — "finir" vs "performer")** : 50k ≥48 / >80 km · 50mi-100k ≥64 / >97 km · 100mi ≥80 / >113 km, soutenu 3-6 sem.
- **Trail/D+ (Uphill Athlete)** : semaines de pic ≈ **50 %→100 % des totaux de l'épreuve** (distance, temps, D+). Atteindre le **D+ total de la course sur ~2 semaines de base**. Longue = % du D+ course (course 1000 m, longue à 30 % → 300 m D+).

**Progression** :
- **Règle des 10 %/sem = NON validée** (RCT Groningen : 20,8 % vs 20,3 % de blessures). Progresser selon la réponse individuelle, pas un % fixe.
- Garde-fou opérationnel : **≤10 % d'augmentation hebdo** (distance/temps/D+) hors semaines de récup ; >30 % = réellement risqué.
- **Cycle de charge : 3 sem build : 1 sem décharge** (décharge toutes les 4 sem).
- **Décharge** : −10 à −40 % de volume (Uphill Athlete : **≥−50 %** en montagne). L'ATL chute en 5-7 j, le CTL décroît lentement → justifie des décharges courtes.

---

## 4. Charge d'entraînement (formules)

**TRIMP** :
- Banister exp : `TRIMP = Σ(durée_min × HRr × 0,64·e^(y·HRr))`, **y=1,92 (H) / 1,67 (F)**, HRr = fraction de FC réserve.
- Edwards (par zone %FCmax) : 50-60→×1, 60-70→×2, 70-80→×3, 80-90→×4, 90-100→×5.
- Lucia (VT1/VT2) : Z1×1, Z2×2, Z3×3. · sRPE (Foster) : RPE(0-10) × durée_min.

**TSS / hrTSS** : `TSS = (sec × NP × IF) / (seuil × 3600) × 100`. **100 TSS = 1 h au seuil.** hrTSS = même logique avec FC vs FC-seuil.

**PMC (Banister)** :
- `CTL_j = CTL_(j−1) + (TSS_j − CTL_(j−1))·(1/42)` (Fitness, τ=42 j)
- `ATL_j = ATL_(j−1) + (TSS_j − ATL_(j−1))·(1/7)` (Fatigue, τ=7 j, réglable 3-7)
- `TSB = CTL − ATL` (valeurs de la veille).
- **Zones TSB (Friel)** : course-A **+15 à +25** · transitionnel −10 à +10 · build/base **−10 à −30** · **< −30 surentraînement** · > +25 = trop facile/perte de forme.

**ACWR** : aiguë 7 j / chronique 28 j. **Sweet spot 0,80-1,30** · **danger ≥1,50**. Variantes sport (foot 1,00-1,25). **CTL élevé = protecteur** ("fit but tired beats unfit and fresh"). Préférer **EWMA** : `EWMA_j = charge_j·λ + (1−λ)·EWMA_(j−1)`, λ=2/(N+1) → aiguë λ≈0,25, chronique λ≈0,069.
⚠️ **Critiques ACWR** : couplage mathématique (l'aiguë est une composante de la chronique → corrélation artefactuelle) ; le "sweet spot" est contesté. → garde-fou, croisé avec TSB/HRV, jamais seul.

**Charge trail (D+)** — *deux axes distincts, ne pas confondre* :
- **Charge/catégorisation (ITRA)** : `km-effort = distance_km + D+_m/100` → **100 m D+ ≈ 1 km plat**. (ex 65 km+3500 m = 100).
- **Temps (Naismith/Scarf)** : 5 km/h plat + 1 h/600 m D+ = **10 min/100 m D+** ; Scarf α≈8 → 1000 m D+ ≈ 8 km plat. Descente (Langmuir) : −10 min/300 m si 5-12°, +10 min/300 m si >12°.
- **Allure (Minetti/GAP)** : coût métabolique mini à ~−10/−20 % ; ~+2,5 % d'effort par +1 % de pente. ⚠️ GAP **trop optimiste sur terrain technique**.
- *Note : on a déjà `minettiGradePenalty` en prod dans `gpxCore.ts` (forme validée 1-pour-1) — la forme canonique Minetti diffère légèrement, à ne PAS toucher sans test.*

---

## 5. Spécificités trail / ultra

**Côtes** :
- Sprints courts (neuro) : **8-12 × 8-15 s** (~50-70 m), 85-95 %, récup 2-3 min, **pente 10-15 %**.
- Reps longues : **5 × 3-4 min** à effort 5k-3k, récup jog, pente 4-10 %.
- Échelle de pente (TrainingPeaks) : <12 s @10 %+ (puissance) · 12-30 s @6-10 % (vitesse) · 30-60 s @4-10 % (résistance fatigue) · 1-3 min @4-10 % (tampon lactate).
- Progression D+ : **≤+20 %/sem** d'élévation.

**VAM (m/h)** : amateur entraîné ~400-700 ; pro >1000 (pente raide). Compare uniquement sur pentes similaires. (Les valeurs vélo ne sont PAS transférables.)

**Descente / excentrique / durabilité musculaire** :
- Mécanisme = contractions excentriques → dommages. Protocole −20 % / 30 min : force isométrique max à 84 % à 24 h (−16 %), CK ×6, récup ~4 jours.
- **Effet "repeated-bout"** : une exposition antérieure réduit fortement les dommages suivants → introduire la descente **semaines/mois avant** la course.
- Une seule séance descente altère l'économie *à plat* jusqu'à **5 jours** (>70 % VO2max) → habituer la descente AVANT la phase spécifique, pas pendant.
- **Reps descente** : 4-8 × 60-90 s contrôlées, **≤2 séances/sem espacées ≥72 h**. Coupler à du renfo excentrique (step-down lents). Pente la plus économique ≈ −17 %.

**Time on feet / back-to-back** : 2 grosses journées <72 h pour simuler les jambes de fin de course. Volume B2B : 50k ~30-40 mi/2 j · 50mi ~35-50 · 100mi ~40-55 ; couper le midweek −15-20 %. Koop : pas de distance magique (longue = 20-80 % de la course selon athlète).

**Nutrition / entraînement intestinal** : glucides **60-90 g/h** (élite/ultra jusqu'à **120 g/h**). >60 g/h nécessite **glucose+fructose** (ratio 2:1 → ~90 g/h ; ~1:0,8 récent). Protocole : démarrer **6-8 sem avant**, 1-2 séances/sem, dose progressive (adaptation 3 j-2 sem). Hydratation 500-1000 mL/h, ~1500 mg sodium/L (le sodium co-transporte le glucose via SGLT1).

**Chaleur** : acclimatation **7-10 j** (30-90 min/séance, ~38,5-39 °C, core ~38,5 °C). Gains : volume plasmatique +5,6 %, core fin d'effort −0,43 °C, perf CLM +3,1 %. Maintien : ~1×/3 j. Déclin ~2,5 %/j après 48 h. (⚠️ magnitudes protocole-dépendantes.)

**Durabilité (Maunder)** : = résistance à la dérive du profil physio sur effort prolongé. Seuils de dérive utilisés : FC +5 %, dépense énergétique +2,5 %, ventilation +5 %, RPE +2 pts. Entraînée par **volume aérobie ET intensité** (10 sem → dérive FC 15→13 bpm LIT, 17→12 HIT ; onset retardé ~25-29 min). Chaleur ajoute un bénéfice.

---

## 6. Affûtage (taper) — Bosquet/Mujika

- **Durée optimale 8-14 j** (SMD −1,47) ; ≤7 j marche encore ; **≥22 j = pas de bénéfice**.
- **Volume −41 à −60 %** (optimum) ; ≤20 % insuffisant, >60 % contre-productif.
- **Maintenir l'intensité ET la fréquence** (>80 % du normal) — c'est le volume qu'on coupe.
- **Décroissance progressive (exp)** légèrement > step. Gain typique **~3 % (0,5-6 %)**. Maximisé si précédé d'un **bloc de surcharge**.
- Le gain vient du **retrait de la fatigue**, pas d'un gain de VO2max.
- **Par distance** : 5-10k ~7 j · semi/marathon **8-14 j, −40-60 %** · **ultra/100mi ~2-3 sem** mais garder une longue (12-16 mi terrain course, easy) + un effort AeT. (Friel : −30-50 %/sem en maintenant l'intensité ; course nécessite un taper plus long que vélo.)
- Sharpener race-week (Friel) : 90 s à allure course, nb dégressif (J-5 = 5×90 s, J-4 = 4×90 s…).

---

## 7. Catalogue de séances (structures concrètes codables)

| Système | Structure type | Intensité | Terrain | Phase |
|---|---|---|---|---|
| Easy/récup | 30-150 min continu | E (65-78 %VO2max) | tout | toutes + taper |
| Longue route | 90 min-2 h30 ; ≤25-30 % du volume hebdo | E | rolling | base/build |
| Longue D+ | longue avec % du D+ course | E-Z2 | uphill | base/build/spé |
| B2B ultra | 2 jours <72 h (ex Sa 4-5 h + Di 2-3 h) | E | trail | spé ultra |
| Tempo/AeT | 20-60 min continu (Koop : 1-2×20-60 min sous LT, RPE 7-8) | seuil aérobie | tout | base/build |
| Seuil (cruise) | **4×8 min @T, r2 min** ; ou 3-5×1 mile @T r1 min ; (Koop 8-15 min, work:rest 2:1) | T (88-92 %FCmax) | rolling | build/spé |
| Marathon-spé | 5×[½ mile T + ½ mile M] continu | T+M | rolling | spé |
| VO2max | **5×1000 m** ou 6×800 m r400 jog ou 5-6×3 min @I récup égale ; viser 15-20 min à I | I (98-100 %FCmax) | plat/uphill | build/spé/taper |
| Billat 30/30 | 30 s @vVO2max / 30 s easy ×N | vVO2max | plat | build |
| Roche fast/easy | 16×[1 min vVO2max + 1 min float] | I | tout | toute année |
| Côtes courtes | 8-12×8-15 s @10-15 %, récup descente | quasi-max | uphill | base/build |
| Côtes longues | 5×3-4 min @effort 5k, jog descente | seuil/VO2 | uphill | build/spé |
| Descente | 4-8×60-90 s contrôlées, ≤2/sem ≥72 h | modéré | downhill | build/spé (tôt) |
| Allure course | longue avec blocs allure objectif (2-3×3-4 mi @M) | M/course | terrain course | spé |
| Strides/sharpener | 4-8×20-30 s relâchés, récup complète | rapide relâché | plat/côte | taper |
| Renfo (lien module) | voir §9 | — | — | base/build |

---

## 8. Règles d'adaptation (arbre de décision codable)

```
# ACWR (croisé, jamais seul)
SI ACWR ≥ 1,5            → drapeau risque ; couper la charge aiguë de ~25-35 % (ramener vers 1,0-1,1)
SI ACWR < 0,8 (durable)  → sous-chargé ; autoriser progression (≤10 %/sem)
SINON (0,8-1,3)          → zone OK

# TSB / forme
SI TSB < −30             → insérer jours easy/récup
SI course ≤7 j ET TSB < +5 → renforcer le taper (couper le volume)
SI TSB > +25 hors taper  → trop facile, ajouter de la charge
Cible course-A : TSB +15 à +25 le jour J (positif seulement quelques jours avant)

# Séances manquées / retour
1 séance clé ratée       → décaler/abandonner, ne pas "rattraper" en doublant
~1 sem off               → reprendre à ≥75 % du volume
2-3 sem off              → 50-75 %
≥1 mois off              → 25-50 %, rebuild ~+10 %/sem

# Dérive cardiaque (decoupling = (EF₁−EF₂)/EF₁ ×100 sur effort régulier)
< 5 %                    → base aérobie solide → OK pour progresser vers le build
5-10 %                   → limitation modérée / fatigue légère
> 10 %                   → effort au-dessus de l'AeT OU base insuffisante
                           → prescrire + volume aérobie easy, NE PAS ajouter d'intensité

# HRV (Ln-rMSSD, moyenne mobile 7 j, bande SWC = baseline ± 0,5×SD)
dans/au-dessus de la bande → séance dure OK
sous la bande            → easy ou repos

# Faiblesse détectée → prescription
descente faible / quads   → renfo excentrique + descente à allure normale, dose basse
                            (éviter reps descente dures ; cue cadence ↑). "problème musculaire"
montée faible             → travail d'intensité en côte / hill reps. "problème aérobie"
durabilité faible (fade)  → volume aérobie long + travail de résistance à la fatigue (intensité/renfo
                            placés en fin de longue) ; viser decoupling <5 %
économie déficiente       → renfo lourd + pliométrie
```

---

## 9. Co-périodisation renfo + course (interférence)

- **Effet d'interférence** (Hickson) : gain de force concurrent +25 % vs +44 % (force seule) → ~−43 % relatif. Cause : l'endurance active l'AMPK qui inhibe mTORC1.
- **Modulateur** : faible/nul chez débutants, apparaît avec le niveau → **un débutant peut largement l'ignorer**.
- **Séparation** : **≥6 h** entre renfo et endurance clé (plancher dur **3 h** si endurance avant renfo). Économie de course altérée **jusqu'à ~8 h** après renfo bas du corps.
- **Ordre** : priorité du jour en premier (si la course est la séance clé → courir d'abord). Force-puissance prioritaire → lever d'abord (+27 % vs +15 %).
- **À éviter** : pas de renfo lourd bas du corps **dans les ~24 h avant** une longue ou une séance qualité ; pas d'endurance→force <3 h si l'objectif est la force ; pas de pliométrie/excentrique en état de fatigue/DOMS.
- **Périodisation force (Blagrove)** : adaptation anatomique 4-6 sem (2-3×12-15) → force max 14 sem (2×/sem, 3-5×3-5, lourd, ↑économie) → puissance/plio (reps basses, intention max) → maintien en saison (~1×/sem, volume réduit, intensité gardée).
- **Taper force** : arrêter le lourd **2-3 sem avant marathon, 10-14 j avant semi** ; garder intensité/activation neurale en réduisant le volume ; **5 derniers jours : pas de gym**, gains conservés.

---

## 10. Objectifs (hiérarchie A/B/C) & orientation d'entraînement

### 10.1 Objectif principal / secondaire — priorisation A/B/C (Friel, Daniels, CTS)

- **Course A (objectif principal)** : on périodise **à rebours** depuis elle, affûtage complet, pic de forme calé dessus. **2-3 max par an** (le pic ne se tient que ~2-3 sem).
- **Course B (objectif secondaire important)** : courue « pour de vrai » mais **sans casser le macrocycle** → **mini-affûtage 3-5 j** (volume réduit, intensité gardée), pas de taper complet.
- **Course C (préparation / rodage)** : **aucun affûtage** → comptée comme **la séance qualité de la semaine** (test allure / ravito / matériel), on enchaîne la semaine normale.
- **Règle codable** :
  - `principal` = la course ciblée → plan complet, taper plein.
  - course `secondaire` dans le bloc → si **B** : mini-taper 3-5 j + semaine à volume réduit ; si **C** : remplace la séance qualité de sa semaine, **pas** de taper ni de décharge.
  - jamais deux pics rapprochés : 2ᵉ course A < 4-6 sem après la 1ʳᵉ → rétrograder en B.

### 10.2 Orientation d'entraînement — plaisir / performance / mix

Cadre : **théorie de l'autodétermination** (Deci & Ryan ; Teixeira 2012) — l'adhésion durable vient de l'**autonomie + compétence + lien**, pas de la contrainte. On biaise donc volume, distribution d'intensité et nombre de séances qualité selon ce que cherche le coureur.

| Orientation | Volume cible (×) | Qualités/sem | Distribution intensité | Séances très dures | Ton / souplesse |
| --- | --- | --- | --- | --- | --- |
| **Plaisir / santé** | ~0.8 (plafonné) | ≤ 1 | très majoritaire Z1-Z2 (aérobie facile), variété | **évitées** (jamais de VO2max « à l'arrache ») | flexible, zéro culpabilité si séance sautée |
| **Mix / équilibre** *(défaut)* | ~1.0 | 1-2 | polarisé **souple** (~85/15) | modérées | structuré mais adaptable |
| **Performance** | ~1.0-1.1 (selon dispo) | 2 | polarisé **strict** ~80/20 (Seiler) | pleines (seuil + VO2max/spécifique) | rigueur, allures cibles respectées |

- **Plaisir** : priorité adhésion/plaisir → protéger l'envie de revenir (volume modéré, beaucoup d'easy, nouveauté, pas de séance « qui dégoûte »).
- **Performance** : priorité progression mesurable → volume plein, 80/20 polarisé, 2 qualités structurées, allures respectées.
- **Mix** : compromis sain (volume modéré-élevé, 1-2 qualités, polarisé souple) — défaut.
- **Codable** : un paramètre `orientation ∈ {plaisir, mix, performance}` qui module `volumeScale`, `qualitySessionsPerWeek` et l'autorisation des systèmes durs (VO2max/seuil). N'altère **pas** la périodisation des phases ni la sécurité (ACWR, interférence, taper) — seulement l'emphase.

---

## Sources principales

**Périodisation/zones** : Seiler (Fast Talk Labs ; ResearchGate "Best Practice…") · Friel (TrainingPeaks zones) · Daniels (Coach Ray, RunDNA, VDOT O2) · Stöggl & Sperlich 2014 (Frontiers) · méta POL 2024 (PMC11329428) · Uphill Athlete (AeT/AnT).
**Volume/charge** : Pfitzinger/Daniels (runningwithrock) · Koop/CTS (trainright) · iRunFar (volume ultra) · Uphill Athlete (D+) · 10 % myth (Outside, RunnersConnect) · TRIMP/TSS/PMC (fellrnr, FasCat, TrainingPeaks) · ACWR (scienceforsport, gpexe, Williams EWMA, critiques researchgate 333589357) · ITRA km-effort · Naismith (Wikipedia) · Minetti 2002 · Strava GAP.
**Trail/ultra/durabilité** : Vernillo & Millet (Sports Med 2017 ; économie pentes PMC8281813) · dommages descente PMC11129977 · repeated-bout (MDPI 12/6/169) · durabilité Maunder (PMC9977827) · nutrition (Jeukendrup PMC5371619, Precision Hydration) · chaleur (PMC12122934, PMC6543994) · VAM (cyclingcoachai).
**Affûtage** : Bosquet 2007 (PubMed 17762369) · méta 2023 (PMC10171681) · Mujika (INSEP HAL) · Friel.
**Adaptation/renfo** : Gabbett/IOC (PMC7047972) · TSB Friel · decoupling (TrainingPeaks) · HRV Kiviniemi/Vesterinen (PubMed 26909534, AER, MDPI 17/21/7999) · Koop (faiblesses) · interférence Hickson (PubMed 7193134), revue concurrent (Frontiers fspor 2025.1692399) · Blagrove (force coureurs) · taper force (RunnersConnect, Central Performance).
**Objectifs/orientation** : priorisation A/B/C — Friel *Training Bible* / TrainingPeaks · Daniels *Running Formula* · Koop/CTS (trainright) · autodétermination — Deci & Ryan (SDT) · Teixeira et al. 2012, *IJBNPA* (motivation & adhésion à l'exercice, PMC3441783) · distribution polarisée (Seiler, déjà cité).

> Liste d'URLs complète conservée dans l'historique de recherche (5 rapports d'agents, 2026-05-29). Re-vérifier toute constante "load-bearing" contre la source primaire avant de la coder en dur (notamment coefficients Minetti et magnitudes ACWR).
