// Démos d'exercices « maison » : figures articulées animées en SVG (zéro licence, on
// possède tout). Chaque pattern = deux poses clés (départ ↔ position basse/active) que
// <StickFigure> interpole en boucle. Vue de profil, viewBox 120×120, sol à y≈112.
//
// Une pose = coordonnées [x,y] des articulations, dans cet ordre :
//   [head, shoulder, elbow, hand, hip, knee, ankle]
// Les longueurs de segments restent ~constantes entre A et B (même corps).

export type Joint = [number, number]
export interface Pose {
  head: Joint; shoulder: Joint; elbow: Joint; hand: Joint
  hip: Joint; knee: Joint; ankle: Joint
}
export interface Demo { a: Pose; b: Pose; dur?: number }

const p = (
  head: Joint, shoulder: Joint, elbow: Joint, hand: Joint, hip: Joint, knee: Joint, ankle: Joint,
): Pose => ({ head, shoulder, elbow, hand, hip, knee, ankle })

// ── Patterns de mouvement ─────────────────────────────────────────────────────
export const DEMO_PATTERNS: Record<string, Demo> = {
  // Squat : debout → hanches en arrière/bas, genoux fléchis, léger buste penché.
  squat: {
    a: p([60, 18], [60, 30], [58, 44], [56, 56], [60, 64], [60, 88], [60, 112]),
    b: p([52, 30], [54, 42], [62, 50], [70, 52], [56, 72], [44, 88], [50, 112]),
    dur: 2.4,
  },
  // Charnière de hanche (RDL) : dos plat, bascule du buste vers l'avant, genoux peu fléchis.
  hinge: {
    a: p([60, 18], [60, 30], [58, 44], [56, 56], [60, 64], [60, 88], [60, 112]),
    b: p([84, 36], [78, 42], [80, 56], [82, 68], [58, 60], [56, 86], [58, 112]),
    dur: 2.4,
  },
  // Fente : une jambe avant fléchie, genou arrière vers le bas.
  lunge: {
    a: p([60, 18], [60, 30], [58, 44], [56, 56], [60, 64], [60, 88], [60, 112]),
    b: p([60, 26], [60, 38], [54, 50], [50, 60], [60, 70], [42, 92], [78, 100]),
    dur: 2.6,
  },
  // Pont fessier / hip thrust : allongé, hanches montent puis redescendent.
  bridge: {
    a: p([22, 96], [34, 96], [30, 104], [26, 110], [70, 96], [86, 84], [104, 104]),
    b: p([22, 92], [34, 92], [30, 100], [26, 106], [70, 74], [86, 78], [104, 104]),
    dur: 2.2,
  },
  // Pompes : appui mains/pieds, le corps descend puis remonte (planche inclinée).
  pushup: {
    a: p([26, 70], [40, 74], [40, 90], [40, 104], [78, 80], [98, 92], [110, 104]),
    b: p([24, 84], [40, 88], [40, 98], [40, 104], [78, 90], [98, 98], [110, 106]),
    dur: 2.0,
  },
  // Tirage / traction : buste vertical, les mains tirent vers le haut/poitrine.
  pull: {
    a: p([60, 20], [60, 32], [58, 22], [56, 12], [60, 64], [60, 88], [60, 112]),
    b: p([60, 26], [60, 38], [50, 44], [60, 30], [60, 66], [60, 90], [60, 112]),
    dur: 2.2,
  },
  // Gainage / planche : corps gréé en ligne, légère oscillation (tenue).
  plank: {
    a: p([26, 72], [40, 76], [40, 92], [40, 104], [78, 82], [98, 92], [110, 102]),
    b: p([26, 74], [40, 78], [40, 94], [40, 104], [78, 84], [98, 94], [110, 103]),
    dur: 2.6,
  },
  // Mollets : debout, montée sur la pointe des pieds (talons qui montent).
  calf: {
    a: p([60, 20], [60, 32], [58, 46], [56, 58], [60, 66], [60, 88], [60, 112]),
    b: p([60, 14], [60, 26], [58, 40], [56, 52], [60, 60], [60, 84], [60, 108]),
    dur: 1.8,
  },
  // Saut / pliométrie : flexion puis extension explosive vers le haut.
  jump: {
    a: p([56, 30], [58, 42], [66, 50], [74, 52], [58, 70], [46, 88], [52, 112]),
    b: p([60, 10], [60, 22], [60, 12], [60, 4], [60, 56], [60, 84], [60, 110]),
    dur: 1.6,
  },
}

// ── Mapping exercice (id parent) → pattern ────────────────────────────────────
export const EXERCISE_DEMO: Record<string, keyof typeof DEMO_PATTERNS> = {
  // Force / squat
  squat_lourd: 'squat', single_leg_squat: 'squat', cossack_squat: 'squat', wall_sit: 'squat',
  // Charnière
  rdl: 'hinge', single_leg_rdl: 'hinge',
  // Fentes / step
  bulgare: 'lunge', lunge_marcheur: 'lunge', lateral_lunge: 'lunge',
  step_up: 'lunge', step_down: 'lunge',
  // Pont / fessiers
  hip_thrust: 'bridge', single_leg_glute_bridge: 'bridge',
  // Haut du corps
  pompes: 'pushup', tractions_or_row: 'pull',
  // Gainage
  copenhagen_plank: 'plank', side_plank_hipdrop: 'plank', dead_bug: 'plank', bird_dog: 'plank',
  // Mollets
  mollets_lourds: 'calf', mollet_excentrique: 'calf', tibialis_raise: 'calf',
  // Pliométrie
  box_jump: 'jump', drop_jumps: 'jump', pogo_jumps: 'jump',
  bondissements: 'jump', lateral_bound: 'jump', skips: 'jump',
}

export function getExerciseDemo(exerciseId?: string): Demo | null {
  if (!exerciseId) return null
  const key = EXERCISE_DEMO[exerciseId]
  return key ? DEMO_PATTERNS[key] : null
}
