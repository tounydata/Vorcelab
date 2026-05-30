# Coach Vorcelab — Couche 3 : Predictive & Modeling Layer

> Troisième couche de la base de connaissances. Couche 1 = socle entraînement. Couche 2 = personnalisation/sécurité/adhérence.
> **Cette couche 3 = le cœur mathématique** : les modèles qui transforment les données de l'athlète en **prédictions,
> pacing optimal, et paramètres physiologiques individualisés**. C'est ce qui permet d'**égaler ou dépasser**
> Garmin/COROS/Stryd — en **transparent et déterministe** (aucune IA boîte noire, que des équations sourcées).
>
> Format : **Équation/constante · paramètres & plages · comment fitter depuis les données · confiance · usage moteur.**
>
> ⚠️ **Principe directeur** : tout paramètre fitté porte une **confiance** (intervalle). Le moteur ne prend jamais
> de décision agressive sur un paramètre mal identifié (typiquement D'/W'). Architecture recommandée : **prior de
> population → posterior individuel** (bayésien) — chaque test rapproche l'estimation de l'athlète réel.

---

## 1. Modèle de charge fitness-fatigue (Banister / Busso)

**Équation (récursive, codable directement)** :
```
fitness  = fitness · exp(−1/τ1) + TRIMP[jour]      # composante lente (forme)
fatigue  = fatigue · exp(−1/τ2) + TRIMP[jour]      # composante rapide (fatigue)
perf     = P0 + k1·fitness − k2·fatigue
```
**Constantes littérature** : `τ1 ≈ 42-50 j` (forme), `τ2 ≈ 7-15 j` (fatigue), `k1 = 1`, `k2 ≈ 1.8-2.0`.
Contraintes structurelles : **k1 < k2** (une séance fatigue plus qu'elle ne muscle à court terme) et **τ1 > τ2**
(la forme décroît plus lentement que la fatigue) — c'est la base de la surcompensation/affûtage.

**Extension Busso (dose-réponse variable)** : `k2` devient dépendant de l'historique récent (la fatigue d'une
séance dépend de l'intensité des séances précédentes → fatigue qui s'accumule). Plus fidèle, plus complexe.

**Fitting** : `(P0, k1, k2, τ1, τ2)` par moindres carrés non-linéaires sur l'historique. ⚠️ **Les k absolus
dépendent des unités de TRIMP/perf** → toujours re-fitter par athlète ; **borner les τ près des plages
littérature** pour éviter le mauvais conditionnement (plusieurs jeux de paramètres ajustent aussi bien).
**Confiance** : modèle mal conditionné → traiter comme indicatif, pas comme vérité absolue.
**Usage moteur** : **on a déjà CTL/ATL/TSB en prod** (`trainingLoad.ts`, τ=42/7, c'est exactement ce modèle avec
k1=k2=1). Cette section justifie nos constantes et ouvre la voie à un `perf` prédictif + Busso plus tard.

---

## 2. Critical Speed (CS) & D' — le moteur de pacing

