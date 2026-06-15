# Coach Vorcelab — Analyse de séance réalisée (post-séance)

> Socle de connaissance pour la **lecture d'une séance déjà courue** (prévu → réalisé),
> moteur **algorithmique et déterministe** (aucune IA, mêmes entrées → même sortie).
> Complète `knowledge-base.md` (qui couvre surtout la **planification**) : ici on documente
> **quelles métriques calculer sur une activité, leurs seuils d'interprétation, et comment
> route ≠ trail**. Cible : 5K → marathon **et** trail/ultra. Daté 2026-06-14.
> Constantes recoupées contre des sources 2021-2026 (3 audits web, cf. §Sources).

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
- durée régulière **≥ ~30 min** (idéal 45–60 ; TrainingPeaks n'impose pas de durée mini, mais le test AeT formel se fait sur ~30 min d'effort steady, échauffement exclu) ;
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

### A9. Analyse d'un fractionné (reps réalisées vs cibles)

Sur intervalles, l'allure **moyenne** est `unknown` → on analyse **rep par rep**. Par rep _i_ :
allure `pᵢ`, cible `p*`, écart `δᵢ = (pᵢ − p*) / p* × 100`.

| Métrique (set) | Calcul | Seuil moteur |
|---|---|---|
| **Hit-rate cible** | % de reps dans **±2 %** de `p*` | ≥ 80 % = set conforme |
| **Fade inter-reps** | `(allure_dernier_tiers − allure_1er_tiers) / 1er_tiers × 100` | **< 2 %** sain · **2–5 %** départ trop vite · **> 5 %** set surévalué |
| **CV des reps** | écart-type ÷ moyenne des allures de rep | **≤ ~2–3 %** = exécution régulière |
| **Drift d'effort** | FC du dernier rep − FC du 1ᵉʳ rep, à allure tenue | hausse normale = fatigue saine du set |

Lecture : **reps tenus + FC qui monte** = set bien dosé ; **reps qui ralentissent + FC qui
plafonne** = cible trop ambitieuse → revoir l'allure cible, pas le ressenti.

### A10. Qualité des récupérations

Mesurer la **FC de reprise** (fin de récup, juste avant le rep suivant).

| Signal | Lecture | Action |
|---|---|---|
| FC ne redescend **pas** sous **~70 % FCmax** avant le rep suivant | récup trop courte OU fatigue/forme basse | si ≥ 2 reps → flag « set sous-récupéré » |
| FC de reprise **qui dérive vers le haut** rep après rep | fatigue cumulative (normale en fin) | non pénalisant si reps tenus |
| Récup **active** prescrite mais marche/arrêt observés | exécution non conforme | tagger, ne pas comparer au modèle |

Ratios travail:récup attendus (juger la conformité du *prévu*) : **VO2max ~1:0,5 à 1:1** ·
**seuil/tempo ~1:0,25 à 1:0,5**.

### A11. Critical Speed (CS) & D′ — ancre seuil post-test

Quand ≥ 2 efforts maximaux distincts existent (ex. 1200 m + 3000 m, ou un 3-min all-out) :

```
Distance = CS × Temps + D′      # CS = pente (m/s) ; D′ = ordonnée (m), réserve anaérobie
```

- **CS** ≈ allure soutenable ~30 min ≈ proche allure 10K/seuil → **ancre déterministe** pour
  recaler/contrôler les fourchettes E/M/T/I (alternative au VDOT), pas pour remplacer le `level`.
- **D′** : ordres de grandeur ~60–120 m (fond entraîné). Indicateur, pas constante de verdict.
- **Validité** : préférer 3 efforts (3 / 5–6 / 12 min), durées 2–20 min ; `unknown` si efforts
  non maximaux ou durées trop proches. ⚠️ Dériver des **zones fines** de CS/D′ est contesté →
  rester sur l'usage « ancre seuil ».

### A12. Running power sur route (signal secondaire)

Avec capteur (type Stryd) : `rTSS_power = durée_h × IF² × 100`, `IF = NP ÷ CP` (CP ≈ effort
~40 min) → charge **sans dépendre du GPS**. `EF-power = NP ÷ FC moy` = variante du découplage
**moins sensible au bruit GPS/vent** (même grille < 5 %). ⚠️ La puissance de course est
**modélisée, pas mesurée** → bonne pour la **tendance/régularité**, jamais durcie en zones
absolues ; signal secondaire, croisé.

