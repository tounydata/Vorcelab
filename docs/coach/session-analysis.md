# Coach Vorcelab — Analyse de séance réalisée (post-séance)

> Socle de connaissance pour la **lecture d'une séance déjà courue** (prévu → réalisé),
> moteur **algorithmique et déterministe** (aucune IA, mêmes entrées → même sortie).
> Complète `knowledge-base.md` (qui couvre surtout la **planification**) : ici on documente
> **quelles métriques calculer sur une activité, leurs seuils d'interprétation, et comment
> route ≠ trail**. Cible : 5K → marathon **et** trail/ultra. Daté 2026-06-14.

⚠️ **Garde-fou transversal** : un verdict de séance ne repose **jamais sur un seul signal**.
On croise allure × FC/zone × dérive × ressenti, et plusieurs constantes ci-dessous (dérive
5/10 %, ACWR, bandes VAM) sont des **heuristiques** — garde-fous, pas lois. La donnée brute
est toujours soumise à un contrôle de qualité (effort régulier ? FC fiable ? GPS propre ?)
avant d'être interprétée.

**Rattachement code** : `runnerProfile.ts` (`computeDriftStatus`, `computeCardioCost`,
`computeEfficiencyScore`, `computeClimbStatus/DescentStatus/FlatStatus`, `GRADE_BUCKETS`,
`fmtVam`, `TechnicalDescentProfile`, `DownhillFatigueProfile`), `sessionVerdict.ts`
(`computeSessionVerdict`), `trainingLoad.ts` (`computeActivityLoad`, `computeDailyPMC`,
`computeACWR`, `getTsbZone`), `gpxCore.ts` (`minettiGradePenalty`, `buildDetailedSections`,
`RPE_SCALE`), `paceEngine.ts` (zones/allures). Voir aussi `session-feedback-adaptation.md`
(design de la boucle) et `intelligence-layer.md`.

---

## Analyse de séance — Route / plat

Sur terrain plat/roulant, l'**allure moyenne est directement comparable à la cible**
(séances continues E/M/T) et la FC est interprétable sans correction de pente. C'est le cas
« facile » : la plupart des signaux ci-dessous sont fiables tels quels.

### A1. Découplage aérobie (dérive cardiaque) — le signal #1 de durabilité

Définition : sur un effort **régulier** (allure ou puissance ~constante), la FC dérive vers
le haut quand la fatigue/déshydratation/chaleur s'installent. On mesure l'**Efficiency Factor**
par moitié d'effort et on regarde sa chute.

- **EF** = `vitesse (ou NGP/GAP) ÷ FC moyenne` (m/min par bpm, ou allure inverse / FC).
- **Découplage** = `(EF₁ − EF₂) / EF₁ × 100`, où EF₁/EF₂ = 1ʳᵉ vs 2ᵉ moitié de la **partie régulière** (échauffement et récupérations exclus).

| Découplage | Lecture | Action moteur |
|---|---|---|
| **< 5 %** | base aérobie solide, effort sous l'AeT | OK pour progresser vers le build |
| **5–10 %** | limitation modérée / fatigue légère / effort un peu trop haut | surveiller, ne pas ajouter d'intensité |
| **> 10 %** | effort **au-dessus de l'AeT** OU base insuffisante OU forme basse | + volume aérobie easy, **pas** d'intensité ; drapeau fatigue |

Conditions de **validité** (sinon `unknown`, ne pas interpréter) :
- effort **steady** (footing/tempo continu) — **jamais** sur intervalles/fartlek ;
- durée régulière **≥ ~45–60 min** (en deçà le bruit domine) ;
- échauffement exclu, pas d'arrêts longs, pas de gros changement de terrain.

→ Code : `computeDriftStatus(driftPct)` → `stable ≤5` / `moderate ≤10` / `marked >10`.
C'est l'axe `derive` (poids 0,7) du verdict.

### A2. Efficiency Factor (tendance) & coût cardio

