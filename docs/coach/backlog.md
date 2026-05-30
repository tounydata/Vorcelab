# Coach Vorcelab — Backlog produit (du savoir-coach au produit)

> Traduit les **couches de connaissance 1-4** en items **buildables et priorisés**, ancrés dans le code existant.
> Convention état : ✅ bâti · 🟡 partiel · 🔴 absent. Priorité : **P0** (fondation/sécurité) → **P3** (confort).
> Daté 2026-05-30. Source : recherche couche 4 (5 volets) + cartographie `src/lib`.

## Légende des rattachements

| Couche | Doc | Statut code (vérifié dans `src/lib`) |
|---|---|---|
| 1 — Knowledge | `knowledge-base.md` | charge/PMC/ACWR/TSB ✅ · qualité séance ✅ (classification seule) · **allures/VDOT** 🔴 · **générateur séances** 🔴 |
| 2 — Intelligence | `intelligence-layer.md` | profil coureur/ability 🟡 (buckets/dérive/recovery ✅, fatigue descente *scaffold*, injury adapt 🔴) · race strategy 🟡 |
| 3 — Predictive | `predictive-layer.md` | fitness-fatigue ✅ · projection course ✅ · nutrition 🟡 · critical speed 🔴 |
| 4 — Behavioral | `behavioral-layer.md` | **entièrement** 🔴 (aucun code) |

> ✅ **Statuts vérifiés sur pièce** par un audit fonctionnel de `src/lib` (2026-05-30, preuves `fichier:ligne`). L'audit confirme l'alignement des épopées : **A=🔴, B=🔴, C=🟡, D=🔴, E=🟡** — pas de surprise majeure, et le risque d'intégration `renfoUtils` est prouvé (voir plus bas).

---

## Principe transversal — Fonctions dormantes

