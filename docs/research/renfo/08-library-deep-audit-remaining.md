# Audit profond — 6 catégories restantes (force_lourde, excentrique, tronc, pilates_coureur, haut_corps, stretching/mobilité)

> Recherche S&C citée confrontée à `src/lib/renfoData.ts`. Complète `06`/`07`
> (plyo, équilibre, moyen fessier déjà audités — non répétés ici).
> **Verdict global : socle solide et best-practice. Vrais trous = (1) zone de force lourde
> trop "hypertrophie" (RPE 8 / 5-10 reps) au lieu de force max (≥85% 1RM, 3-5 reps RPE ≥8.5) ;
> (2) pas de hinge bilatéral lourd type trap-bar/deadlift ; (3) excentrique tempo sous-spécifié ;
> (4) haut_corps mince (pas de press vertical) ; (5) stretching = aucun étirement dynamique pré-course.**

Statut : RÉDIGÉ.

## Top 5 actions (si on ne change que 5 choses)
1. **force_lourde : créer une vraie zone de FORCE MAX** sur les mouvements bilatéraux. Les RPE 8 / 5-10 reps actuels visent l'hypertrophie ; la science RE = **≥85-90% 1RM, 2-5 reps, RPE 8.5-9.5**. Garder une variante "force" (squat 4×4 @RPE9 / RDL 4×4 @RPE8.5) à côté de la variante 5×5. ([Springer/PMC11052887](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/))
2. **Ajouter un hinge bilatéral lourd type trap-bar deadlift** : meilleur prédicteur force/puissance bas du corps chez coureurs, +8-15% de charge vs deadlift droit, dos plus protégé. **Trou réel** : on n'a aucun deadlift complet (seulement RDL/hip hinge partiel). ([PMC11140948](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11140948/))
3. **haut_corps : ajouter un press vertical (overhead/landmine press)** — le portage de sac, l'usage des bâtons et le maintien postural en fin de course l'exigent ; actuellement **0 mouvement de poussée verticale**. ([Canadian Running](https://runningmagazine.ca/trail-running/3-upper-body-strength-moves-trail-runners-need/))
4. **stretching : aucun étirement DYNAMIQUE pré-course** dans la lib. Le statique >60s avant l'effort dégrade force/puissance/économie (−4 à −7.5%) ; il faut une **routine dynamique** (leg swings, fentes marchées, A-skips) distincte du bloc statique post-run. ([NSCA](https://www.nsca.com/education/articles/kinetic-select/static-stretching-and-performance/), [PMC8391672](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8391672/))
5. **excentrique : préciser le tempo dans la dose, pas juste dans le texte.** Alfredson = **3×15, descente 3s, 2×/jour** (genou tendu + fléchi) ; nos variantes mélangent les deux jambes et n'imposent pas le tempo de façon systématique.

---

## 1) force_lourde (8 exercices)

| Have | Manque must-have (cité) | Fix de dose | Verdict |
|---|---|---|---|
| squat, RDL, bulgare, hip_thrust, lunge_marcheur, step_up, lateral_lunge, mollets_lourds | **Hinge bilatéral lourd (trap-bar / deadlift complet)** — meilleur prédicteur force bas-corps, dos protégé ([PMC11140948](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11140948/)) ; **soléaire lourd dédié genou fléchi** (présent seulement en excentrique léger) ([Recover/Runna](https://recoverathletics.com/soleus-strengthening-exercises-for-runners/)) | **Tout est en RPE 8 / 5-10 reps = zone hypertrophie, pas force max.** RE meilleure avec **≥85-90% 1RM, 2-5 reps, RPE 8.5-9.5** ([PMC11052887](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/)). `squat_barbell 5×5 RPE8` → ajouter palier **4×3-4 RPE9** ; `mollets_smith 4×10 RPE8` trop léger pour mollet lourd → **4×6-8 RPE9** ; goblet `4×8` ok en accessoire | ⚠️ Sélection complète (squat + hinge + glute + unilatéral + frontal + mollet) mais **intensité sous-dosée pour l'économie de course** — il manque le palier "force max" et un deadlift complet |

**Détails :**
- **Zone de charge :** la méta-analyse RE (Llanos-Lagos 2024, [PMC11052887](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/)) montre que le **high-load (~≥80-90% 1RM, faibles reps)** améliore l'économie avec certitude modérée ; nos prescriptions RPE8 / 8-10 reps tombent dans la zone hypertrophie. → garder un **bloc force max** (2-5 reps) sur squat, deadlift/trap-bar, hip thrust.
- **Trap-bar :** +8.4% (poignées basses) à +14.9% (poignées hautes) de 1RM vs deadlift conventionnel, pic de puissance supérieur ([PMC11140948](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11140948/), [Contreras](https://bretcontreras.com/you-got-gurud-max-relative-trap-bar-deadlift-strength-perfectly-predicts-speed-power-and-endurance-performance/)). Notre RDL ≠ deadlift complet (chaîne post. partielle, peu de quad). **Ajouter trap-bar/deadlift** comble le hinge bilatéral lourd.
- **Soléaire lourd :** le soléaire produit ~6-8× le poids du corps en course ; il se charge **genou fléchi ~20-90°** ([scienceinsights](https://scienceinsights.org/how-to-strengthen-the-soleus-muscle-best-exercises/)). On a `mollets_lourds` (gastro, genou tendu) + `mollet_excentrique` option soléaire (léger). **Manque un soléaire LOURD dédié** (seated/bent-knee calf raise lesté, 3×8-10 lourd).
- **Cues OK** ; ajouter sur squat : "rester ≥85% 1RM sur le bloc force, ne pas grinder au-delà de RPE9 hors test".

## 2) excentrique (9 exercices)

| Have | Manque must-have (cité) | Fix de dose | Verdict |
|---|---|---|---|
| mollet_excentrique (Alfredson), nordic, reverse_nordic, single_leg_rdl, single_leg_squat, step_down, tibialis_raise, wall_sit, single_leg_glute_bridge | RAS de mouvement (couverture excellente : Achille/quad/ischio/tibial/genou/descente) | Préciser **tempo** dans la dose ; corriger 2 mislabels | ✅ **Très solide, fort trail/descente** ; corriger tempo + 2 catégorisations |

**Détails :**
- **Alfredson (`mollet_excentrique`) :** protocole de référence = **3×15, descente excentrique 3s, 2×/jour, genou tendu ET genou fléchi**, progression en charge ([Physiopedia](https://www.physio-pedia.com/Achilles_Tendinopathy_Toolkit:_Appendix_A), [group23 PDF](https://www.group23.ca/wp-content/uploads/2024/11/Achilles-Tendinopathy-Exercises.pdf)). Nos variantes ont les 2 angles en options mais **mélangent les deux jambes en descente** (`bilatéral 5s`) → en rééduc tendineuse le standard est **unilatéral, montée bilatérale / descente unilatérale**. Dose 3×15 ✅. Préciser "3s descente" partout, pas seulement dans le texte.
- **Nordic :** dose `3×5 RPE9` ✅ aligne sur low-volume efficace (le low-volume suffit pour la force excentrique, meilleure compliance ; high-volume seulement pour l'architecture/fascicule) ([PMC6942028](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6942028/), [PMC12572617](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12572617/)). Réduit les blessures ischio ~51% ([méta soccer](https://www.researchgate.net/publication/309217733_Effect_of_Injury_Prevention_Programs_that_Include_the_Nordic_Hamstring_Exercise_on_Hamstring_Injury_Rates_in_Soccer_Players_A_Systematic_Review_and_Meta-Analysis)). **2×/sem > 1×/sem**. RAS.
- **reverse_nordic / step_down / single_leg_squat :** tempo 3-4s descente bien décrit ✅. Dose OK.
- **wall_sit MISLABEL :** c'est un **isométrique**, pas un excentrique (déjà noté en `06`). Effet réel (Danish/quad iso, antalgie tendineuse) mais à reclasser → catégorie isométrique/quad, ou renommer le bénéfice. Le `reps:1` + `unit` durée est une bidouille de structure.
- **single_leg_glute_bridge MISLABEL :** dominante fessière/concentrique → relève de force_lourde/fessier, pas excentrique.

## 3) tronc / core (7 exercices)

| Have | Manque must-have (cité) | Fix de dose | Verdict |
|---|---|---|---|
| pallof_press (anti-rot), side_plank_hipdrop (anti-flex lat dyn), dead_bug (anti-ext), bird_dog (anti-ext/rot), suitcase_carry (anti-flex lat), copenhagen_plank (adducteur), core_rotation (rotation/anti-rot) | **Anti-extension statique pur (front plank / RKC / ab-wheel)** absent — on a dead_bug/bird_dog mais pas de gainage frontal de référence ([stack](https://www.stack.com/a/why-anti-movements-are-an-athletes-key-to-functional-core-strength/), [SAPT](http://www.saptstrength.com/blog/2015/8/13/anti-lateral-flexion-core-exercises)) | Bird_dog `RPE6` un peu bas ; suitcase carry `20 reps` = ambigu (c'est une distance/temps, pas des reps) | ✅ **Couverture anti-mouvement quasi-textbook** (les 3 axes + adducteurs + portés) ; **seul vrai trou = anti-extension statique de référence** |

**Détails :**
- Les 3 axes canoniques sont **couverts** : anti-rotation (pallof, core_rotation), anti-flexion latérale (suitcase, side_plank), anti-extension (dead_bug, bird_dog) ([stack](https://www.stack.com/a/why-anti-movements-are-an-athletes-key-to-functional-core-strength/), [setforset](https://www.setforset.com/blogs/news/core-stability-training-anti-rotational-vs-rotational-core-exercises)). Pour un coureur c'est l'essentiel.
- **Manque** un **anti-extension statique chargeable** (front plank progressif → RKC plank → ab-wheel / body-saw). Dead_bug et bird_dog sont dynamiques/légers ; un gainage frontal "stiffness" McGill complète le pilier ([Seattle SP](https://www.seattlesp.com/why-why-focus-on-anti-core-training/)).
- **copenhagen_plank** : adducteur, pas anti-mouvement tronc (déjà noté `07`) — utile (pubalgie), mais ne compte pas comme couverture core. Dose progression 2×6→3×15 sur 8 sem.
- `suitcase_carry` "20 reps" → exprimer en **distance (20 m) ou temps (30-40s)/côté**.

## 4) pilates_coureur (9 exercices)

| Have | Manque must-have (cité) | Fix de dose | Verdict |
|---|---|---|---|
| hundred, roll_up, single_leg_stretch, side_kick, swimming, teaser_prep, clam, dead_bug, bridge_series | Pas de trou majeur ; optionnels : **single-leg lowering / leg-lower (anti-ext + contrôle psoas)**, **saw/spine-twist (rotation thoracique segmentée)** | Hundred `3×100` = volume cou-fléchisseurs élevé pour débutant → option régressée (jambes table-top) déjà là ✅ ; swimming `3×50` ok | ✅ **Excellente sélection mat-Pilates pour coureurs** (core profond + chaîne post + stabilité latérale) |

**Détails :**
- Sélection conforme aux recommandations Pilates-coureur (transverse, hip stability, glute activation, chaîne postérieure) ; bénéfices documentés : **+économie de course et endurance du tronc à 8 sem** ([Outside/run](https://run.outsideonline.com/training/cross-training/how-pilates-can-aid-your-running-performance/), [NordicTrack](https://www.nordictrack.com/blog/pilates-for-runners-the-core-strength-advantage)), **−blessures musculo-squelettiques** chez coureurs réguliers ([Marie Claire UK / PLOS](https://www.marieclaire.co.uk/health-fitness/best-pilates-moves-for-runners)).
- **Doublon** `pilates_dead_bug` ↔ `dead_bug` (tronc) et `pilates_clam` ↔ `hip_abduction(clam)` (mobilite) : redondance inter-catégories (déjà signalé `07`). Acceptable si les focus sont distincts, mais à dédupliquer côté algo.
- Optionnel : **leg lower / single-leg lowering** (contrôle anti-bascule pelvienne + fléchisseurs de hanche excentriques) — transfert direct à la foulée.

## 5) haut_corps (4 exercices) — TROP MINCE

| Have | Manque must-have (cité) | Fix de dose | Verdict |
|---|---|---|---|
| face_pull (rot. ext/post.), pompes (poussée horiz.), tractions_or_row (tirage), ytw_prone (scapulaire) | **Press VERTICAL (overhead / landmine / push-press)** = 0 ; **porté en charge / waiter's carry** pour le bâton/poteau ; (carry déjà en tronc) | YTW/face_pull `RPE6-7` ok (endurance posturale) | ⚠️ **Mince et déséquilibré : que du tirage + 1 poussée horizontale, aucune poussée verticale** |

**Détails :**
- Le portage de sac, l'appui/poussée sur **bâtons** en montée, et le **maintien postural en fin de course** sollicitent l'**épaule en flexion/poussée verticale** ([Canadian Running](https://runningmagazine.ca/trail-running/3-upper-body-strength-moves-trail-runners-need/), [Triathlete](https://www.triathlete.com/training/workouts/upper-body-strength-training-for-running/)). **0 press vertical** dans la lib = trou net.
- Recommandé : **overhead press (DB/KB, demi-genou)** 3×8-10/bras, côtes rentrées, hanches carrées ([Canadian Running](https://runningmagazine.ca/trail-running/3-upper-body-strength-moves-trail-runners-need/)). Variante **landmine press** si épaule sensible.
- Ratio tirage:poussée actuel ~3:1 (3 tirages/scap + 1 poussée horiz). Ajouter le press vertical rééquilibre.
- Le **carry** (anti-flexion lat) existe déjà en `tronc` (suitcase) — ne pas dupliquer ; mais un **waiter's/overhead carry** spécifique bâton serait un plus.

## 6) stretching + mobilité non-balance

| Have | Manque must-have (cité) | Fix de dose / timing | Verdict |
|---|---|---|---|
| **stretching (statique, post-run) :** gastroc, soléaire, ischio, IT band/TFL, couch (psoas/rectus fem), tibial ant., adducteurs (sumo), figure-4 piriforme. **mobilite (active) :** hip 90/90, pigeon actif, knee-to-wall (DF cheville), open book (T-spine), monster walk, hip abduction, cossack | **Routine d'étirement DYNAMIQUE PRÉ-course** (leg swings sagittal+frontal, fentes marchées, A-skips, balancements) = absente ([Laura Norris](https://lauranorrisrunning.com/how-to-warm-up-for-a-run/), [Gymshark](https://www.gymshark.com/blog/article/mobility-exercises-for-runners)) ; **mob. T-spine debout** (au-delà d'open book au sol) | **Timing correct ✅** : FOCUS_META stretching marque "❌ jamais avant une séance" et "muscles chauds, post-run" — conforme à la science (statique >60s avant = −4 à −7.5% force/puissance) | ⚠️ Couverture musculaire **complète en statique**, mais **manque tout le volet dynamique/échauffement** |

**Détails :**
- **Couverture statique = complète** : DF cheville (knee_to_wall), hanche fléch. (couch/low_lunge), T-spine (open book), ischio, mollet (gastroc+soléaire), adducteur (sumo/butterfly), glute/piriforme (figure-4/pigeon). Rien de manquant en cibles.
- **Timing statique correct ✅** : `FOCUS_META.stretching.timing_notes` = "Dans les 30min après la course / Jamais avant une séance (réduit la raideur tendineuse)". C'est exactement la conclusion de la littérature : statique long pré-effort dégrade force/puissance/économie ; statique court (≤60s) intégré à un échauffement complet = impact trivial ([NSCA](https://www.nsca.com/education/articles/kinetic-select/static-stretching-and-performance/), [PMC6895680](https://pmc.ncbi.nlm.nih.gov/articles/PMC6895680/), [PMC8391672](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8391672/)).
- **Vrai trou = échauffement DYNAMIQUE pré-course** : la lib n'a pas de bloc "mobilité dynamique avant l'effort" (leg swings 2 plans, fentes marchées avec rotation, A-skips, hip openers en mouvement). Protocole de réf. : aérobie léger → dynamique grande amplitude → spécifique ([review Behm/Chaouachi via PMC3273886](https://pmc.ncbi.nlm.nih.gov/articles/PMC3273886/), [Laura Norris](https://lauranorrisrunning.com/how-to-warm-up-for-a-run/)). Knee-to-wall et hip 90/90 existent mais sont classés mobilité "active maison", pas "échauffement pré-run".
- `knee_to_wall` est décrit comme **test** (mesurer la distance) plutôt qu'exercice de gain — ok, mais ajouter une consigne "répéter en oscillant pour gagner de la DF".

---

## Liste d'implémentation priorisée (prête à coder)

| Prio | id | name_fr | catégorie | sets×reps / RPE / repos | Cue 1-ligne | Équipement | Source |
|---|---|---|---|---|---|---|---|
| 1 | `trap_bar_deadlift` (ou `deadlift`) | Soulevé de terre (trap-bar) | force_lourde | 4×4 @RPE8.5 / 180s (var. hypertrophie 4×6 RPE8) | Hinge lourd, dos neutre, pousser le sol, barre près du corps | trap-bar/barbell (fallback hex via 2 KB) | [PMC11140948](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11140948/) |
| 2 | `overhead_press` | Développé épaules (demi-genou) | haut_corps | 3×8-10/bras @RPE7 / 90s | Côtes rentrées, hanches carrées, pousser haut sans cambrer | DB/KB (ou landmine, ou bande) | [Canadian Running](https://runningmagazine.ca/trail-running/3-upper-body-strength-moves-trail-runners-need/) |
| 3 | (réglage) | Palier FORCE MAX sur squat/RDL/hip_thrust | force_lourde | ajouter variante **3-5 reps @RPE8.5-9.5**, repos 180s | "Bloc force : ≥85% 1RM, ne pas grinder >RPE9" | barbell | [PMC11052887](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/) |
| 4 | `mobilite_dynamique_prerun` | Mobilité dynamique pré-course | mobilite (timing pré-run) | 1×8-10/mouvement, sans tenue | Leg swings 2 plans + fentes marchées + A-skips, amplitude croissante | aucun | [PMC3273886](https://pmc.ncbi.nlm.nih.gov/articles/PMC3273886/), [Laura Norris](https://lauranorrisrunning.com/how-to-warm-up-for-a-run/) |
| 5 | `soleus_raise_lourd` | Mollet soléaire lourd (genou fléchi) | force_lourde | 3×8-10 @RPE8-9 / 90s | Genou fléchi ~30-90°, charge sur cuisse, amplitude complète, descente 2s | KB/DB sur genou, ou machine assise | [Recover Athletics](https://recoverathletics.com/soleus-strengthening-exercises-for-runners/) |
| 6 | `front_plank` (anti-ext) | Gainage frontal progressif (RKC) | tronc | 3×20-40s @RPE7 / 60s (puis ab-wheel) | Fesses+abdos serrés, "tirer coudes vers pieds", bassin rétroversé | tapis (ab-wheel option) | [SAPT](http://www.saptstrength.com/blog/2015/8/13/anti-lateral-flexion-core-exercises) |
| 7 | (tempo) | Préciser Alfredson : 3s descente, unilatéral, 2×/j | excentrique | 3×15, descente 3s, genou tendu+fléchi | "Monter à 2 pieds, descendre lentement sur 1 pied" | step | [Physiopedia](https://www.physio-pedia.com/Achilles_Tendinopathy_Toolkit:_Appendix_A) |
| 8 | (recat.) | `wall_sit`→isométrique ; `single_leg_glute_bridge`→force/fessier ; `copenhagen`→adducteur (pas core) | — | — | Cohérence catégories | — | `06`/`07` |
| 9 | `pilates_leg_lower` (option) | Single-leg lowering | pilates_coureur | 3×8/jambe @RPE6 / 45s | Dos plaqué, descendre la jambe sans cambrer | tapis | [Outside](https://run.outsideonline.com/training/cross-training/how-pilates-can-aid-your-running-performance/) |

## Conclusion
Les 6 catégories sont **fondamentalement solides et best-practice** sur la sélection. Les corrections sont des **réglages d'intensité et de timing**, pas une refonte : (1) ouvrir une **zone de force max** (≥85% 1RM, 2-5 reps) et **ajouter un deadlift/trap-bar + un soléaire lourd** ; (2) **étoffer haut_corps avec un press vertical** ; (3) **créer un bloc d'échauffement dynamique pré-course** (le seul vrai trou du volet souplesse) ; (4) **préciser les tempos excentriques dans la dose** et **corriger 3 mislabels** (wall_sit, single_leg_glute_bridge, copenhagen). Le timing statique post-run est déjà correct.
