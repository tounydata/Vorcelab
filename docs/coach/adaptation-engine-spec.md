# Moteur d'adaptation Vorcelab — spécification (route & trail)

> Synthèse de 4 revues de littérature (autorégulation de séance · récupération/décharges ·
> trail/ultra · route). 100 % déterministe, aucune IA. Chaque règle est chiffrée et sourcée.
> **Statut : spec de référence** pour faire évoluer le Coach (remplace les magnitudes « à la louche »).

## 0. Principes directeurs
1. **Déterministe & traçable** : mêmes entrées → mêmes sorties ; on journalise quel levier a agi.
2. **Multi-signal, anti-surréaction** : jamais d'action sur **une seule** mesure/séance ; tendances (moyennes 7 j) + **hystérésis 48-72 h**.
3. **Réponse graduée** : jour easy en plus → allègement d'1 séance → décharge anticipée.
4. **Sécurité d'abord** : douleur localisée / fièvre / symptômes « sous le cou » priment sur tout.
5. **Le moins d'intervention utile** (Daniels) : on change **une variable à la fois**.
6. **Décharges planifiées non négociables** : le monitoring les avance/prolonge, ne les supprime pas.

---

## 1. Modèle de charge (socle)
- **Monnaie sans capteur (toujours dispo)** : **sRPE-load = RPE(0-10) × durée_min** (Foster) + **questionnaire bien-être 1-5** (sommeil, courbatures, fatigue, stress, motivation).
- **ACWR** = charge aiguë (EWMA τ=7 j) / chronique (EWMA τ=28 j). Zone **0,80-1,30** ; **> 1,5** = risque ; **< 0,80** = sous-charge. *Contesté (artefact mathématique) → signal MOU multi-critères, jamais seul.*
- **PMC/TSB** = CTL(τ42) − ATL(τ7). Productif **−10 à −30** ; surcharge **< −30** ; affûté **+5 à +25**.
- **Monotonie** = moyenne/écart-type de la charge quotidienne ; **> 2,0** = risque.
- **Garde-fou de pic (le mieux étayé récemment)** : la **sortie longue suivante ≤ +10 %** de la plus longue des 30 derniers jours (un pic > 10 % → +52-100 % de risque de blessure).

*(Vorcelab a déjà : `computeDailyPMC`, `computeACWR`, `getTsbZone`, `detectOverload` — à étendre avec sRPE-load, monotonie, spike-guard, bien-être.)*

---

