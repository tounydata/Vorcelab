// Démos d'exercices issues de free-exercise-db (yuhonas) — licence Unlicense
// (domaine public, ré-hébergeable). Chaque exercice a 2 images (position de départ
// et d'arrivée) : on les BOUCLE pour obtenir un mouvement animé (cf. ExerciseMedia),
// 100 % libre de droits. Mapping fait à la main, haute confiance ; un exercice non
// listé retombe sur le placeholder SVG. Source : github.com/yuhonas/free-exercise-db

const FED_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

// id d'exercice Vorcelab → DOSSIER free-exercise-db (qui contient 0.jpg + 1.jpg).
const FED_MEDIA: Record<string, string> = {
  squat_lourd: 'Barbell_Squat',
  deadlift: 'Trap_Bar_Deadlift',
  rdl: 'Romanian_Deadlift',
  hip_thrust: 'Barbell_Hip_Thrust',
  lunge_marcheur: 'Bodyweight_Walking_Lunge',
  step_up: 'Step-up_with_Knee_Raise',
  mollets_lourds: 'Rocking_Standing_Calf_Raise',
  soleus_raise: 'Seated_Calf_Raise',
  mollet_excentrique: 'Seated_Calf_Raise',
  single_leg_glute_bridge: 'Single_Leg_Glute_Bridge',
  // pliométrie
  box_jump: 'Front_Box_Jump',
  drop_jumps: 'Depth_Jump_Leap',
  bondissements: 'Lateral_Bound',
  hop_and_stick: 'Single-Leg_Hop_Progression',
  sl_pogo: 'Single-Leg_Hop_Progression',
  // tronc
  dead_bug: 'Dead_Bug',
  pallof_press: 'Pallof_Press',
  core_rotation: 'Russian_Twist',
  side_plank_hipdrop: 'Push_Up_to_Side_Plank',
  // haut du corps
  pompes: 'Clock_Push-Up',
  tractions_or_row: 'Scapular_Pull-Up',
  face_pull: 'Face_Pull',
  overhead_press: 'Dumbbell_Shoulder_Press',
  // pilates
  pilates_dead_bug: 'Dead_Bug',
  pilates_swimming: 'Superman',
  pilates_bridge_series: 'Barbell_Glute_Bridge',
  // étirements
  gastrocnemien_stretch: 'Standing_Gastrocnemius_Calf_Stretch',
  solaire_stretch: 'Standing_Soleus_And_Achilles_Stretch',
  ischio_debout: 'Standing_Hamstring_and_Calf_Stretch',
  hip_flexor_couch: 'Intermediate_Hip_Flexor_and_Quad_Stretch',
}

/** Frames de la démo (2 images départ→arrivée à boucler), ou null → placeholder. */
export function getExerciseMediaFrames(id: string): string[] | null {
  const folder = FED_MEDIA[id]
  if (!folder) return null
  return [`${FED_BASE}/${folder}/0.jpg`, `${FED_BASE}/${folder}/1.jpg`]
}

/** Première frame (compat / vignette statique). */
export function getExerciseMediaUrl(id: string): string | null {
  return getExerciseMediaFrames(id)?.[0] ?? null
}
