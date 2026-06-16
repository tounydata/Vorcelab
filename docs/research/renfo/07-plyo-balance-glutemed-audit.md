# Audit web — Plyométrie · Proprioception/Équilibre · Moyen fessier

> Recherche S&C citée (3 domaines) confrontée à notre bibliothèque. Verdict : nos
> 3 piliers tiennent, mais chaque liste a **1-2 vrais trous + 2-3 erreurs de dose**.
> Complète `06-library-audit.md` (volet `08` = 6 autres catégories).

## Top 3 actions (si on ne change que 3 choses)
1. **Plyo : ajouter pogo/sauts UNIPODAUX** — la course est unipodale, c'est le plus gros trou de spécificité. ([centralperformance](https://centralperformance.com.au/blog/how-to-progress-your-plyometrics-a-must-know-for-runners), [pliability](https://pliability.com/stories/best-plyometrics-for-runners))
2. **Équilibre : surface instable (wobble/coussin) + yeux fermés** — la modalité avec la **plus forte preuve RCT** de réduction d'entorses, et la plus spécifique trail. ([PMC5737043](https://pmc.ncbi.nlm.nih.gov/articles/PMC5737043/), [PMC8811510](https://pmc.ncbi.nlm.nih.gov/articles/PMC8811510/))
3. **Moyen fessier : ajouter un unipodal chargé (SL squat / step-down)** et **reclasser Copenhagen en ADDUCTEUR** (ce n'est pas du moyen fessier). ([PMC11520670](https://pmc.ncbi.nlm.nih.gov/articles/PMC11520670/), [PMC8486394](https://pmc.ncbi.nlm.nih.gov/articles/PMC8486394/))

---

## 1) Plyométrie
**Preuve :** les plyos améliorent économie/raideur, effet **trivial-à-petit seuls** (g ≈ −0.13→0.19) mais **grand combiné à la force** (ES ≈ 1.34). Les gains de raideur sont **souvent plus grands à dose basse** → pas de séries à hautes reps. ([PMC9653533](https://pmc.ncbi.nlm.nih.gov/articles/PMC9653533/), [PMC10115703](https://pmc.ncbi.nlm.nih.gov/articles/PMC10115703/))

**Présents :** pogo, bondissements, drop jumps, skips, bonds latéraux, box jump, hop-and-stick. **Manquent :**
- **Pogo/sauts unipodaux** (in-place → continus → triples) — *priorité #1*, spécificité course.
- **Ankle hops** (amplitude mini, cheville raide) — entrée la plus douce, sous le pogo.
- Optionnels : hurdle hops, tuck jumps (avancés).

**Dose :** **60-120 contacts/séance** (débutants 60-80 ; +10-20 %/sem max), 2-4×/sem, ≥7 sem / >15 séances ; placer **tôt** non fatigué ; progression ankle hops → pogo → SL hops → bonds → drop jumps. Drop jumps reps **basses** (2-3×6-10), hauteur progressive.

**Erreurs de dose à corriger :**
- `pogo_jumps 4×20` (80 contacts) = limite haut ; viser 3-4×15-20 et **compter dans le total 60-120**.
- `box_jump 4×5` ok mais peu de stimulus SSC (concentrique) → envisager remplacer un créneau par SL hops.
- La liste **sommée dépasse 120 contacts** → c'est un **menu/progression, pas une seule séance**.

## 2) Proprioception / Équilibre
**Preuve :** l'entraînement proprioceptif réduit les entorses **~35 %** (RR 0.65 ; NNT 17), **43 %** en prévention primaire. Wobble board → RR ~0.71, et ↑ le travail excentrique cheville ×1.2-4.4. ([PMC5737043](https://pmc.ncbi.nlm.nih.gov/articles/PMC5737043/), [PMC8811510](https://pmc.ncbi.nlm.nih.gov/articles/PMC8811510/))

**Présents (le trio qu'on vient d'ajouter) :** équilibre unipodal, Y-balance, hop-and-stick. **Verdict : pas suffisant** — il saute le **milieu canonique**. Échelle complète : statique SL → **yeux fermés** → **surface instable (wobble/mousse)** → reach dynamique (Y-balance) → hop-and-stick. **Ajouter au moins surface instable + yeux fermés** (le wobble est le meilleur ajout).
> Note : notre `balance_unipodal` a déjà « yeux fermés » et « surface instable » en **options de variante** — mais un drill **wobble dédié** + progression explicite est recommandé.

**Dose :** 5-30 min/séance, 1-5×/sem, ≥4 sem→saison. **Règle de progression : tenir 30 s SL avant de passer yeux fermés/instable** ; ensuite **changer le stimulus**, pas juste rallonger le temps.

## 3) Moyen fessier / Abducteurs
**Preuve :** abducteurs faibles → valgus dynamique → SFPR & syndrome bandelette. **RCT coureurs (MTSS) :** 8 sem, 3×/sem, **3×15 à 10-RM bandes progressives** → chute de bascule pelvienne **−50 %**, valgus **−42 %**. ([PMC11520670](https://pmc.ncbi.nlm.nih.gov/articles/PMC11520670/), [Sciencedirect](https://www.sciencedirect.com/science/article/abs/pii/S144024401630202X))

**Présents :** monster_walk, hip_abduction/clam, side_plank_hipdrop (**~88-103 % MVIC** moyen fessier, un des plus hauts), pilates_clam, pilates_side_kick. **Caveats :**
1. **`copenhagen_plank` = ADDUCTEUR**, pas moyen fessier — à garder (prévention pubalgie/groin, utile trail) mais **ne compte pas** comme abducteur.
2. **Manque un unipodal fonctionnel chargé** (SL squat / step-down / SL bridge) — le mouvement avec le meilleur transfert (contrôle du valgus sous charge).
3. `hip_abduction(clam)` + `pilates_clam` = quasi-doublons → en fusionner un, réallouer vers le SL squat manquant.

**Erreurs de dose :** prescrire à un **standard de charge (10-RM / RPE)**, pas des reps en poids de corps non progressées (sinon sous-dosé pour changer le valgus). Copenhagen : progression **2×6 → 3×15** sur 8 sem.

---

## Liste d'implémentation priorisée (prête à coder)

| Prio | Action | Catégorie | Dose | Source |
|---|---|---|---|---|
| 1 | Ajouter **sauts unipodaux** (SL pogo/hops, in-place→continus) | pliometrie | 3×6-10/jambe, contrôle | centralperformance |
| 2 | Ajouter **ankle hops** (amplitude mini) | pliometrie | 3×20, raideur cheville | sportsmith |
| 3 | Ajouter **équilibre wobble/surface instable + yeux fermés** (drill ou progression explicite) | mobilite | 3×30-45 s, après 30 s SL stable | PMC5737043 |
| 4 | Ajouter **SL squat / step-down chargé** (moyen fessier fonctionnel) | force_lourde/mobilite | 3×8-12/jambe, charge progressive | PMC11520670 |
| 5 | **Reclasser Copenhagen** → adducteur (libellé/bénéfices), dose 2×6→3×15 | tronc | progression 8 sem | PMC8486394 |
| 6 | Fusionner doublon `clam`/`pilates_clam` | — | — | — |
| 7 | Plafonner la plyo à **60-120 contacts/séance** (logique de sélection) | pliometrie | menu, pas tout d'un coup | PMC9653533 |
| 8 | Standardiser les doses moyen fessier sur **10-RM/RPE** (bandes progressives) | mobilite/tronc | 3×15 @10-RM | PMC11520670 |