## 2. Adaptation de séance (autorégulation RPE) — **révise la v3**
Verdict de la dernière séance qualité → ajustement de la **prochaine**. **Ordre des leviers (le moins coûteux d'abord)** :

### Séance fractionnée (VO2max, seuil/cruise)
1. **Allonger la récup** : +30-60 s/rép (ratio p.ex. 1:0.7 → 1:1).
2. **Couper le volume** : **−20-30 % des reps** (6×400 → 4-5 ; borne plancher ≈ 3).
3. **Adoucir l'allure** : **VO2max +3-6 s/km**, **seuil +5-10 s/km** (reste dans la zone : bande VDOT I ≈ 3-5 s/km, T ≈ 5-8).
> **R-pace (vitesse pure)** : ne JAMAIS rogner la récup (chaque rép doit rester nette).

### Séance continue (tempo)
1. **Adoucir l'allure** +5-10 s/km.
2. **Couper la durée** −20-33 % en gardant **≥ 20 min** (sinon perte du stimulus seuil), ou « split threshold » (micro-pauses 60-90 s).

### Progression (trop facile) — **une seule variable**
- Fractionné : **+1-2 reps** *ou* récup −1 cran *ou* **allure −3-5 s/km**.
- Continu : **durée +5-10 min** *ou* allure −3-5 s/km.
- **Plafonds Daniels** (bornent toute hausse) : **VO2max(I) ≤ 8 %** du km hebdo/séance, reps ≤ 5 min, ~1:1 ; **vitesse(R) ≤ 5 %**, bouts ≤ 2 min ; **seuil(T) ≤ 10 %** du km hebdo.

### Seuils de déclenchement
| Signal | ALLÉGER | OK | PROGRESSER |
|---|---|---|---|
| RPE vs cible (T≈6-7 / I≈9-10) | ≥ cible +2 | ±1 | ≤ cible −2 |
| %FCmax — séance seuil | > 92 % | 88-92 % | < 88 % à l'allure cible |
| %FCmax — séance VO2max | (95-100 % attendu) | 98-100 % | < 95 % sur les dernières reps |
| **Dérive cardiaque** (continu seulement) | > 10 % | 5-10 % | < 5 % allure tenue |

> La dérive ne sert **que** pour le continu/sous-seuil ; sur reps VO2 courtes, juger sur la **tenue d'allure + RPE**.

### Modifier vs Abandonner vs Sauter (garde-fous)
- Fatigue/RPE haut, **pas de douleur**, symptômes « au-dessus du cou » → **MODIFIER** (≈ −50 % effort).
- Séance intenable sans douleur → **ABANDONNER la qualité → finir en footing facile**.
- Symptômes « sous le cou » / fièvre ≥ 38 °C / **douleur localisée ou boiterie** → **SAUTER / STOP**.

---

## 3. Récupération & décharges
- **Cadence** : **3:1** par défaut ; **2:1** débutant / > 50 ans / gros volume ultra ; jusqu'à 4:1 en base facile.
- **Ampleur** : **−30 %** de volume standard ; **−40-50 %** débutant/fatigue ; −15-25 % « down week » de base.
- **Intensité** : on **garde 1 séance qualité à reps réduites**, on supprime la 2e ; sortie longue −30-40 %. (Réduire le volume, pas l'intensité — comme un mini-taper.)
- **Espacement** : **≥ 48 h entre séances dures** (≥ 72 h masters) ; **80/20** easy/hard ; qualité/sem = {débutant 1, intermédiaire 2, avancé 2-3}. VO2max jamais en back-to-back ; longue = jour dur (pas de VO2 le lendemain).
- **Escalade monitorée (≥ 2 flags concordants)** :
  - **+1 jour easy** : 2 flags parmi {ACWR>1,5 ; TSB<−20↓ ; bien-être <80 % base ; RPE veille ≥ planifié +2 ; (HRV/FC repos si dispo)}.
  - **Downgrade séance** : TSB<−30, ou ACWR>1,5 + flag bien-être, ou monotonie>2,0 sous forte charge.
  - **Décharge anticipée** : TSB<−30 ≥ 4-5 j, ou ACWR>1,5 ≥ 1 sem + bien-être en baisse, ou ≥ 3 flags chroniques > 5 j.
  - **Sous-entraînement** : ACWR<0,8 ou TSB>+25 durable (hors taper) → reprendre la progression.

---

## 4. Spécifique ROUTE (5k/10k/semi/marathon)
- **Sortie longue** : **≤ 25-30 %** du volume hebdo ; cap **marathon ≤ 22 mi / 2,5-3 h**, semi ≤ 16 mi, 10k ≤ 12-14 mi, 5k ≤ 10 mi/90 min ; **MP long run à 80-90 % allure marathon**.
- **Distribution d'intensité** : 70-80 % E / 10-15 % M+T / 10-15 % I+R (≈ polarisé 80/20 ; le « tout seuil » est sous-optimal en RCT).
- **Progression volume** : **abandonner le « +10 %/sem » fixe** (non protecteur en RCT) → piloter par **ACWR 0,8-1,3 + spike-guard** ; step-back 3:1.
- **Strides** : 4-8 × 20-30 s, récup complète, 2-3×/sem, **toute l'année** (≤ ~30 s sinon ça devient anaérobie).
- **Périodisation & taper par distance** :

| | 5k/10k | Semi | Marathon |
|---|---|---|---|
| Modèle | classique (VO2max/vitesse vers la course) | hybride | inverse (volume aéro → spécifique MP) |
| Taper | 7-10 j, −40-50 % | 10-14 j, −40-55 % | **2-3 sem**, −40-60 % étagé |
| Intensité en taper | **maintenue** (touches d'allure course) | maintenue | maintenue (couper le volume, pas l'intensité) |

- **Individualisation** : niveau (plafond volume, % intensité), âge (récup + taper plus longs), **chaleur** (+0,4 %/°F > 60 °F, +0,2 %/1 % HR ; −25-50 % si acclimaté), **historique de blessure** (resserre spike/progression), **RED-S/LEAF-Q** (dépistage énergie). **Cycle menstruel : PAS de périodisation par phase codée en dur** (preuves faibles) — ajustement optionnel basé symptômes.

---

## 5. Spécifique TRAIL / ULTRA (dimensions absentes du modèle route)
- **D+ : densité de dénivelé** (m/km) calée sur la course ; vert hebdo **30-50 % → 90-100 %+** du vert du jour de course (cap +10 %/sem).
- **Courir/marcher** : courir ≤ 10-15 %, **power-hike 15-25 %**, marcher > 25-28 % (curseur ↓ avec fatigue/longueur).
- **Charge excentrique (descente)** : DOMS pic ~48 h ; **repeated-bout effect 2-10 sem** → séances de descente **1-2×/mois** ; pénalité de récup après grosse descente ; la descente **n'est pas** de la récup.
- **GAP / coût Minetti** (multiplicateurs ×plat) : +5 %=1,30 ; +10 %=1,66 ; +15 %=2,06 ; −5 %=0,76 ; −10 %=0,60 (mini ~ −10,6 %). **Distance-équivalent-plat = Σ(distance × facteur pente)** → un 10 km/600 D+ ≫ 10 km plat. Garde-fous : GAP-course invalide > 25 % et < −8 % ; +3-7 % sur longues descentes (dommage non capté).
- **Sortie longue en TEMPS** (cap ~4-5 h) ; **back-to-back** pour 50K+ (ex. 30-35 mi/2 j : jour vitesse + jour côtes).
- **Intensité = RPE d'abord, FC ensuite, allure dé-priorisée** ; **VAM (m/h)** comme allure de montée > ~20 % (amateur 400-700, élite > 1000).
- **Intestin** (30-40 → 60-90 g glucides/h, glu:fru 1:0.8, répété en sortie longue) ; **acclimatation chaleur** (bloc 8-14 j, 60-90 min/j, dans les ~2 dernières sem).

---

## 6. Dimensions transverses à modéliser (check-list)
Spike-guard sortie longue · ACWR/charge chronique · budget de distribution d'intensité (caps hebdo) · cap sortie longue en temps · décharges 3:1 · taper par distance · périodisation classique/inverse selon l'épreuve · strides · ajustement chaleur/altitude + acclimatation · signaux récup/readiness (HRV/sommeil/RPE/courbatures) · **RED-S/énergie** · contraintes liées à l'historique de blessure · espacement des jours durs · re-planification après séances manquées · surface · semaines cumulées.

---

## 7. Cartographie vs code actuel + feuille de route
**Déjà en place** : `planGenerator` (périodisation, taper progressif, pic à J-21), `trainingLoad` (ACWR/PMC/TSB), `sessionVerdict` (verdict allure/FC/dérive/RPE), `sessionModulation` v3 (#249, à réviser), `safetyGuards` (douleur/surcharge), `adaptCatalog` (sélection séances).

**P0 — réviser la v3 (#249) selon §2** : ordre des leviers (récup→reps→allure), magnitudes chiffrées, une seule variable, plafonds Daniels, garde-fous sécurité/maladie. *(faible risque, gros gain crédibilité.)*

**P1 — charge & sécurité** : sRPE-load + questionnaire bien-être ; **spike-guard sortie longue** ; budget de distribution d'intensité (caps E/M/T/I/R) ; affiner le statut « surmenage » (déjà partiellement fait) ; décharges 3:1 explicites + déclenchement anticipé multi-signal.

**P2 — trail** : charge **distance-équivalent-plat (GAP/Minetti)** ; densité de D+ & progression du vert ; pénalité excentrique/RBE descente ; sortie longue en temps + back-to-back ; VAM ; seuils courir/marcher.

**P3 — individualisation** : chaleur/dew-point, historique blessure, RED-S/LEAF-Q, âge/niveau ; HRV/FC-repos optionnels.

---

## 8. Sources (principales)
**Séance/autorégulation** : Daniels (coachray.nz, runningwithrock), VDOT bands (runregimen), dérive (TrainingPeaks, runbikecalc), Pfitzinger (themorningshakeout), Seiler (scientifictriathlon), Magness, neck-rule (USAT, Cleveland Clinic).
**Récup/décharge** : Gabbett/ACWR review (PMC7047972) + critiques (PMC8138569, arXiv), TSB (TrainingPeaks, Friel), sRPE/monotonie (PMC5673663), Seiler 80/20 (fasttalklabs), décharges (builttoendure, PMC10809978), Uphill Athlete 3:1, HRV (Kubios).
**Trail** : Koop (trainright, livre), Uphill Athlete, Roche/SWAP, GAP/Minetti 2002 (runningwritings), excentrique/RBE (runningscience), gut (runnersconnect), chaleur (Frontiers, PubMed 24444197), VAM (Strava/TrainingPeaks).
**Route** : Daniels (coachray), Pfitzinger (runningwithrock), Canova (runningwritings, nateruns), 10 %-rule/spike (marathonhandbook, Outside, JOSPT), taper (Frontiers fspor.2021.735220, marathonhandbook), polarisé RCT (PMC3912323), strides (runnersconnect), chaleur (runnersconnect dew-point), RED-S (NSCA), cycle menstruel (Frontiers fspor.2023.1054542).
