// Démos d'exercices — WebP animés (GymVisual, licence commerciale), servis depuis
// le CDN Pages de l'app web (public/exercises/). expo-image gère le WebP animé.
// Un id absent de COVERED retombe sur le placeholder (ExerciseMedia).

const BASE = 'https://vorcelab.app/exercises'

const COVERED = new Set<string>([
  'ankle_hops','balance_unipodal','bird_dog','bondissements','box_jump','bulgare',
  'butterfly','cat_cow','child_pose','copenhagen_plank','cossack_squat','dead_bug',
  'deadlift','downward_dog','drop_jumps','face_pull','figure_4_piriforme',
  'gastrocnemien_stretch','hip_abduction','hip_flexor_couch','hip_thrust',
  'hop_and_stick','ischio_debout','lateral_bound','lateral_lunge','lizard_pose',
  'low_lunge','lunge_marcheur','mollet_excentrique','mollets_lourds','monster_walk',
  'nordic','open_book','pallof_press','pigeon_actif','pogo_jumps','pompes','rdl',
  'reclined_twist','side_plank_hipdrop','single_leg_glute_bridge','single_leg_squat',
  'skips','sl_pogo','squat_lourd','step_up','suitcase_carry','supine_twist',
  'tibialis_raise','tractions_or_row','wall_sit','warrior_3','y_balance','ytw_prone',
])

const HAS_MAISON = new Set<string>(['squat_lourd','rdl','bulgare','mollets_lourds','hip_thrust'])

export type ExoLocation = 'maison' | 'salle' | undefined

export function getExerciseMediaUrl(id: string, location?: ExoLocation): string | null {
  if (!COVERED.has(id)) return null
  if (location === 'maison' && HAS_MAISON.has(id)) return `${BASE}/${id}.maison.webp`
  return `${BASE}/${id}.webp`
}
