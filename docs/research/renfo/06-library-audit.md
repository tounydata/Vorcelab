# Audit de la bibliothèque renfo (contenu réel)

> Vérification exercice-par-exercice de `src/lib/renfoData.ts` (67 exercices, 9
> catégories) contre les meilleures pratiques course/trail (volets `01`/`02`).
> Réponse à : « est-on sûr d'avoir TOUT ? ». **Verdict global : le contenu est
> solide et majoritairement best-practice.** La sensation de faiblesse venait
> surtout de l'**algo qui cachait 3 catégories** (Pilates/haut-corps réglés en #378)
> et de l'**absence de démos**, pas du fond.

## Verdict par catégorie

| Catégorie | Nb | Contenu | Verdict | Manque / fix |
|---|---|---|---|---|
| **force_lourde** | 8 | squat, RDL, hip thrust, bulgares, fente marcheur, step-up, fente latérale, mollets lestés | ✅ Solide (squat + hinge + glute + unilatéral + frontal + mollet) | RAS (soléaire lourd couvert via excentrique) |
| **excentrique** | 9 | mollet Alfredson, nordic, reverse nordic, SL-RDL, SL-squat, step-down, tibial, wall sit, pont fessier | ✅ Solide, **fort trail/descente** | `wall_sit` est isométrique (pas excentrique) ; `single_leg_glute_bridge` est plutôt fessier → re-catégoriser |
| **pliometrie** | 6 | bonds, box jump, drop jump, bonds latéraux, pogo, gammes | ✅ Solide (réactif + horizontal + vertical + raideur) | Optionnel : sauts unipodaux / ankle hops (raideur trail) |
| **tronc** | 7 | bird-dog, copenhagen, rotation, dead-bug, pallof, planche latérale dyn., suitcase carry | ✅ **Textbook anti-mouvement** (anti-ext./rot./flexion lat. + adducteurs) | RAS |
| **haut_corps** | 4 | face pull, pompes, traction/tirage, YTW | ⚠️ **Mince** (mais secondaire pour coureurs) | Ajout possible : développé épaules, plank-to-row, portés |
| **pilates_coureur** | 9 | hundred, roll-up, single-leg stretch, dead-bug, swimming, bridge series, clam, side-kick, teaser prep | ✅ Solide (core profond + moyen fessier) | RAS |
| **yoga_coureur** | 9 | chien tête en bas, enfant, fente basse, lézard, chat-vache, papillon, torsions, guerrier III | ✅ Solide (souplesse + équilibre via guerrier III) | RAS |
| **stretching** | 8 | gastroc, soléaire, ischio, IT band, couch (psoas), tibial ant., adducteurs, figure-4 piriforme | ✅ Solide, couverture membre inférieur complète | RAS |
| **mobilite** | 7 | cossack, hanche 90/90, abduction hanche, cheville au mur, monster walk, open book, pigeon | ✅ Solide mobilité… | **mais voir LE manque ci-dessous** |

## LE vrai manque : proprioception / équilibre

Sur les **67 exercices, AUCUN n'est un drill d'équilibre/proprioception dédié**. On a de la
**mobilité** cheville (cheville au mur) et du **travail unipodal** (SL-squat, SL-RDL,
guerrier III) qui donnent un peu de stabilité, mais **pas de proprioception explicite**.

→ Or la science (volet 02) : l'entraînement proprioceptif de cheville réduit les
**entorses de ~35 %** et améliore la stabilité sur terrain technique — un must trail.
**C'est le manque de contenu le plus net et le plus rentable.**

## Manques secondaires
- **`haut_corps` mince** (4) — acceptable pour des coureurs, mais le plus faible.
- **Mislabels** mineurs : `wall_sit` (isométrique) et `single_leg_glute_bridge` (fessier) classés `excentrique`.
- **Démos** : 67 exercices pointent vers une *recherche YouTube*, ~3 ont un média réel → la dette « DÉMO À VENIR » plombe le ressenti (hors périmètre de cet audit contenu, mais à traiter).

## Ce qu'on a déjà vérifié = présent (et qu'on craignait manquer)
- ✅ **Soléaire** genou fléchi (Alfredson + étirement soléaire dédié).
- ✅ **Moyen fessier / abducteurs** (monster walk, abduction, clam, side-kick).
- ✅ **Anti-rotation** (pallof), **hinge** (RDL, SL-RDL, nordic), **excentrique descente** (step-down, reverse nordic).

## Exercices / fixes à ajouter (priorisé, prêt à intégrer)

| Prio | Ajout | Catégorie | Séries×reps / RPE | Consigne 1 ligne | Source |
|---|---|---|---|---|---|
| **1** | **Équilibre unipodal progressif** (yeux ouverts → fermés → coussin) | mobilite (ou nouveau focus « prévention ») | 3 × 30–45 s/jambe | Debout sur une jambe, genou souple, regard fixe ; progresser yeux fermés puis surface instable | Proprioception ↓ entorses ~35 % (volet 02) |
| **2** | **Y-balance / reach unipodal** | mobilite | 2 × 6 reaches/jambe | Sur une jambe, tendre l'autre pied loin devant/côté/arrière en contrôle, revenir sans poser | Stabilité dynamique cheville/hanche (volet 02) |
| 3 | **Hop-and-stick unipodal** (réactif + stabilité atterrissage) | pliometrie | 3 × 5/jambe | Petit saut, atterrir sur une jambe et **figer 2 s** sans osciller | Raideur + contrôle atterrissage trail |
| 4 | **Développé épaules** (haltères/bandes) | haut_corps | 3 × 10 | Renforce le portage de sac / bâtons | Étoffe `haut_corps` |
| 5 | Re-catégoriser `wall_sit` → isométrique/quad, `single_leg_glute_bridge` → force_lourde/fessier | — | — | Cohérence des catégories | — |

## Conclusion
On n'est **pas mauvais sur le contenu** — la biblio est solide et best-practice sur
l'essentiel (core, excentrique/trail, force, mobilité, Pilates). Pour passer
**best-in-class** sur le contenu, l'ordre est : (1) **proprioception/équilibre**
(le vrai trou), (2) **démos** (perception), (3) étoffer `haut_corps`, (4) corriger
2 mislabels. Le reste de la supériorité se joue sur l'**algo** (périodisation,
progression universelle, dosage trail) — cf. `00-SYNTHESE.md`.
