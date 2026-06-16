# Renfo best-in-class — synthèse & plan d'action

> Consolidation des 5 volets de recherche (`01`→`05`). Objectif : faire du module
> renfo de Vorcelab le meilleur du marché (course **et** trail). Sources citées dans
> chaque volet. Ce document = **où on en est** + **quoi changer**, priorisé.

---

## 1. TL;DR

- La **science est claire** : le renfo achète de l'**économie de course** (SMD ≈ −1.42 chez l'entraîné) et de la **durabilité** (économie en fin d'effort), pas du VO₂max. Il **réduit les blessures** (RR ≈ 0.32). → c'est un levier neuromusculaire/durabilité, à assumer comme tel.
- **Sur le marché**, le renfo est le module le plus faible et le moins personnalisé de presque toutes les apps. **Campus Coach/Kiprun** est le leader (intégré au plan, phase-aware, 240+ vidéos trail) ; **Runna** a la meilleure autorégulation ; **Garmin** la seule vraie périodisation strength.
- **Notre position** : notre **co-périodisation renfo↔course** (`renfoFusion.ts`) est **déjà plus sophistiquée que Runna** — c'est notre différenciateur. Mais on a des trous nets : progression limitée à la charge externe, pas de substitution d'exercice, pas de démos, pas d'autorégulation du volume selon la fatigue, et **une erreur de périodisation** (`build→volume`).

---

## 2. Ce qu'on protège (déjà bon)

- **Fusion renfo dans la semaine course** : phase course → DUP, « jours durs durs », ≤1 lourd/sem, jamais la veille d'une séance clé, jour de course exclu, léger-only en récup post-course. **Au-dessus de Runna/Campus sur l'intégration.**
- **Suggestion de charge e1RM/RPE** (`computeNextLoad`) avec arrondi 1.25 kg.
- **Profils matériel maison/salle**, bibliothèque par focus, lecteur de séance avec minuteurs.
- **Co-périodisation par fatigue récente** (`computeCoPerioWarnings`) : éviter lourd/plio après sortie longue/course.

---

## 3. Corrections SCIENCE / ALGO (priorité haute — fiabilité du moteur)

Cibles : `src/lib/coach/renfoFusion.ts`, `src/lib/renfoUtils.ts`, `src/lib/coach/planGenerator.ts`.

| # | Problème actuel | Correction (sourcée) | Volet |
|---|---|---|---|
| A1 | `runningPhaseToDUP` : **base→force, build→volume, specific→puissance**. Le « volume/hypertrophie » en build ajoute de la fatigue quand l'intensité course monte, et les coureurs ne veulent pas de masse. | Réordonner : **volume anatomique en BASE → force max en BUILD → puissance/plyo en SPÉCIFIQUE → maintien/deload en taper**. La force max (économie) doit tomber au pic de spécificité, pas le volume. | 03, 01 |
| A2 | Placement intra-jour non géré (on gère seulement « veille d'une séance clé »). | Encoder la règle **≥6 h** entre renfo et séance clé le même jour (plancher 3 h), et l'**ordre** (priorité du jour en premier). C'est **le levier anti-interférence le plus fort**. | 03 |
| A3 | On évite la **veille** d'une séance clé, mais pas l'**après**. | Ajouter une **ombre DOMS de ~48 h** après renfo lourd jambes (pas de séance clé course dans les 48 h qui suivent non plus). | 03, 02 |
| A4 | Un seul mode « deload » en taper, identique partout. | **Taper gradué par distance + terrain** : stop lourd **10-14 j** (route) / **14-21 j** (trail/ultra), garder un primer **neural** bas volume ~3-4 j avant. | 03, 01 |
| A5 | Récup post-course = léger, durée non graduée par l'épreuve. | **Graduer** : 5-10k ≈ 3-5 j → marathon ≈ 7-10 j → **ultra 14-21 j** (la force jambes chute ~41 % après 156 km). | 03, 02 |
| A6 | Pas de gating « readiness » : un jour « légal » place toujours le renfo. | **Gating ACWR/TSB/DOMS** : ACWR ≥ 1.5 → skip ; 1.3-1.5 → couper le volume, garder l'intention ; substituer mobilité. (`computeImpactZone` + PMC déjà dispo.) | 03 |
| A7 | Rotation des focus pauvre (force_lourde / tronc / mobilité / yoga). | **Défaut = combiné lourd + plyo** (meilleur sur perf, ES ≈ −1.04) ; **méthode selon l'allure cible** (lourd > 12 km/h, plyo ≤ 12 km/h) ; ajouter **soleus genou fléchi** (sous-entraîné, ~6-8× PdC en course) ; **proprioception cheville quotidienne** (−35 % entorses). | 01, 02 |
| A8 | Pas de spécificité descente/trail dans le renfo placé. | **Dosage trail/vert** : injecter excentrique quad/mollet + cheville en amont des courses à gros D−. **Repeated-bout** : 1 séance descente ~7 j avant la course (blunt les dégâts). **Primer isométrique** (10 holds longueur longue, 48 h avant descente). | 02 |

> Note evidence : interférence négligeable chez débutants, réelle chez entraînés ; pas de périodisation par cycle menstruel (non soutenu) — utiliser l'autorégulation RIR à la place.

---

## 4. Upgrades MOTEUR renfo (progression & autorégulation)

Cibles : `src/lib/renfoUtils.ts` (`computeNextLoad`), `src/lib/renfoData.ts`, `src/pages/RenfoSessionPage.tsx`.

1. **Feedback 3 boutons « trop facile / ok / trop dur »** pour les focus **non chargés** (poids de corps, bandes, yoga, pilates, mobilité) — aujourd'hui ils n'ont **aucun signal de progression**. (Freeletics) — *quick win à fort impact.*
2. **Primitives de progression nommées** : linéaire / double-progression / progression de reps / temps-sous-tension / %1RM, e1RM Epley + table RPE en repli. (Liftosaur/Juggernaut) — remplace l'ad-hoc.
3. **Autorégulation du volume selon la fatigue course** : un flag readiness (depuis `computeImpactZone` + sortie longue récente) **retire la dernière série lourde et plafonne le RPE à 7**. *C'est LE différenciateur coureur* (RP Strength). 
4. **Substitution d'exercice** par recouvrement de muscles ciblés au lieu de **dro_pper en silence** quand le matériel manque (`getBestVariant` → null).
5. **« vs dernière séance »** (charge × reps × RPE) + **calcul des disques** au logging. (Strong/Setgraph)
6. **Démos** (vidéo/gif) + remonter les cues position/mouvement/erreurs déjà présents dans le lecteur (dette « DÉMO À VENIR »).
7. **Re-test AMRAP périodique** pour recalibrer l'e1RM. (Fitbod/Liftosaur)
8. **Budget temps de séance** (15/25/40 min) qui scale déterministe le nombre d'exos/séries. (Runna)

---

## 5. Upgrades PRODUIT / différenciation marché

1. **Mémoire de surcharge progressive** visible (« la dernière fois X kg × Y reps → aujourd'hui +Z ») — **le primitif #1 manquant sur tout le marché** (Garmin, Runna, Coopah, Nike ne le font pas).
2. **Dosage trail/vert piloté par le D+/descente réel du plan** — personne ne le fait ; on a déjà le D+ par séance (#370) → on peut brancher.
3. **Taper gradué** (vs binaire on/off de Campus Coach).
4. **Séances guidées au téléphone** (cues + minuteurs) ; option **auto-sync Strava** pour la distribution.
5. **Track prehab selon l'historique de blessures** (déterministe, par site).
6. **Graphe de substitution matériel** (barre ↔ haltère ↔ bande ↔ PdC, même stimulus).

---

## 6. Roadmap proposée (séquencée)

**Quick wins (faible risque, fort ROI) :**
- A1 (réordonner DUP base/build/specific) — *correctif de fond, petit diff.*
- §4.1 feedback 3 boutons pour focus non chargés.
- A7 partiel : ajouter soleus + proprioception + Pilates à la rotation légère.
- §5.1 « vs dernière séance » / mémoire de surcharge.

**Cœur moteur :**
- §4.2 primitives de progression, §4.4 substitution d'exercice, A2 règle ≥6 h, A6 gating readiness.

**Différenciateur coureur :**
- §4.3 autorégulation du volume selon fatigue course, A8 dosage trail/vert + repeated-bout, A4/A5 taper & récup gradués.

**UX / contenu :**
- §4.6 démos, §4.8 budget temps, §5.4 séances guidées.

---

## 7. Garde-fous

- Rester **déterministe** (aucune IA) et **simple** — les coureurs ne sont pas des bodybuilders : petit set d'exercices stable qu'on **progresse** (Caliber/Runna), pas de churn façon Fitbod.
- Chaque règle ci-dessus est **codable en table/if-then** ; aucune ne nécessite de ML.
- Evidence faible flaggée : RCT taper/maintien petits (n≈8) ; protection repeated-bout > 3 sem non prouvée ; échantillons surtout masculins entraînés.