- **EF en valeur absolue** ne se compare qu'à **soi-même, conditions semblables** (même
  zone, même chaleur). Une **hausse de l'EF à FC égale sur plusieurs semaines = gain
  d'aptitude aérobie** (économie/forme). À l'inverse, EF qui baisse à charge constante =
  fatigue accumulée ou méforme.
- **Coût cardio** (proxy d'intensité réelle), aligné sur `computeCardioCost(hrPctFcMax)` :
  **< 75 % FCmax = low** (endurance fondamentale Z1–Z2) · **75–87 % = medium** (tempo/allure
  Z3) · **≥ 88 % = high** (seuil/VO2max Z4–Z5). Réf. Friel / ACSM.

### A3. Allure : splits, fade et « couru trop vite »

| Pattern | Calcul | Lecture |
|---|---|---|
| **Negative split** | allure 2ᵉ moitié plus rapide que 1ʳᵉ | gestion saine, marge restante |
| **Positive split / fade** | 2ᵉ moitié plus lente (> ~2–3 %) malgré effort égal | pacing trop ambitieux ou durabilité faible |
| **Couru trop vite** (séance easy) | allure **sous** la fourchette E ET FC > zone E | dérape en Z3 — érode la récup, à corriger −5–10 s/km |
| **Variability Index** | `VI = NP ÷ allure moy` ; ~1,0 = régulier | VI élevé sur séance censée régulière = terrain/pacing en dents de scie |

Tolérance d'allure du moteur : **±12 s/km** autour de la fourchette cible avant de juger
« plus rapide / plus lent » (cf. `PACE_PAD` dans `sessionVerdict.ts`). Comparaison d'allure
**uniquement sur séances continues** (`CONTINUOUS_SYSTEMS`) ; sur intervalles l'allure
moyenne n'est pas comparable → axe allure `unknown`.

### A4. Distribution d'intensité réalisée (vs prescrite)

- Calculer le **% de temps réel par zone** et le comparer au **but de séance** (pas juste
  « temps en zone » brut). Une easy doit être ~majoritairement Z1–Z2 ; si > ~15–20 % du
  temps passe en Z3+, la séance a **dérapé** (signal « trop dur » récurrent → fatigue de fond).
- Mesure de cohérence sur la semaine : la TID réalisée (ex. 80/20 ou pyramidale) doit
  refléter le modèle prévu (cf. `knowledge-base.md` §1–2). Dérive systématique des easy vers
  le haut = la cause la plus banale de stagnation.

### A5. Charge issue de la séance (alimente le PMC)

- **sRPE-load** (Foster) : `RPE(0–10) × durée_min` — toujours disponible, même sans montre.
- **TSS / hrTSS** : `TSS = (sec × NP × IF) ÷ (seuil × 3600) × 100` ; **100 TSS = 1 h au seuil** ;
  `IF = NP ÷ seuil`. hrTSS = même logique en FC vs FC-seuil.
- La séance met à jour le **PMC** : `CTL (τ=42 j)`, `ATL (τ=7 j)`, `TSB = CTL − ATL`, puis
  l'**ACWR** (aiguë 7 j / chronique 28 j, sweet spot 0,80–1,30). Code : `computeActivityLoad`,
  `computeDailyPMC`, `computeACWR`, `getTsbZone`. **L'interprétation reste croisée** (cf. §V).

### A6. Concordance RPE ↔ données (détecteur de fatigue / conditions)

RPE attendu par zone (échelle 1–10, cf. `RPE_SCALE`) : **E ~2–4 · M ~4–6 · T ~5–7 ·
I ~8–9 · R ~9–10**. L'**écart RPE/données** est un signal en soi :

| Observé | Interprétation probable |
|---|---|
| RPE **haut** + FC/allure **basses** | fatigue, méforme, sommeil/charge — *prudence, alléger* |
| RPE **bas** + FC **haute** | chaleur, déshydratation, capteur — *contextualiser, ne pas surcoter l'intensité* |
| RPE et données **concordants** | verdict fiable, confiance ↑ |

→ Axe `ressenti` (poids 1,0, le plus fort). La **douleur** est un garde-fou : ne fait jamais
basculer en « trop facile ».

### A7. Cadence & foulée — cadre prudent

- Ordres de grandeur usuels ~160–185 spm ; comparer **à sa propre baseline**, pas à un
  « 180 universel ». Cadence basse + grandes enjambées peut signaler du sur-stride.
- **Cadre obligatoire** : la cadence est un **levier (blessure/économie), pas une garantie de
  vitesse**. On l'utilise comme indice, jamais comme cible de performance.
- Sert aussi à la **détection marche** en trail (cf. §T5), pas à juger une séance route.

### A8. Pièges data (route)

- **Lag cardiaque** : la FC met ~30–60 s à répondre → ne pas lire la FC sur des à-coups
  courts ; le découplage n'a de sens que sur effort **prolongé et régulier**.
- **GPS** : allure instantanée bruitée → lisser (km laps). Tunnels/zones denses faussent la
  distance.
- **Tapis** : pas de GPS (allure = réglage machine), pas de dérive de pente — fiable pour la
  FC, pas pour l'allure réelle.
- Découplage sur séance **non régulière** = ininterprétable → `unknown`, on n'en tire rien.

---

## Analyse de séance — Trail / ultra

⚠️ **Le piège central du trail** : l'allure brute et le découplage **allure:FC** sont
**ininterprétables** dès qu'il y a du D±. La pente domine tout. On raisonne donc en
**VAM (montée)**, **vitesse par bucket de pente**, **GAP** (avec ses limites) et **FC:VAM**,
pas en allure plate. Le code segmente déjà l'activité par tranches de pente (`GRADE_BUCKETS`).

### T1. Segmentation par pente (la base de toute lecture trail)

`GRADE_BUCKETS` (source de vérité, `runnerProfile.ts`) :

| Bucket | Pente | Type | Métrique de référence |
|---|---|---|---|
| `steep_up` | ≥ 12 % | montée | **VAM** |
| `mod_up` | 6–12 % | montée | VAM |
| `mild_up` | 2–6 % | montée | VAM / vitesse |
| `flat` | −2 à 2 % | plat | vitesse |
| `mild_down` | −2 à −6 % | descente | vitesse |
| `mod_down` | −6 à −12 % | descente | vitesse |
| `steep_down` | ≤ −12 % | descente | vitesse |

On analyse **chaque bucket séparément** (vitesse, FC %FCmax, VAM, coût cardio, minutes
analysées). Comparer un effort ne vaut **qu'à pente comparable**.

### T2. VAM (vitesse ascensionnelle moyenne, m/h) — métrique reine de la montée

- **Formule** : `VAM = D+ (m) ÷ temps de montée (h)` sur un segment montant homogène.
- **Bandes** (cf. `computeClimbStatus`, alignées terrain amateur/élite) :

| VAM | Statut séance (si FC contrôlée) |
|---|---|
| **≥ 900 m/h** | point fort (`strength`) ; si coût cardio high = « performant mais coûteux » |
| **600–900** | bon / `ok` |
| **500–600** | `ok` seulement si coût cardio élevé l'explique |
| **< 500–600** | à renforcer (`weak`), surtout si coût cardio high |

Repères externes : amateur entraîné ~**400–700**, pro >**1000** en pente raide.
- **Validité** : ne se compare **qu'à pente similaire** ; les valeurs **vélo ne sont PAS
  transférables**. Une VAM basse à coût cardio **élevé** = limite **aérobie** (→ intensité en
  côte) ; VAM basse à coût cardio **bas** = pas assez poussé / technique de marche.
- **Efficience montée** : `computeEfficiencyScore(up) = VAM ÷ (FC%/100)` → VAM par point de FC,
  comparable dans le temps (durabilité de la montée).

### T3. GAP / allure ajustée à la pente — utile mais à manier avec prudence

- **Coût de la pente (Minetti 2002)** : minimum métabolique vers **−10 à −20 %** ; en montée
  ~**+2,5 % d'effort par +1 % de pente**. Implémenté en prod : `minettiGradePenalty(grade)`
  (forme validée 1-pour-1, **ne pas toucher sans test**).
- **Temps** : Naismith/Scarf → **10 min/100 m D+** (5 km/h plat + 1 h/600 m) ; Scarf α≈8 →
  **1000 m D+ ≈ 8 km plat**. Descente (Langmuir) : **−10 min/300 m** si 5–12°, **+10 min/300 m**
  si > 12° (la descente raide **re-coûte** du temps).
- **Charge / catégorisation (ITRA km-effort)** : `km-effort = distance_km + D+_m / 100`
  → **100 m D+ ≈ 1 km plat** (axe distinct du temps, ne pas confondre).
- ⚠️ **Limite majeure** : le **GAP est trop optimiste sur terrain technique et en forte
  descente** (il suppose qu'on convertit la pente en vitesse, faux quand ça freine/casse les
  jambes). → GAP fiable sur sentier roulant, **méfiance** dès que technique. On préfère alors
  VAM (montée) et vitesse brute par bucket (descente).

### T4. Coût cardio par gradient → points faibles montée vs descente

Lecture croisée **FC %FCmax × performance par bucket** :

| Constat | Diagnostic | Prescription |
|---|---|---|
| Montée : VAM faible **+ coût cardio high** | **problème aérobie** | intensité en côte, hill reps |
| Descente : vitesse faible **+ coût cardio bas/moyen** | **problème musculaire/technique** | renfo excentrique + descente à dose, cue cadence ↑ ; **éviter** reps descente dures |
| Descente : FC élevée | souvent **fatigue héritée des montées** (à signaler, ne pas surcoter) | — |

Seuils vitesse (cf. `computeDescentStatus` / `computeFlatStatus`) : descente `strength ≥14`,
`ok ≥9`, sinon `weak` (km/h) · plat `strength ≥12`, `ok ≥8`, sinon `weak`.

### T5. Marche vs course (power-hiking)

- En trail, **marcher n'est pas un échec** : au-delà d'un **gradient de transition (~15–25 %**
  selon l'économie individuelle) la marche rapide devient **plus économique** que courir.
- **Détection** (`computeClimbStatus`) : `cadence < 130 spm` **ET** `vitesse < 6,5 km/h`
  (fallback sans cadence : vitesse < 5,0 km/h) → bucket marqué `walk`, **intégré au profil**
  (pas pénalisé). On peut lire le **% de temps marché** et la **qualité de la marche** (VAM en
  marche).
- Stratégie courir/marcher = variable de **pacing trail**, pas un défaut.

### T6. Descente : charge excentrique et qualité

- Mécanisme : contractions **excentriques** → micro-dommages musculaires. Repères : perte de
  force isométrique ~**16 % à 24 h**, CK ×6, récup ~**4 jours** (protocole −20 %/30 min).
- **Repeated-bout effect** : une exposition antérieure réduit fortement les dommages suivants
  → l'analyse doit **valoriser une exposition descente régulière** en amont (inoculation).
- Pente **la plus économique ≈ −17 %**. Signaux de **« descente subie »** : vitesse qui
  s'effondre vs le D− disponible, freinage (turn-rate/technicité élevés), FC paradoxalement
  haute. Code dédié : `TechnicalDescentProfile`, `DownhillFatigueProfile`,
  `sectionTurnDegPerKm` (technicité), `computePostClimbRecoveryStatus` (récup après bosse).
- Une grosse séance descente altère l'économie **à plat jusqu'à ~5 jours** → à pondérer dans
  la lecture des séances suivantes (une easy « anormalement coûteuse » 2–3 j après peut venir
  de là).

### T7. Durabilité / fade (clé ultra)

Sur effort long, on suit la **dérive du profil physio** (Maunder) plutôt que le seul
découplage allure:FC :

| Marqueur | Seuil de dérive |
|---|---|
| FC à effort/GAP égal | **+5 %** |
| Dépense énergétique | **+2,5 %** |
| Ventilation | **+5 %** |
| RPE | **+2 points** |

→ Découpler **GAP:FC** ou **VAM:FC** entre début et fin de sortie longue ; si la VAM s'effondre
et/ou la FC monte à effort égal en fin de séance = **durabilité limitée** → prescrire volume
aérobie long + résistance à la fatigue (intensité/renfo en fin de longue), viser découplage
< 5 %. C'est le **gate de readiness** le plus pertinent avant un ultra.

### T8. Vertical / km vertical / skyrace

Sur **forte pente soutenue (> 20–25 %)**, seule la **VAM** compte (la vitesse horizontale est
quasi nulle). Repère KV compétitif : VAM très élevée sur 20–40 min. Analyser comme un effort
seuil/VO2 vertical : VAM × FC, pas d'allure plate.

### T9. Charge spécifique & time-on-feet

- **km-effort ITRA** (cf. T3) pour la charge ; **D+ encaissé** comme axe de charge trail
  distinct du kilométrage.
- **Time-on-feet** : sur les très longues / B2B, la **durée** et le **D±** priment sur la
  distance ; une longue trail « réussie » se lit à la **stabilité de la VAM et du découplage
  en fin**, pas à l'allure moyenne.

### T10. Pièges data (trail)

- **D+ bruité** : altimétrie GPS très bruitée → préférer le **D+ barométrique** quand dispo ;
  le lissage change le total → comparer des sources homogènes.
- **FC en montée retardée** (lag) : la FC d'un raidillon court sous-estime l'effort réel.
- **GPS en sous-bois/canyon** : distance et allure dégradées → la VAM (basée D+/temps) est
  souvent **plus robuste** que l'allure GPS.
- **Technicité non captée** : le GPS ne « voit » pas les racines/cailloux → une descente lente
  peut être un **terrain** difficile, pas une faiblesse ; croiser avec `sectionTurnDegPerKm`.

---

## Verdict de séance & interprétation longitudinale

### V1. Du multi-signal au verdict (déterministe)

Le verdict ∈ {`trop_facile`, `conforme`, `trop_dur`, `manquee`} est un **score pondéré**
d'axes, déjà implémenté (`computeSessionVerdict`) :

- Axes & poids : **ressenti 1,0 · FC 0,9 · allure 0,8 · dérive 0,7**.
- Chaque axe → signe : `harder = +1`, `easier = −1`, `on/unknown = 0`.
- `score = Σ poids·signe` ; **score ≥ +1,0 → trop_dur** · **≤ −1,0 → trop_facile** · sinon
  **conforme**.
- **Confiance** : `high` si activité + FC + ≥3 signaux connus ; `medium` si activité + ≥2 ;
  `low` (ex. ressenti seul, sans montre).
- **Signaux manquants** = `unknown` (poids 0) : on ne devine pas, on baisse la confiance.

### V2. Arbre de décision post-séance (codable)

```
# Verdict → adaptation du prochain bloc du même système
SI verdict = trop_dur     → alléger la prochaine séance qualité d'un cran
                            et/ou insérer une récup (cohérent avec safetyGuards : ≥2 signaux)
SI verdict = trop_facile  → progresser d'un cran (volume/intensité) au prochain bloc
SI verdict = conforme     → poursuivre la progression planifiée
SI verdict = manquee      → recaler sans empiler ; NE PAS « rattraper » en doublant
                            (cadence non anxiogène)

# Garde-fous séance (priment sur le score)
SI douleur signalée       → jamais « trop_facile » ; drapeau sécurité, prudence
SI dérive > 10 % sur easy → drapeau fatigue/base : + volume aérobie, PAS d'intensité
SI FC ≫ zone sur séance easy (couru trop vite) → corriger l'allure, pas un point fort
SI RPE incohérent /données (RPE haut + FC basse) → suspecter méforme → alléger
```

### V3. Drapeaux rouges d'une séance

- **Dérive cardiaque > 10 %** sur effort régulier (forme basse / base insuffisante).
- **FC très au-dessus de la zone** prescrite sur une séance censée facile.
- **Écart d'allure massif** (bien au-delà de ±12 s/km) côté lent **avec** FC haute.
- **Douleur** (toujours), RPE ≥ 8 sur une easy, ou **RPE incohérent** avec la donnée.
> Aucun de ces drapeaux n'agit **seul** : ≥ 2 signaux convergents avant de couper la charge.

### V4. Lecture longitudinale (multi-séances)

| Indicateur | Calcul | Lecture |
|---|---|---|
| **Monotony (Foster)** | moyenne ÷ écart-type des charges quotidiennes (semaine) | > ~2,0 = entraînement trop uniforme (risque) |
| **Strain (Foster)** | charge hebdo × monotony | pic de strain = fenêtre de surmenage |
| **Tendance EF / découplage** | sur N semaines, à zone constante | EF↑ / découplage↓ = **durabilité qui progresse** |
| **Convergence niveau/VDOT** | allures réelles durablement hors fourchette supposée | ajuster doucement le `level`/VDOT (pas d'à-coup) |
| **Points faibles rafraîchis** | statuts buckets montée/descente sur les dernières sorties | maintenir/lever le boost (climbing…) selon le réalisé, pas un profil figé |

### V5. Readiness & garde-fous croisés (jamais un seul signal)

- Croiser **charge** (ACWR aiguë 7 j / chronique 28 j, sweet spot 0,80–1,30 ; TSB Friel :
  build/base −10 à −30, course-A +15 à +25, < −30 = surmenage) **+ forme** (dérive) **+
  ressenti** (RPE). Code : `computeACWR`, `computeDailyPMC`, `getTsbZone`.
- **HRV en GATE, pas optimiseur** : ln-rMSSD (moy. mobile 7 j) vs bande SWC (baseline ± 0,5×SD)
  → dans/au-dessus = séance dure OK ; sous la bande = easy/repos. Baseline ≥ 4 sem.
- ⚠️ **Critiques ACWR** : couplage mathématique (l'aiguë est une composante de la chronique) +
  « sweet spot » contesté → **garde-fou croisé**, jamais seul. Idem dérive 5/10 % = heuristique.

### V6. Qualité & fiabilité d'un verdict

- **Sans montre** : RPE seul = verdict de **confiance basse** (valide mais à confirmer).
- **Séance hors-cible légitime** : course C (= séance qualité de la semaine), terrain imposé,
  test → ne pas la juger « trop dur/facile » sur la grille standard ; la tagger.
- **Reproductibilité** : tous les seuils sont des **constantes documentées** ; mêmes entrées →
  même verdict. Aucune donnée envoyée à l'extérieur, aucun apprentissage opaque.

---

## Sources principales

**Découplage / EF / charge** : TrainingPeaks (aerobic decoupling, EF, Normalized Graded Pace,
TSS/IF/PMC) · Friel (zones FC, TSB) · Foster (sRPE-load, monotony/strain) · fellrnr (decoupling).
**Allure / pacing** : Daniels (VDOT, RPE par zone) · Steve Magness / runningwritings (pacing,
fade) · Strava GAP.
**Trail / pente** : Minetti 2002 (coût métabolique de la pente) · Naismith/Scarf/Langmuir
(temps vs D±) · ITRA (km-effort) · Uphill Athlete (VAM, AeT/AnT, marche) · Koop/CTS trainright
(descente, courir/marcher).
**Descente / durabilité** : Vernillo & Millet (Sports Med 2017 ; économie en pente PMC8281813) ·
dommages descente (PMC11129977) · repeated-bout (MDPI 12/6/169) · durabilité Maunder (PMC9977827).
**Adaptation / readiness** : Gabbett/IOC ACWR (PMC7047972) + critiques (couplage mathématique,
Williams EWMA) · HRV Kiviniemi/Vesterinen (PubMed 26909534) · REDs (consensus IOC 2023, BJSM).

> Les constantes « load-bearing » (bandes VAM, seuils dérive 5/10 %, magnitudes ACWR,
> coefficients Minetti) sont des **garde-fous** : re-vérifier contre la source primaire avant
> de les durcir, et toujours les croiser avec ≥ 2 signaux. Cohérent avec `knowledge-base.md`
> (planification) et `session-feedback-adaptation.md` (design de la boucle prévu→réalisé).