### A13. Découplage sur tapis (contexte valide)

Sur tapis : allure = réglage machine (fiable), **pas de bruit GPS ni de pente** → le découplage
**allure:FC** y est en fait **plus propre** que dehors. Conditions : inclinaison fixe (idéal
**1 %**), ventilation contrôlée (sinon la chaleur intérieure **surcote** la dérive). → le tapis
est un contexte **valide pour le découplage** (à tagger pour la chaleur), même si l'allure
« terrain » reste, elle, non transposable.

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

- **Coût de la pente (Minetti 2002)** : minimum métabolique **en marche à ~−10 %**, **en course
  à ~−20 %** (distinguer les deux gaits) ; en montée ~**+2,5 % d'effort par +1 % de pente**
  (quasi-linéaire). Implémenté en prod : `minettiGradePenalty(grade)` (forme validée 1-pour-1,
  **ne pas toucher sans test**).
- **Temps** : Naismith/Scarf → **10 min/100 m D+** (5 km/h plat + 1 h/600 m) ; Scarf **α≈7,92**
  → **1000 m D+ ≈ 8 km plat** (règle 8:1 hommes, **~10:1 femmes**). Descente (Langmuir) :
  **−10 min/300 m** si 5–12°, **+10 min/300 m** si > 12° (la descente raide **re-coûte** du temps).
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

- En trail, **marcher n'est pas un échec**. ⚠️ La transition est d'abord une **vitesse**, pas un
  gradient fixe : l'EOTS (*energetically optimal transition speed*) ≈ **7,0–7,5 km/h**, peu
  sensible à la pente sur ±5 %. Le *gradient* où la marche **domine** énergétiquement est plus
  haut (optimum Minetti **~20–30 %**). → raisonner « seuil de vitesse », pas « % de pente unique ».
- **Détection** (`computeClimbStatus`) : `cadence < 130 spm` **ET** `vitesse < 6,5 km/h`
  (fallback sans cadence : vitesse < 5,0 km/h) → bucket marqué `walk`, **intégré au profil**
  (pas pénalisé). On lit le **% de temps marché** et la **qualité de la marche** (VAM en marche).
- **Décision courir/marcher** (par bucket montant, vs EOTS ≈ 7,0–7,5 km/h) :
  - couru à vitesse **< EOTS** → « couru trop lent » (gaspillage, devrait marcher) ;
  - marché à vitesse **> EOTS** → « marche subie » (pourrait courir) ;
  - cohérent avec EOTS → « transition saine ».
  Croisé avec la VAM : % montée raide marchée élevé **+ VAM ≥ 600** = power-hiking efficace
  (atout) ; **+ VAM < 500** = marche subie / technique faible → renfo + drills marche.
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
- Une grosse séance descente altère l'économie **à plat jusqu'à ~5 jours** (heuristique
  extrapolée ; la perte de force/CK à ~4 j est, elle, bien documentée) → à pondérer dans la
  lecture des séances suivantes (une easy « anormalement coûteuse » 2–3 j après peut venir de là).

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

### T11. Running power en trail — usage strictement borné

Le capteur (Stryd) corrèle bien avec VO₂ en montée mais **sous-estime la puissance absolue** et
surtout **la descente** (modèle de pente simpliste). Confiance déterministe :
`power_trust = up:medium · down:low · cross_device:none`.

| Usage | Verdict | Règle |
|---|---|---|
| Intensité **montée** | proxy relatif acceptable | comparable à soi-même, même capteur, même pente |
| Intensité **descente** | **non fiable** | verdict descente sur vitesse/bucket + FC, jamais la puissance |
| Comparaison **inter-appareils** | **interdite** | tagger la source ; ne jamais croiser deux capteurs |

La puissance n'entre **jamais seule** dans un verdict ; signal de confiance `medium` au mieux,
derrière VAM/FC.

### T12. NGP vs GAP — désambiguïsation

- **GAP** = allure ramenée au plat **via la pente seule** (Minetti/Strava). Bon sur roulant.
- **NGP** = GAP **lissé/normalisé** (pondération 30 s ^4, façon NP) → sert au **rTSS** trail.

