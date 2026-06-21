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
  it_band_stretch: 'Iliotibial_Tract-SMR',
  adductor_squat_stretch: 'Adductor_Groin',
  butterfly: 'Intermediate_Groin_Stretch',
  pigeon_actif: 'IT_Band_and_Glute_Stretch',
  lizard_pose: 'Kneeling_Hip_Flexor',
  cat_cow: 'Cat_Stretch',
  child_pose: 'Childs_Pose',
  supine_twist: 'Spinal_Stretch',
  reclined_twist: 'Spinal_Stretch',
  open_book: 'Torso_Rotation',
  // force / unilatéral
  bulgare: 'Split_Squat_with_Dumbbells',
  cossack_squat: 'Barbell_Side_Split_Squat',
  single_leg_squat: 'Single-Leg_High_Box_Squat',
  step_down: 'Step-up_with_Knee_Raise',
  copenhagen_plank: 'Cable_Hip_Adduction',
  suitcase_carry: 'Rickshaw_Carry',
  ytw_prone: 'Lying_Rear_Delt_Raise',
  lateral_bound: 'Lateral_Bound',
  pilates_roll_up: 'Sit-Up',
  // mobilité / prévention
  monster_walk: 'Monster_Walk',
  knee_to_wall: 'Ankle_Circles',
  // — Ajouts (recherche multi-sources, confiance haute/moyenne) —
  nordic: 'Floor_Glute-Ham_Raise',
  hip_9090: '90_90_Hamstring',
  goblet_squat: 'Goblet_Squat',
  leg_press: 'Leg_Press',
  inverted_row: 'Inverted_Row',
  tractions: 'Pullups',
  skips: 'Fast_Skipping',
  squat_tempo: 'Bodyweight_Squat',
  hip_abduction: 'Thigh_Abductor',
  chop_bande: 'Standing_Cable_Wood_Chop',
  figure_4_piriforme: 'Ankle_On_The_Knee',
  lateral_lunge: 'Barbell_Side_Split_Squat',
  balance_unipodal: 'Balance_Board',
}

// Démos hors free-exercise-db, en URL explicites (1 image/gif, ou 2 frames à
// boucler). Sources et licences — ZONES GRISES ASSUMÉES, à créditer (cf. plus bas) :
//  • wger.de/media .......... CC-BY-SA 4.0 (attribution + partage à l'identique)
//  • media.musclewiki.com ... usage non commercial / attribution (zone grise)
//  • cdn.jsdelivr.net (ExerciseDB mirror) ... licence incertaine (zone grise)
//  • upload.wikimedia.org ... CC (Commons) — images lourdes, hotlink ; en cas de
//    rate-limit (429) l'app retombe proprement sur le picto animé (onError).
// Crédits détaillés : voir MEDIA_CREDITS.md.
const EXTRA_MEDIA: Record<string, string[]> = {
  single_leg_rdl: ['https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/dumbbell-single-leg-deadlift.gif'],
  reverse_nordic: ['https://wger.de/media/exercise-images/909/159222d9-c1e4-46ae-89ee-6a2dfaab978d.png'],
  bird_dog: [
    'https://media.musclewiki.com/media/uploads/og-male-Bodyweight-bird-dog-front.jpg',
    'https://media.musclewiki.com/media/uploads/og-male-Bodyweight-bird-dog-side.jpg',
  ],
  pilates_clam: [
    'https://media.musclewiki.com/media/uploads/og-male-Recovery-clamshells-1-side-lying-front.jpg',
    'https://media.musclewiki.com/media/uploads/og-male-Recovery-clamshells-1-side-lying-side.jpg',
  ],
  pilates_hundred: [
    'https://media.musclewiki.com/media/uploads/og-male-Pilates-hundred-front.jpg',
    'https://media.musclewiki.com/media/uploads/og-male-Pilates-hundred-side.jpg',
  ],
  downward_dog: ['https://upload.wikimedia.org/wikipedia/commons/5/57/Downward-Facing-Dog.JPG'],
  low_lunge: ['https://upload.wikimedia.org/wikipedia/commons/5/5c/J%C3%B3ga_Anjaneyasana.jpg'],
  warrior_3: ['https://upload.wikimedia.org/wikipedia/commons/4/45/Virabhadrasana_III_from_back.jpg'],
}

/** Frames de la démo (1 gif/image, ou 2 images départ→arrivée à boucler), ou null → placeholder. */
export function getExerciseMediaFrames(id: string): string[] | null {
  const folder = FED_MEDIA[id]
  if (folder) return [`${FED_BASE}/${folder}/0.jpg`, `${FED_BASE}/${folder}/1.jpg`]
  return EXTRA_MEDIA[id] ?? null
}

/** Première frame (compat / vignette statique). */
export function getExerciseMediaUrl(id: string): string | null {
  return getExerciseMediaFrames(id)?.[0] ?? null
}