**Modèles équivalents** :
- linéaire : `D = CS·t + D'` (CS = pente m/s, D' = capacité de distance au-dessus de CS, en mètres)
- hyperbolique : `t_lim = D' / (v − CS)` (temps tenable à vitesse v > CS)
- inverse : `v = CS + D'/t`

**Estimation depuis 2 efforts max** (un 2-points vaut un 3-points) :
`CS = (D2 − D1)/(T2 − T1)` · `D' = D1 − CS·T1`. Efforts de **2-20 min** (idéal 3-12 min), bien espacés en
% de vitesse de pic. Alternative 1 séance : **test 3 min all-out** → CS = vitesse moyenne des 30 dernières s,
D' = distance parcourue au-dessus de CS.

**Estimation depuis l'historique GPS (Smyth & Muniz — le plus pertinent pour nous)** : prendre la **meilleure
allure ajustée à la pente** sur 400/800/1000/1500/3000/5000 m (courbe vitesse-maximale-moyenne), puis CS = pente
de la régression distance-temps. **Requiert ≥24 activités sur 16 sem** et ≥3 distances distinctes. Meilleure
combo prédictive : **400+800+5000 m** (erreur ~7,7 % sur la perf marathon).

**Plages de référence** : CS ≈ **87-91 % de la VMA/MAS**, proche du seuil. D' : non-entraîné 100-200 m ·
récréatif 200-300 m · entraîné 300-400 m · élite 400-500+ m.
**Confiance — pitfall majeur** : **CS très précis (±1-3 %)** mais **D' très imprécis (±14-21 %)**. → fitter en
**moindres carrés pondérés** ; modéliser les bandes d'intensité à **±10 %** ; **ne jamais prendre de décision
agressive sur D' seul**.
**Usage moteur** : CS = épine dorsale de prédiction et de pacing (plus solide que VDOT au-delà du marathon).

---

## 3. D'-balance (Skiba) — pacing seconde par seconde

**Modèle intégral (Skiba 2012)** :
`D'bal(t) = D' − Σ D'exp(u)·e^(−(t−u)/τ)`, avec `D'exp = (v − CS)` quand v > CS (sinon recharge).
**Constante de reconstitution** : `τ = 546·e^(−0.01·DCP) + 316` secondes, où `DCP = CS − (vitesse moyenne des
segments de récup sous CS)`. Recharge ~63 % de D' en 1τ.
**Modèle différentiel (Skiba 2015, moins coûteux)** : `dD'bal/dt = −(v−CS)` si v>CS, sinon recharge exponentielle
avec τ = D'/(CS − v_récup).

**Usage moteur (le différenciateur pacing)** : suivre D'bal le long du GPX **segment par segment** — les montées
dépensent D', les descentes/plats sous CS le rechargent. **Contrainte de pacing : D'bal ne doit jamais atteindre
0 avant l'arrivée.** Validé : prédit les positions de fin de course (qui a vidé son D' ne peut plus suivre).
**Confiance** : hérite de l'imprécision de D' (±14-21 %) → marge de sécurité sur le D'bal minimal visé.

---

## 4. VO2 kinetics — design des intervalles

**Modèle phase-II** : `VO2(t) = VO2base + ΔY·[1 − e^(−(t−TD)/τ)]`, délai TD ≈ 15-25 s.
**τ** : entraîné ~10-15 s · non-entraîné ~18-24 s (s'allonge à haute intensité, raccourcit avec l'entraînement).
**Temps pour atteindre VO2max** : **~90-150 s** dans le domaine sévère. **Composante lente** au-dessus de CS :
montée supplémentaire de VO2 dès ~2 min même à vitesse constante.
**Usage moteur** : justifie le design des séances VO2max — reps **3-5 min** pour accumuler du temps à VO2max ;
récup courte pour garder VO2 élevé ; un athlète à τ bas atteint VO2max plus vite → plus de temps utile par rep.

---

## 5. Prédiction de temps de course

**Riegel** : `T2 = T1·(D2/D1)^k`. Exposant **k ≈ 1.06** par défaut. Personnalisable depuis 2 courses de
l'athlète : `k = ln(T2/T1)/ln(D2/D1)`. Plages : vitesse ~1.03-1.05 · fond/fade ~1.07-1.10 · **ultra 1.08-1.15**.
**Limites** : précis à ±2-3 % si **ratio de distance < 4:1** ; surestime (trop optimiste) sur 5k→marathon et
**sous-estime la fatigue en ultra**.

**VDOT (Daniels-Gilbert)** — les équations complètes, codables :
```
VO2(v)   = −4.60 + 0.182258·v + 0.000104·v²          # v en m/min, ml/kg/min
%max(t)  = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)   # t en min
VDOT     = VO2(v) / %max(t)
```
Fraction soutenable par durée : ~5 min ≈ 98 % VO2max · ~1 h ≈ 90 % · **marathon ≈ 82-84 %**.
Limite : suppose une spécificité d'entraînement égale (un coureur de 5k sous-performe son équivalent marathon).