| Métrique | Entrée | Sert à | Limite trail |
|---|---|---|---|
| GAP | pente | comparer à pente comparable | trop optimiste en technique/descente raide |
| NGP | pente + lissage | charge (rTSS), efforts en dents de scie | hérite des biais GAP, cache les marches |

→ **rTSS via NGP** pour la charge, **mais** lever `gap_unreliable=true` si `% temps technique`
élevé OU `% descente < −12 %` > 20 % → on retombe alors sur **km-effort + temps**.

### T13. Indice de technicité depuis la trace (déterministe)

Le GPS ne voit pas le terrain, mais des **proxys** existent :

```
tech_index = w1·turn_rate + w2·grade_variability + w3·pace_volatility
  turn_rate         = Σ|Δcap| (°) / km                 # sectionTurnDegPerKm (déjà en prod)
  grade_variability = écart-type de la pente (fenêtres 50 m)
  pace_volatility   = écart-type(vitesse) / vitesse_moy (CV) sur le segment
  w1,w2,w3 = 0.4 / 0.3 / 0.3   (normalisés par percentiles maison)
```

| tech_index (0–100) | Lecture | Effet moteur |
|---|---|---|
| < 30 | roulant | GAP fiable, vitesse jugeable |
| 30–60 | mixte | tolérance vitesse élargie +15 % |
| > 60 | technique | descente lente = **terrain**, pas faiblesse ; `gap_unreliable=true` |

### T14. Fatigue de descente cumulée intra-séance (proxy excentrique)

On ne mesure pas la CK, mais on **cumule la charge excentrique** D− pondérée par la raideur :

```
ecc_load = Σ_segments  D−_segment(m) × k(pente)
  k(pente) :  −2 à −6 % → 0.5  ·  −6 à −12 % → 1.0  ·  ≤ −12 % → 1.8
descent_fade = comparer 2e tiers vs 1er tiers : vitesse_descente ↓ > 10 %
               À FC égale/↑ ET turn_rate stable (≠ terrain → fatigue) → fade réel
```

Sortie `descent_fade = none / moderate / marked`. Si `marked` + grosse `ecc_load` → réinjecter
en **alerte récup ~4 j** sur les séances suivantes (cf. T6). Code voisin : `DownhillFatigueProfile`.

### T15. Charge spécifique D+ : 3 axes non interchangeables

| Axe | Formule | Capte | Quand |
|---|---|---|---|
| **km-effort ITRA** | `dist_km + D+_m/100` | volume + dénivelé (catégorisation) | comparer/ranger des sorties |
| **Scarf-équivalent** | `dist_km + 7,92·D+_km` (×10 femmes) | **temps** équivalent plat | estimer/juger le temps |
| **Time-on-feet × D±** | `durée_h` + `ecc_load` (T14) | **fatigue réelle** (excentrique + durée) | readiness ultra / B2B |

→ La **charge PMC** reste sur rTSS/sRPE, mais on **affiche les 3** ; une divergence forte
(km-effort bas mais time-on-feet long) = sortie « durée-dominante » → ne pas juger à l'allure.

### T16. Durabilité chiffrée (découplage par tiers)

Formaliser la durabilité (T7) en **ratio interne/externe par tiers** plutôt que début/fin :

```
dec_ratio(tiers) = FC_moy(tiers) / GAP_moy(tiers)   (ou FC / VAM en montée)
fade = (dec_ratio_T3 − dec_ratio_T1) / dec_ratio_T1 × 100
```

| fade | Durabilité | Action |
|---|---|---|
| < 5 % | solide (gate readiness ultra OK) | progresser durée/D± |
| 5–10 % | limite modérée | + volume aérobie long, fin de longue active |
| > 10 % | faible | résistance fatigue (intensité/renfo en fin de longue), pas d'ajout D− dur |

Garde-fou : `fade` ininterprétable si terrain T1 ≠ T3 → croiser `tech_index`/mix de buckets → `unknown`.

### T17. Analyse B2B / time-on-feet (bloc 2 jours)

| Signal (J2 vs J1) | Seuil | Lecture |
|---|---|---|
| VAM montée J2 / J1 | ≥ 0,90 | objectif B2B atteint (courir sur jambes fatiguées sans effondrement) |
| FC montée J2 à VAM égale | ≤ +5 % | durabilité inter-jours OK |
| `descent_fade` J2 (T14) | none/moderate | dommage excentrique géré |
| time-on-feet cumulé/jour | **> 8 h** | au-delà : récup > bénéfice → **splitter** |

