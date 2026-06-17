// Démos d'exercices issues de free-exercise-db (yuhonas) — licence Unlicense
// (domaine public, ré-hébergeable). Images statiques (position d'exécution).
// Mapping FAIT À LA MAIN, haute confiance uniquement : un exercice non listé
// retombe proprement sur le placeholder SVG. À enrichir au fil du temps.
// Source : https://github.com/yuhonas/free-exercise-db (Unlicense)

const FED_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

// id d'exercice Vorcelab → chemin image free-exercise-db.
const FED_MEDIA: Record<string, string> = {
  squat_lourd: 'Barbell_Squat/0.jpg',
  deadlift: 'Trap_Bar_Deadlift/0.jpg',
  rdl: 'Romanian_Deadlift/0.jpg',
  hip_thrust: 'Barbell_Hip_Thrust/0.jpg',
  lunge_marcheur: 'Bodyweight_Walking_Lunge/0.jpg',
  step_up: 'Step-up_with_Knee_Raise/0.jpg',
  mollets_lourds: 'Rocking_Standing_Calf_Raise/0.jpg',
  soleus_raise: 'Seated_Calf_Raise/0.jpg',
  mollet_excentrique: 'Seated_Calf_Raise/0.jpg',
  single_leg_glute_bridge: 'Single_Leg_Glute_Bridge/0.jpg',
  // pliométrie
  box_jump: 'Front_Box_Jump/0.jpg',
  drop_jumps: 'Depth_Jump_Leap/0.jpg',
  bondissements: 'Lateral_Bound/0.jpg',
  hop_and_stick: 'Single-Leg_Hop_Progression/0.jpg',
  sl_pogo: 'Single-Leg_Hop_Progression/0.jpg',
  // tronc
  dead_bug: 'Dead_Bug/0.jpg',
  pallof_press: 'Pallof_Press/0.jpg',
  core_rotation: 'Russian_Twist/0.jpg',
  side_plank_hipdrop: 'Push_Up_to_Side_Plank/0.jpg',
  // haut du corps
  pompes: 'Clock_Push-Up/0.jpg',
  tractions_or_row: 'Scapular_Pull-Up/0.jpg',
  face_pull: 'Face_Pull/0.jpg',
  overhead_press: 'Dumbbell_Shoulder_Press/0.jpg',
  // pilates
  pilates_dead_bug: 'Dead_Bug/0.jpg',
  pilates_swimming: 'Superman/0.jpg',
  pilates_bridge_series: 'Barbell_Glute_Bridge/0.jpg',
  // étirements
  gastrocnemien_stretch: 'Standing_Gastrocnemius_Calf_Stretch/0.jpg',
  solaire_stretch: 'Standing_Soleus_And_Achilles_Stretch/0.jpg',
  ischio_debout: 'Standing_Hamstring_and_Calf_Stretch/0.jpg',
  hip_flexor_couch: 'Intermediate_Hip_Flexor_and_Quad_Stretch/0.jpg',
}

/** URL de la démo (image) d'un exercice, ou null si pas de mapping (→ placeholder). */
export function getExerciseMediaUrl(id: string): string | null {
  const path = FED_MEDIA[id]
  return path ? `${FED_BASE}/${path}` : null
}