**Ultra / trail** : les modèles route échouent (D+, terrain, nuit, ravitos). Utiliser :
- **distance équivalente plat** : `km-effort = km + D+_m/100` (≈ Naismith : 100 m D+ ≈ 1 km).
- **ITRA Performance Index** (0-1000) : temps sur la distance équivalente × coefficient de conditions ; moyenne
  pondérée des 5 meilleures courses sur 36 mois avec décroissance temporelle.
- **Workflow recommandé** : GPX → coût Minetti/GAP par segment → intégrer en distance équivalente plat → Riegel
  avec exposant ultra (1.08-1.15) → soustraire pénalités chaleur/altitude (§6).

**Modèles avancés** (pour le choix selon la distance) : pour **1500-10000 m** le plus précis est l'hyperbolique
3-paramètres (Morton) ; **au-delà de 10 km** ce sont les modèles **log (Péronnet-Thibault)** et **puissance
(Riegel)** qui gagnent. Péronnet-Thibault : `v = VMA − E·ln(t_lim/420)` (420 s = durée tenable à VMA).
**Recette moteur** : hyperbolique CS/D' pour pacing 2-20 min ; log/puissance pour prédiction longue distance.

---

## 6. Ajustements environnementaux (pénalités chiffrées)

**Chaleur** : optimum ~**9-10 °C** (2-13 °C quasi équivalent). Ralentissement **par +5 °C WBGT** selon niveau :
élite ~0,9 % · 50e ~1,5 % · 300e/3h00 ~3,2 % (**les plus lents souffrent le plus**). Du frais au chaud
(WBGT 5→25 °C) : élite ~4,5 %, lents ~12,8 %. Régulation anticipée : on ralentit avant ~39 °C core (limite ~40 °C).
Point de rosée (humidité) : `allure_ajustée = allure_base + (rosée_°F − 60)×0,025 min/mile`.

**Altitude** : VO2max −1 %/1000 m sous 1500 m, puis ~−6 %/1000 m au-dessus. **Perf** (plus faible que VO2max) :
2-4 % plus lent >1000 m, 4-6 % à ~2200 m. ~1/3 récupérable en ~2 sem d'acclimatation.