→ Le verdict d'un B2B se lit à la **stabilité J2** (VAM, FC, fade), **jamais** à l'allure
moyenne. Un J2 plus lent mais à VAM:FC stable = **réussi**.

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
| **Strain (Foster)** | charge hebdo × monotony | **pas de seuil universel** (dépend de l'unité de charge) → individualiser en z-score vs baseline 4–6 sem ; `z_strain > +1,5` = pic |
| **Tendance EF / découplage** | sur N semaines, à zone constante | EF↑ / découplage↓ = **durabilité qui progresse** |
| **Convergence niveau/VDOT** | allures réelles durablement hors fourchette supposée | ajuster doucement le `level`/VDOT (pas d'à-coup) |
| **Points faibles rafraîchis** | statuts buckets montée/descente sur les dernières sorties | maintenir/lever le boost (climbing…) selon le réalisé, pas un profil figé |

### V5. Readiness & garde-fous croisés (jamais un seul signal)

- Croiser **charge** (ACWR aiguë 7 j / chronique 28 j, sweet spot 0,80–1,30 ; TSB Friel :
  build/base −10 à −30, course-A +15 à +25, < −30 = surmenage) **+ forme** (dérive) **+
  ressenti** (RPE). Code : `computeACWR`, `computeDailyPMC`, `getTsbZone`.
- **HRV en GATE, pas optimiseur** : ln-rMSSD (moy. mobile 7 j) vs bande SWC (baseline ± 0,5×SD)
  → dans/au-dessus = séance dure OK ; sous la bande = easy/repos. Baseline ≥ 4 sem.
- ⚠️ **Critiques ACWR** : couplage mathématique (l'aiguë est une composante de la chronique →
  artefact reproductible même avec une chronique aléatoire) + « sweet spot » contesté. L'ACWR est
  un **outil de monitoring de charge, PAS un prédicteur de blessure** (Hulin/Gabbett eux-mêmes
  ont regretté le verbe « predicts ») → **garde-fou croisé**, jamais seul. Idem dérive 5/10 %.

### V6. Qualité & fiabilité d'un verdict

- **Sans montre** : RPE seul = verdict de **confiance basse** (valide mais à confirmer).
- **Séance hors-cible légitime** : course C (= séance qualité de la semaine), terrain imposé,
  test → ne pas la juger « trop dur/facile » sur la grille standard ; la tagger.
- **Reproductibilité** : tous les seuils sont des **constantes documentées** ; mêmes entrées →
  même verdict. Aucune donnée envoyée à l'extérieur, aucun apprentissage opaque.

### V7. ACWR en EWMA (variante recommandée)

Le rolling average pèse tous les jours pareil ; l'**EWMA** (décroissance exponentielle) est plus
sensible et physiologiquement plus juste.

```
lambda_aigue     = 2 / (7+1)  = 0.25
lambda_chronique = 2 / (28+1) ≈ 0.069
EWMA_j   = charge_j × lambda + EWMA_(j−1) × (1 − lambda)   # init = charge du 1er jour
ACWR_ewma = EWMA_aigue / EWMA_chronique          # = MONITORING DE CHARGE, pas prédiction blessure

SI ACWR_ewma ∈ [0.80 ; 1.30] → progression de charge saine
SI ACWR_ewma > 1.50          → pic de charge → garde-fou (croiser TSB, HRV, RPE)
SI ACWR_ewma < 0.80 (≥ 2 sem)→ désentraînement → ré-augmenter progressivement
# GARDE-FOU : ACWR seul ne coupe JAMAIS la charge ; exiger ≥ 2 signaux convergents.
```

### V8. Readiness score pondéré auditable (gate, pas optimiseur)

```
# Sous-signaux normalisés en {+1 favorable, 0 neutre, −1 défavorable}
s_hrv     : ln-rMSSD 7j ≥ borne_basse_SWC → +1 ; dans bande → 0 ; sous bande → −1   (poids 1.0)
s_sommeil : ≥ baseline−0.5h → +1 ; −0.5 à −1h → 0 ; < −1h ou < 6h → −1               (poids 0.8)
s_fcrepos : ≤ baseline+3 → +1 ; +3 à +7 → 0 ; > +7 bpm → −1                          (poids 0.7)
s_acwr    : ∈ [0.80;1.30] → +1 ; 1.30–1.50 → 0 ; > 1.50 ou < 0.80 → −1               (poids 0.6)
s_rpe     : RPE ≤ prévu → +1 ; +1 cran → 0 ; ≥ +2 crans → −1                         (poids 0.9)

readiness = Σ(poids × signe) / Σ(poids des signaux connus)        # ∈ [−1 ; +1], auditable
confiance = high SI ≥ 4 signaux dont HRV ; medium SI ≥ 3 ; low sinon

SI readiness ≥ +0.33        → feu vert : qualité/longue comme prévu
SI −0.33 < readiness < +0.33→ feu orange : maintenir le volume, downgrade l'intensité d'un cran
SI readiness ≤ −0.33        → feu rouge : easy ou repos (gate prioritaire sur le plan)
# GARDE-FOU : HRV sous SWC OU FCrepos > +7 → plafonne à feu orange même si le score global est ok.
```

### V9. Détection surmenage multi-signaux

```
# Fenêtre 7 j, charge quotidienne sRPE-load
monotony = moyenne(charges_7j) / ecart_type(charges_7j)
strain   = somme(charges_7j) × monotony
z_strain = (strain − moyenne_baseline) / ecart_type_baseline      # individualisé (baseline 4–6 sem)

SI monotony > 2.0                              → variété insuffisante → injecter 1 jour bas
SI monotony > 2.0 ET charge_hebdo top-tercile  → risque maladie/NFOR élevé (combinaison Foster)
SI z_strain > +1.5                             → pic de strain → semaine d'allègement
SI (HRV 7j ↓ ≥ 3 sem) ET (EF/découplage qui se dégrade à zone constante) → suspicion overreaching
# GARDE-FOU : ≥ 2 signaux convergents avant d'alléger.
```

### V10. Garde-fou REDs / faible disponibilité énergétique (LEA)

```
EA = (apport_kcal − depense_exercice_kcal) / FFM_kg      # si données dispo
SI EA ≤ 30 kcal/kg FFM/j (plusieurs jours) → drapeau LEA → NE PAS prescrire de surcharge
SI ≥ 2 signaux indirects { FCrepos basse+fatigue, HRV durablement effondrée, perte de poids non
   voulue, blessures de stress répétées, perf en chute à charge stable, aménorrhée signalée }
   → drapeau REDs → orienter nutrition/médical, geler la progression
# GARDE-FOU : LEA prime sur tout verdict « trop_facile » et toute prescription d'intensité.
#            Déterministe = signal d'orientation, JAMAIS un diagnostic médical.
```

### V11. Recalibrage VDOT / Critical Speed depuis le réalisé

```
# Sources admissibles : course officielle, test terrain (2 efforts max), séance T/I propre.
VDOT_observe = VDOT(meilleure perf récente)        # équivalences Daniels ; CS via §A11

SI |VDOT_observe − VDOT_courant| ≤ 1 pt                       → bruit, pas de changement
SI VDOT_observe > VDOT_courant (≥ 2 perfs concordantes, ≥ 2 sem) → +1 pt max/cycle (anti-à-coup)
SI VDOT_observe < VDOT_courant durablement (hors fatigue/chaleur) → −1 pt après check readiness
# GARDE-FOU : recalibrer SEULEMENT sur effort valide (pas course C, pas chaleur, pas technique) ;
#            plusieurs points > une perf isolée ; changement borné à ±1 pt/cycle.
```

### V12. Séance hors-cible légitime

```
SI séance taguée {course_C, terrain_impose, test_terrain, sortie_decouverte}
   → NE PAS appliquer la grille trop_dur/trop_facile → verdict = "hors_cible" (neutre)
   → alimente quand même charge/PMC/ACWR ; sert au recalibrage (V11) SI effort valide
# GARDE-FOU : une course C dure ne déclenche PAS d'allègement automatique du bloc suivant
#            (c'était l'objectif), mais compte dans monotony/strain et ACWR.
```

---

## Récupération post-course (avant de relancer un programme)

Après une course, le nouveau programme **commence par un bloc de récupération** (*reverse
taper*) **avant** de relancer la charge — sinon on empile la fatigue sur des tissus encore
abîmés. La durée n'est **pas un forfait fixe** : elle est **proportionnelle à la demande**
(distance × intensité × dénivelé excentrique).

| Course | Récup recommandée | Notes |
|---|---|---|
| 5K–10K | **~3–5 j** | reprise easy rapide |
| Semi | **~1 semaine** | |
| 30K | **~10–11 j** | |
| **Marathon / 50K** | **~2 semaines** | repère « 2 semaines » classique (reverse taper) |
| 50 mi / 80K | **~3 semaines** | |
| 100K+ | **~4 semaines** | |

**Surcharge dénivelé (excentrique)** : le D− (descentes) ajoute des dommages musculaires
(perte de force ~4 j, CK élevé) → **+2 j (≥500 m), +4 j (≥1200 m), +7 j (≥2500 m)**.

**Forme du bloc** : footings **très faciles uniquement**, **zéro intensité**, volume réduit qui
**remonte progressivement** (1re semaine la plus légère). On laisse récupérer **muscles + SNC +
immunité**. La récup « mange » sur le début de la prépa suivante (elle ne s'ajoute pas).

```
recoveryDays = bucket(distance) + bumpDplus(D+)
recoveryWeeks = min(3, ceil(joursRestants / 7))   # joursRestants = recoveryDays − joursÉcoulés
SI une course terminée < recoveryDays jours → démarrer le plan par `recoveryWeeks` semaines
   de reverse taper (easy only), SANS écraser un affûtage de course imminente.
```

→ Code : `postRaceRecovery.ts` (`recoveryDaysForRace`, `computePostRaceRecovery`) +
`planGenerator.ts` (`buildPostRaceRecoveryWeek`, override des 1res semaines).

---

## Sources principales

**Découplage / EF / charge** : TrainingPeaks (aerobic decoupling, EF, NGP, TSS/IF/PMC) ·
test AeT 5 % vs 10 % débattu (Evoke Endurance) · Friel (zones FC, TSB) · Foster 1998
(sRPE-load, monotony/strain ; PubMed 9662690) · fellrnr (decoupling, GAP).
**Allure / pacing / fractionné** : Daniels (VDOT, RPE par zone) · runningwritings 2024 (récup
des fractionnés) · Run Baldwin (ratios travail:récup) · Strava GAP.
**Critical Speed / power** : Vanhatalo 2011 · High North Running (CS/CP) · Stryd / TrainingPeaks
(running power, rTSS-power ; validité Stryd PMC7404478, sous-estimation puissance).
**Trail / pente** : Minetti 2002 (J Appl Physiol 01177.2001 ; min marche −10 %/course −20 %) ·
Scarf 2007 (PubMed 17454539 ; α≈7,92, 8:1 H / 10:1 F) · Naismith/Langmuir · ITRA (km-effort) ·
EOTS (PMC4575035 ; transition ~7,5 km/h) · Uphill Athlete (VAM, AeT/AnT, marche) · Koop/CTS.
**Descente / durabilité** : Vernillo & Millet (Sports Med 2017 ; économie en pente PMC8281813,
optimum −14/−20 %) · dommages descente MVIC/CK ~4 j (PMC11129977) · repeated-bout (PMC12846201,
PMC12617245) · durabilité Maunder (PMC9977827) ; durabilité terrain trail (IJSPP 2025) ;
decoupling ratio ↔ perf (Front Sports Act Living 2025).
**Adaptation / readiness** : ACWR critiques — couplage mathématique, « pas un prédicteur de
blessure » (PMC8138569 Impellizzeri 2021 ; PubMed 33332011) ; EWMA (Williams 2017, RG 311860780) ·
TSB/CTL/ATL (Friel, TrainingPeaks) · HRV/SWC Kiviniemi/Vesterinen (PubMed 26909534 ; PMC8006223) ·
REDs / EA ≤ 30 kcal/kg FFM (consensus IOC 2023, BJSM) · VDOT/CS recalibrage (PMC11534629).

> Les constantes « load-bearing » (bandes VAM, seuils dérive 5/10 %, magnitudes ACWR,
> coefficients Minetti) sont des **garde-fous** : re-vérifier contre la source primaire avant
> de les durcir, et toujours les croiser avec ≥ 2 signaux. Cohérent avec `knowledge-base.md`
> (planification) et `session-feedback-adaptation.md` (design de la boucle prévu→réalisé).