> **Règle d'architecture** : certains signaux sont **prévus dans l'architecture** (interfaces, schéma de données, points d'extension) mais **le moteur actuel ne s'appuie PAS dessus** tant qu'une source de données réelle n'existe pas. On les marque **🌙 dormant**.

**Pourquoi** : Vorcelab n'a **aujourd'hui aucun accès à l'API Garmin** (ni à un équivalent). Toute logique qui dépendrait de données appareil non disponibles serait du moteur « fantôme » — non testable, non fiable, trompeur.

| Signal | Source | Statut | Règle moteur |
|---|---|---|---|
| **HRV** (VFC, Ln-rMSSD) | Appareil (Garmin/montre) | 🌙 **dormant** | Schéma + hook prévus ; **non consommé** par le moteur |
| **Sommeil** (durée/qualité mesurée) | Appareil | 🌙 **dormant** | idem |
| **Stress** (score continu) | Appareil | 🌙 **dormant** | idem |
| **Readiness / Body Battery** | Garmin (propriétaire) | 🌙 **dormant** | idem — pas d'API, pas d'algo possible |
| RPE, plaisir, douleur **auto-déclarés** | Saisie utilisateur | ✅ **actif** | input manuel, disponible aujourd'hui (D3/E1/E3) |
| FC, allure, GPS, dénivelé, streams | Strava | ✅ **actif** | source de données réelle actuelle |
| VO2max, FCmax, seuil **saisis** | Profil manuel | ✅ **actif** | déjà dans `ProfilePage` |

**Implications concrètes :**
- Le **moteur de surcharge (E2)** croise aujourd'hui **ACWR (✅) + RPE auto-déclaré (✅)** — **pas** HRV ni readiness (🌙). Le 3ᵉ signal « bien-être » de E2/E3 = **auto-déclaré** (sommeil/humeur ressentis saisis à la main), jamais mesuré appareil.
- Prévoir une **interface `ReadinessSignal`** (ou équivalent) avec un flag `source: 'manual' | 'device'` et un **feature-flag global `DEVICE_SIGNALS_ENABLED = false`**, pour brancher Garmin le jour où l'API existe sans réécrire le moteur.
- Toute mention de HRV/readiness dans les docs de couches (socle Couche 1, Couche 2/4) doit être **étiquetée 🌙 dormant** tant que la source n'est pas précisée.

---

## Vue d'ensemble des épopées

| Épopée | Thème | Couche(s) | Priorité | État global |
|---|---|---|---|---|
| **A** | Moteur d'allures & zones | 1 | P0 | 🔴 fondation manquante |
| **B** | Générateur de séances | 1, 4 | P1 | 🔴 (classification ✅, génération 🔴) |
| **C** | Périodisation & charge adaptative | 1, 3 | P1 | 🟡 (charge ✅, orchestration 🔴) |
| **D** | Couche comportementale & pédagogique | 4 | P1 | 🔴 |
| **E** | Sécurité & garde-fous | 1-4 | P0 | 🟡 (transversal) |

**Dépendance structurante** : A est la **fondation** (les allures alimentent B, C, D). À construire en premier.

---

## Épopée A — Moteur d'allures & zones (P0, fondation) 🔴

Le socle absent : sans allures individualisées, B/C/D ne peuvent pas chiffrer leurs prescriptions. **Nouveau module : `src/lib/paceEngine.ts`** (pures fonctions, zéro dépendance React — comme le reste de `src/lib`).

**Entrées (toutes disponibles aujourd'hui)** : course récente (distance + temps), test terrain, profil manuel (`profiles` stocke déjà `vo2max`, `fc_max`, `lactate` + ajouter `fc_repos`), streams Strava (FC/allure/GPS). **Aucune dépendance à des données Garmin** (voir principe « fonctions dormantes »).
**Sorties** : VDOT, VMA/vVO2max, allures E/M/T/I/R (min/km), zones FC (3 référentiels), allure seuil unique, horodatage + confiance.

| ID | Story | Détail | Critères d'acceptation | Dép. |
|---|---|---|---|---|
| **A1** | VDOT depuis une course récente | Formules Daniels-Gilbert : `VO2(v) = -4.60 + 0.182258·v + 0.000104·v²` (v en m/min) ; `%max(t) = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)` (t en min) ; `VDOT = VO2/%max` | 10 km en 50:00 → VDOT ≈ 40 (±0.5) ; distance hors [1500 m, marathon] → confiance dégradée ; temps incohérent rejeté | — |
| **A2** | Allures d'entraînement depuis VDOT | Inverse de A1 par zone : résoudre `v` pour le %VDOT cible → allure. Zones Daniels E/M/T/I/R (% issus de la table Couche 1 : E 59-74, M 75-84, T 83-88, I 95-100, R >100 %VO2max) | VDOT 50 → T-pace ≈ 4:15/km (cohérent tables Daniels) ; 5 plages min/km produites | A1 |
| **A3** | VMA / vVO2max via test terrain guidé | Protocoles : demi-Cooper (6 min → `VMA km/h = d(m)/100`), VAMEVAL (paliers), 30-min CLM. Conversion croisée VMA ↔ VDOT ; **flag si écart > 10 %** | 1500 m en 6 min → VMA 15 km/h ; recalage proposé toutes les 4-6 sem | — |
| **A4** | LTHR + zones FC (3 référentiels) | Friel : LTHR = moy. FC des 20 dernières min d'un CLM 30 min. Karvonen : `FC = (FCmax−FCrepos)·i% + FCrepos`. Exposer %FCmax, %FCréserve, %LTHR (Friel 7 zones) | FCmax 190 / FCrepos 50 → Z2 60-70 %FCR = 134-148 bpm ; chaque zone affiche allure + FC + RPE | A2 |
| **A5** | Allure seuil **unique** + extrapolation Riegel | Trancher : **seuil = T-pace Daniels (≈ allure 1 h) = seuil 2** (une seule constante, info-bulle pédagogique). Riegel `T2 = T1·(D2/D1)^1.06` pour prédire d'autres distances (recoupe `computeRaceProjection` sur plat) | Terme « seuil » non ambigu dans toute l'UI ; 10 km → semi extrapolé cohérent | A2 |
| **A6** | Recalibrage dynamique & fraîcheur | VDOT/VMA/LTHR recalculés à chaque nouvelle course/test ; horodatés ; **flag « à retester » si > 6-8 sem**. Source de vérité unique consommée par B/C/D (= C5) | Nouvelle course → allures propagées au plan ; donnée périmée signalée | A1-A5 |
| **A7** | Modèle de données & persistance | Étendre `profiles` : `vdot`, `vma`, `lthr`, `fc_repos`, `pace_source`, `measured_at`, `confidence`. Migration Supabase **RLS user-own** (cohérent avec l'existant) | Valeurs persistées + isolées par user ; lecture par le moteur | A1-A5 |

**Réutilise** : `trainingLoad.ts` (FCmax déjà manipulé) · `runnerProfile.ts` (VAM par bucket — orthogonal, le pace engine traite le plat de référence) · les champs `profiles.vo2max/fc_max/lactate` déjà saisis dans `ProfilePage`.
**Garde-fou (E4)** : zones et VDOT = **repères individualisables**, pas des lois (variabilité inter-individus forte, surtout sur %VMA).
**Ordre de build interne** : A1 → A2 → (A3 ∥ A4) → A5 → A6 → A7.

---

## Épopée B — Générateur de séances (P1) 🔴

Aujourd'hui les séances sont **classées a posteriori** (`sessionQuality.ts`) mais **pas générées**. Combler le sens inverse.

| ID | Story | Détail | Critères d'acceptation | Dép. |
|---|---|---|---|---|
| **B1** | Catalogue de séances paramétrique | Tempo continu, cruise intervals, 30/30, reps VO2max, race-pace | Chaque type génère une structure chiffrée (allure/FC/RPE par bloc) | A |
| **B2** | Séances de seuil | Continu 20-40 min / cruise (5×1000, 4×6 min) avec plafond ≤10 % km hebdo | Volume seuil plafonné auto ; allures issues de A | A, B1 |
| **B3** | Séances de côte + détection GPS | Paramétrage force/puissance/aérobie (pente, durée, reps) + détection de côtes via dénivelé des traces | Côte adaptée proposée depuis les segments montants de l'athlète ; pilotage RPE/FC (pas allure) | A, B1 |
| **B4** | Strides / hill sprints d'entretien | Insertion auto en fin de footing facile selon distance cible | Strides ajoutés sans compter comme séance dure | B1 |
| **B5** | « Pourquoi cette séance aujourd'hui » | Bloc explicatif 1-2 phrases (rattaché à la raison de séance) | Chaque séance générée porte son intention | B1, D2 |

**Réutilise** : `sessionQuality.ts` (classification → boucle de validation post-séance), `runnerProfile.ts` (statut côte pour B3).

---

## Épopée C — Périodisation & charge adaptative (P1) 🟡

La **charge** existe (`trainingLoad.ts` : PMC, ACWR, TSB) ; manque l'**orchestration** d'un plan course dans le temps.

| ID | Story | Détail | Critères d'acceptation | Dép. |
|---|---|---|---|---|
| **C1** | Moteur de périodisation course | base → spécifique → affûtage selon distance + date d'objectif | Un objectif daté génère un mésocycle pondéré par distance | A, B |
| **C2** | Garde-fou 80/20 | Quota d'intensité hebdo, alerte en cas de dérive (zone grise) | Alerte si > ~20 % du volume en intensité | C1, A3 |
| **C3** | Deload automatique | Insertion semaine de décharge ~toutes les 3-4 sem (-20/40 %) | Deload planifié + reframing « repos = perf » | C1 |
| **C4** | Affûtage auto | J-21→J-0 : volume↓, intensité maintenue | Taper généré (cohérent Couche 1 §6 Bosquet/Mujika) | C1 |
| **C5** | Re-calibrage dynamique | Mise à jour allures (A) après chaque test/course, propagée au plan | Nouveau test → plan recalculé | A, C1 |

**Réutilise** : `trainingLoad.ts` (ACWR/PMC en entrée des alertes), `renfoUtils.ts` (DUP renfo + co-périodisation déjà bâtis → à synchroniser avec C1).

---

## Épopée D — Couche comportementale & pédagogique (P1) 🔴

Le matériel neuf de la recherche couche 4. Aucun code aujourd'hui.

| ID | Story | Détail | Critères d'acceptation | Couche 4 § | Dép. |
|---|---|---|---|---|---|
| **D1** | Onboarding motivationnel | Capter le « pourquoi » (TAD) + implementation intentions (jours/heures/lieux) | Profil motivationnel + créneaux ancrés au plan | §1, §3 | — |
| **D2** | Glossaire contextuel + 3 niveaux de lecture | Termes techniques → définition + analogie + « pourquoi ça te concerne » | Chaque terme tappable, profondeur réglable | §6 | — |
| **D3** | Saisie RPE + ressenti post-séance | RPE 1-10 + plaisir + douleur, **avant** l'analyse machine (sRPE = source de readiness **active**) | Saisie alimente charge (C) / forme (Couche 3) | §2, §6 | A |
| **D4** | Débrief formatif en 3 temps | Objectif → descriptif (data) → 1 conseil ; orienté processus | Un seul focus d'amélioration par séance | §6 | D3 |
| **D5** | Adhérence : streaks tolérantes + « never miss twice » | Régularité hebdo, message bienveillant après séance manquée | Repos non puni ; relance empathique au décrochage | §3 | — |
| **D6** | Préparation mentale de course | Taper mental : visualisation parcours, routine pré-course, carnet de confiance | Synchronisé au taper physique (C4) | §4 | C4 |
| **D7** | Coach audio (self-talk + segmentation) | Cues aux segments durs, découpage des longues | Injections sur la structure de séance (B) | §2 | B |
| **D8** | Vocabulaire piloté par niveau | Même message en version simple/technique + déblocage progressif des métriques | Débutant ne voit pas la charge ; mode expert activable | §6 | D2 |

---

## Épopée E — Sécurité & garde-fous (P0, transversal) 🟡

| ID | Story | Détail | Critères d'acceptation | Couche |
|---|---|---|---|---|
| **E1** | Check-in douleur + drapeaux rouges | Échelle 0-10 par zone + test du lendemain ; alertes graduées non contournables | Drapeau rouge → arrêt + orientation pro, jamais de diagnostic | 2, 4 |
| **E2** | Détection surcharge multi-signaux | Croiser ACWR (✅) + RPE auto-déclaré (✅) + bien-être auto-déclaré (E3) — jamais un signal seul. **HRV/readiness = 🌙 dormant**, exclus du croisement | Surcharge → propose deload (C3), pas avant croisement de signaux **actifs** | 1, 4 |
| **E3** | Check-in bien-être + burnout | Sommeil/humeur/plaisir/stress **auto-déclarés** (saisie manuelle) → signaux psy précoces (passion obsessive). Pas de mesure appareil | Signaux rouges → frein doux + reframing repos | 4 §5 |
| **E4** | Garde-fous heuristiques exposés | Marquer ACWR / 10 % / cadence comme repères, pas lois (cohérent garde-fou Couche 1) | UI affiche l'incertitude | 1-4 |

---

## Séquencement proposé (ordre de dépendances)

1. **Sprint fondation** — Épopée **A** (allures) + **E1/E4** (sécurité socle). *Débloque tout le reste.*
2. **Sprint génération** — **B1-B3** (catalogue, seuil, côte) + **D3** (RPE post-séance).
3. **Sprint orchestration** — **C1-C3** (périodisation, 80/20, deload) + **E2** (surcharge multi-signaux).
4. **Sprint humain** — **D1, D2, D4, D5** (motivation, pédagogie, adhérence) + **D8**.
5. **Sprint course** — **C4** (affûtage), **D6** (prépa mentale), **B5/D7** (intention + coach audio), **E3**.

**Quick wins indépendants** (mobilisables tôt, peu de dépendances) : **D1**, **D2**, **D5**, **E4**.

---

## Ce qui est déjà bâti (vérifié — à ne pas refaire, à brancher)

Maturité confirmée par audit fonctionnel `src/lib` (2026-05-30) :

| Module | Statut | Couvre (vérifié) | Manque clé / à faire | Cible |
|---|---|---|---|---|
| `trainingLoad.ts` | ✅ | TRIMP (durée×intensité×D+), ATL τ=7j / CTL τ=42j (Bannister), TSB + 5 zones, ACWR lissé (Gabbett), PMC 90j | HRV/readiness = 🌙 dormant (pas d'API Garmin) ; brancher RPE auto-déclaré (D3) comme **entrée** de C2/E2 | C, E |
| `runnerProfile.ts` / `buildRunnerProfile.ts` | 🟡 | VAM/vitesse par bucket de pente, dérive cardiaque, recovery post-côte/descente, pénalités conditions (régression) | Fatigue descente = *scaffold* (`accumulatedDminusImpact` non calculé) ; **injury adapt absent** ; VO2max absent | B, 2 |
| `computeRaceProjection.ts` | ✅ | Pace par bucket, pénalités drift/recovery, ajustement fraîcheur (ATL/CTL), range + score de confiance, comparaison objectif | Pas de critical speed ; **météo jour J non reliée** ; pas de re-planification dynamique | C, D |
| `sessionQuality.ts` | ✅ | Classification post-hoc (9 types), dérive cardiaque, insights | **Ne génère pas** de séance (≠ Épopée B) ; pas de saisie RPE/débrief | B, D |
| `renfoUtils.ts` | 🟡 | DUP 4 phases (force/volume/puissance/deload), co-périodisation (réactive), e1RM, suggestion de charge | **Périodisation autonome non synchronisée** (voir risque ci-dessous) | C |
| `crewPlan.ts` | ✅ | Extraction waypoints GPX, checkpoints crew, vigilance côtes, estimations temps | Pas de stratégie eau/sucre par phase | D |
| `nutritionPlan.ts` | 🟡 | Cibles glucides par profil/durée, timing repas, sources citées | Hydratation/sudation, tolérance GI, ajustement météo jour J | D |
| `streams.ts` / `weather.ts` | ✅ | Cache streams Strava ; météo Open-Meteo + temp Strava | `weather.ts` **non relié à `computeRaceProjection`** (météo jour J) | C, 3 |

> **Risque d'intégration n°1 (prouvé)** : `renfoUtils.ts` porte déjà une périodisation DUP qui tourne **en autonomie** sur un cycle de 4 semaines calé sur l'horloge (`Math.floor(Date.now() / (7×86400000)) % 4`), **sans aucun lien** avec l'ACWR/PMC de `trainingLoad.ts`. Une phase « force » peut donc tomber en pleine surcharge ou en fenêtre de récupération. L'Épopée **C1** ne doit **pas** créer une seconde logique concurrente : le moteur de périodisation course doit devenir la **source de vérité unique** du calendrier de phases/deload, que `renfoUtils` consomme.

> **Branchement rapide repéré** : `weather.ts` existe et est déjà utilisé par `buildRunnerProfile` (pénalités historiques) mais **pas** par `computeRaceProjection` → ajouter l'ajustement météo **jour J** est un quick win à faible coût (rattaché Couche 3 « ajustements environnementaux »).

---

## Notes de portée

- Backlog **produit**, pas planning d'ingénierie : pas d'estimation en jours ni d'assignation.
- Statuts code « ✅/🟡/🔴 » **vérifiés** par audit fonctionnel de `src/lib` (2026-05-30) ; les statuts d'épopées sont confirmés sans surprise.
- Toute la couche 4 (D + E3) doit respecter le garde-fou : **accompagnement comportemental, jamais clinique** — orientation pro en cas de détresse réelle.