**Usage moteur** : ces pénalités modulent la projection de temps ET le pacing cible le jour J (croise météo Strava
qu'on synchronise déjà).

---

## 7. Pacing optimal (théorie + algorithme)

**Splits** : pacing régulier = optimal physiologiquement ; **léger négatif (0-1 %) = idéal marathon**. Réalité :
87 % des marathons sont en split positif ; les meilleurs sont les plus réguliers (sub-2h30 ≈ +2,6 % vs >5h ≈ +13 %).
**Ultra = fade contrôlé** : dropoff total lents ~40 %, milieu ~25-30 %, rapides le moins. Pattern : entrer doux
(premiers 10-15 %), tenir l'effort relatif au milieu (~60 %), ralentir progressivement sur les ~25 % finaux.

**Pacing GPX équi-EFFORT (le bon principe)** : tenir le **coût physiologique constant**, pas l'allure.
Coût Minetti (cal·kg⁻¹·km⁻¹) : `Cr(i) = 155.4·i⁵ − 30.4·i⁴ − 43.3·i³ + 46.3·i² + 19.5·i + 3.6` (i = pente
décimale). Facteur GAP = Cr(i)/Cr(0). ⚠️ **Corriger la descente sous −10 %** (Minetti sur-estime le bénéfice ;
le terrain technique majore le coût réel — déjà notre caveat en prod).
**Crossover power-hike** : marcher devient plus économique que courir vers **15-20 % de pente** (à 30 %+ la marche
gagne presque toujours). Pente de montée la plus efficace ~25-28 %.

**Cadre d'optimisation** : minimiser le temps total sous contrainte `D'bal ≥ 0` ET `glycogène ≥ 0`, état = (D'bal,
carburant), contrôle = effort par segment. C'est un problème de programmation dynamique / contrôle optimal — **à
construire** (aucune source ne le formalise explicitement pour la course, mais le cadre est standard).
**Usage moteur** : c'est exactement la « stratégie de course exécutable » — notre `computeRaceProjection` calcule
déjà le temps par segment ; on ajoute D'-balance + budget énergie pour passer de *projection* à *pacing optimal*.

---

## 8. Budget énergie & hydratation (plan de course chiffré)

**Glycogène** : ~**500 g** stockés (muscle ~400 + foie ~100-120) ≈ **2000 kcal**. Coût ≈ **1 kcal·kg⁻¹·km⁻¹**
(~70 kcal/km pour 70 kg). Oxydation glucides à allure course ~2-3 g/min.
**Math du « mur »** : 2000 kcal ÷ 70 kcal/km ≈ **29 km** sans apport → insuffisant au-delà de ~30 km.
**Apport** : plafond glucose seul ~**60 g/h** (transporteur SGLT1 saturé) ; **glucose+fructose → ~90-105 g/h**
(jusqu'à 120). Finishers ultra >250 kcal/h vs DNF <200 kcal/h. Charge pré-course 8-10 g/kg/j sur 24-48 h.
**Modèle** : `déficit/h = combustion − apport` ; allure soutenable bornée où le déficit cumulé ≤ réserve glycogène.

**Hydratation/sodium** : sueur **0,5-2,0 L/h** (marathon ~0,9-1,0). Sodium sueur **~200-2000 mg/L** (moy ~900).
`perte_Na/h = débit_sueur(L/h) × [Na]sueur(mg/L)`. Remplacer **fluide ≤ débit de sueur** (ne pas dépasser →
risque hyponatrémie <135 mmol/L), sodium **300-1000+ mg/h**, **majoré par la chaleur**.
**Usage moteur** : génère le **plan nutrition par tronçon** + fiche par ravito (complète le crew plan existant).

---

## 9. Fitting des paramètres individuels (depuis les données Strava)

**Tableau de bord du fitting** :
| Paramètre | Méthode | Données mini | Confiance |
|---|---|---|---|
| CS | régression D=CS·t+D' sur best-efforts 2-20 min, ou historique (Smyth) | 2-3 efforts, ou ≥24 act./16 sem | CS ±1-3 % |
| D' / W' | intercept de la même régression | idem | **±14-21 % (faible)** |
| VDOT/VMA | course max ≤4-8 sem, ≥3000 m | 1 course (5k/10k idéal) | bonne ; décroît 2-5 pts/4 sem off |
| LT1/AeT | **DFA alpha-1 = 0,75** (HRV non-linéaire) | RR beat-to-beat, artefacts <5 % | forte si capteur ceinture |
| LT2 | **DFA alpha-1 = 0,5** | idem | forte |
| Coût pente perso | régression allure (norm. FC) vs tranches de pente | sorties trail variées | moyenne |
| VAM par pente | déjà calculé en prod (`runnerProfile`) | streams trail | selon couverture |
| Durabilité | dérive seuil/économie vs charge accumulée ; **decoupling** | longue ≥60-90 min | moyenne |
| Débit sueur | méthode pesée pré/post `(M_pre − M_post + boisson − urine)/durée` | 1 séance contrôlée | CV 5-7 % (bonne) |
| Sodium sueur | patch/test | test dédié | CV 11-17 % (bruité) |

**Durabilité — chiffres de référence** : après 90 min, l'allure au seuil chute ~5,5 % et VO2peak ~6 % (la
%-variation corrèle à la perf marathon, r=0,68). **Decoupling** (Pa:HR 1ère vs 2e moitié) : <5 % solide ·
5-10 % modéré · >10 % au-dessus de l'AeT ou base insuffisante. Sur 82 000 marathoniens : decoupling moyen ~16 %,
onset à ~25 km ; les athlètes durables démarrent la dérive plus tard (33 km vs 19 km).

**Confiance & bayésien (architecture recommandée)** : chaque paramètre part d'un **prior de population** (plages
normales) puis se met à jour avec les données de l'athlète (**posterior**). Priors conjugués (Normal→Normal) =
mise à jour fermée et bon marché. **La variance du prior gouverne l'influence** : prior large quand on veut que
les données de l'athlète dominent, prior serré quand les données sont rares. Ça **opère simultanément** la
pondération par récence, par couverture de streams et par taille d'échantillon. → c'est notre §9 « data
confidence » de la couche 2, rendue quantitative.

---

## 10. Égaler/battre les wearables (Garmin/COROS/Stryd) — en transparent

**Comment ils calculent (pour s'aligner ou dépasser)** :
- **VO2max (Firstbeat)** : relation HR↔allure sous-maximale extrapolée vers FCmax. Précision ~**5 % MAPE**
  (erreur <3,5 ml/kg/min). **Borné par la précision de FCmax** → on a un avantage si on mesure la vraie FCmax
  (field test) au lieu de la formule d'âge.
- **Prédicteur Garmin** = VDOT-équivalence → **optimiste au marathon** (jusqu'à ~40 min trop rapide) car suppose
  qu'on tient la forme courte distance sur marathon. **COROS EvoLab** pondère les 6 dernières semaines (longue
  >30 km → marathon ; tempo ~60 min → 10k/semi).
- **Stryd CP** : puissance de course estimée (IMU), CP sur ~3 mois ou test 9/3 min. CP ≈ **VT2/OBLA ≈ 88,7 %
  VO2max**, explique **73-89 %** de la variance de perf. **CP/CS = meilleure épine dorsale de prédiction que
  VDOT** au-delà du marathon.
- **Training Effect (Firstbeat)** : scalaire 0-5 mappé du pic d'EPOC. **Recovery Time** 0-96 h. **Angle mort
  connu : aucun ne capte les dommages excentriques (descente, longue)** → opportunité (on a déjà le profil descente
  et la co-périodisation renfo pour le faire).

**Le point faible de TOUS les wearables = la prédiction d'allure au seuil (LT pace) : surestimée de 12-26 %.**
L'allure au seuil **HR** est fiable (~6-7 % MAPE), mais l'**allure** est le maillon faible de toute l'industrie.
→ **C'est précisément là qu'on peut les battre** : un LT pace transparent et bien calibré (DFA a1 + CS + decoupling)
serait meilleur que ce que vend Garmin/COROS. Cible produit explicite.

---

## Comment la couche 3 s'imbrique

- **CTL/ATL/TSB** (prod) = §1 Banister avec k=1 → on peut enrichir vers un `perf` prédictif.
- **`computeRaceProjection`** (prod) = §5+§7 → on y branche D'-balance (§3) + budget énergie (§8) pour passer de
  *projection* à *pacing optimal exécutable* (la feature différenciante).
- **`runnerProfile`** (prod, VAM par pente, decoupling, récup) = déjà du §9 → on y ajoute CS/D', DFA a1, durabilité.
- **§9 data confidence couche 2** ← rendue quantitative ici (bayésien prior→posterior).
- **Cible compétitive** (§10) : battre les wearables sur l'allure au seuil et la prise en compte des dommages
  excentriques trail.

> Toutes les constantes load-bearing (coefficients Minetti, τ Banister, exposants Riegel, τ Skiba) sont à
> re-vérifier contre la source primaire avant hard-code. Les paramètres mal identifiés (D'/W', sodium sueur)
> portent une confiance basse et ne pilotent jamais une décision agressive seuls. Sources : 5 rapports de
> recherche (2026-05-30), références primaires listées dans chaque rapport (Banister/Busso, Skiba, Minetti,
> Daniels-Gilbert, Riegel, Péronnet-Thibault, Smyth & Muniz, Maunder/durabilité, Firstbeat/Stryd, DFA a1).
