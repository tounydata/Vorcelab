// src/lib/coach/workouts.ts
// Base de connaissances « séances » du Coach algorithmique (slice vertical).
// 100% déterministe, aucune IA — conforme à la règle Strava (pas d'envoi de
// données à un fournisseur d'IA). Cette bibliothèque est destinée à grandir et
// à migrer en table Supabase (`workout_library`) ; ici elle sert de socle seed.

export type WorkoutSystem =
  | 'endurance'   // aérobie fondamentale (Z2)
  | 'recovery'    // récupération active
  | 'long'        // sortie longue
  | 'tempo'       // seuil aérobie / tempo
  | 'threshold'   // seuil anaérobie
  | 'vo2max'      // VO2max
  | 'hills'       // côtes — force-vitesse spécifique montée
  | 'descent'     // descente technique — durabilité musculaire
  | 'strength'    // renfo (renvoi vers le module Renfo)
  | 'race'        // jour de course

export type Intensity = 'easy' | 'moderate' | 'hard'
export type Terrain = 'flat' | 'rolling' | 'uphill' | 'downhill' | 'any'
export type Phase = 'base' | 'build' | 'specific' | 'taper' | 'race'

export interface WorkoutTemplate {
  id: string
  name: string
  system: WorkoutSystem
  intensity: Intensity
  terrain: Terrain
  /** Durée de référence (min) pour une semaine de développement moyenne ; mise à l'échelle selon la phase. */
  baseDurationMin: number
  /** La séance porte une charge de dénivelé positif (montée). */
  climbing: boolean
  /** Phases où la séance est pertinente. */
  phases: Phase[]
  /** Séance spécifique trail — ignorée pour une course sur route. */
  trailOnly?: boolean
  description: string
}

export const WORKOUTS: readonly WorkoutTemplate[] = [
  {
    id: 'endurance_easy',
    name: 'Endurance fondamentale',
    system: 'endurance', intensity: 'easy', terrain: 'any',
    baseDurationMin: 60, climbing: false,
    phases: ['base', 'build', 'specific', 'taper'],
    description: 'Footing en zone 2, respiration confortable. Développe la base aérobie et la capillarisation.',
  },
  {
    id: 'recovery_jog',
    name: 'Footing récupération',
    system: 'recovery', intensity: 'easy', terrain: 'flat',
    baseDurationMin: 35, climbing: false,
    phases: ['base', 'build', 'specific', 'taper', 'race'],
    description: 'Très facile, sur terrain roulant. Accélère la récupération sans ajouter de stress.',
  },
  {
    id: 'long_run_flat',
    name: 'Sortie longue',
    system: 'long', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 120, climbing: false,
    phases: ['base', 'build', 'specific'],
    description: 'Sortie longue en endurance. Développe l\'endurance et l\'économie de course.',
  },
  {
    id: 'long_run_dplus',
    name: 'Sortie longue D+',
    system: 'long', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 150, climbing: true, trailOnly: true,
    phases: ['base', 'build', 'specific'],
    description: 'Sortie longue avec dénivelé soutenu. Spécifique trail : muscle les montées et la durabilité.',
  },
  {
    id: 'tempo_run',
    name: 'Tempo / seuil aérobie',
    system: 'tempo', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 50, climbing: false,
    phases: ['base', 'build', 'specific'],
    description: 'Bloc continu à allure tempo (≈ allure semi soutenue). Repousse le seuil aérobie.',
  },
  {
    id: 'threshold_intervals',
    name: 'Seuil (intervalles)',
    system: 'threshold', intensity: 'hard', terrain: 'rolling',
    baseDurationMin: 55, climbing: false,
    phases: ['build', 'specific'],
    description: 'Ex : 4×8 min au seuil, récup 2 min. Élève la vitesse au seuil lactique.',
  },
  {
    id: 'vo2_intervals',
    name: 'VO2max (intervalles courts)',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 50, climbing: false,
    phases: ['build', 'specific', 'taper'],
    description: 'Ex : 6×3 min à allure 3 km, récup 2 min. Développe la puissance aérobie maximale.',
  },
  {
    id: 'hill_repeats_short',
    name: 'Côtes courtes',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 45, climbing: true,
    phases: ['base', 'build'],
    description: 'Ex : 10×45 s en côte raide, récup descente. Force-vitesse et raideur musculaire.',
  },
  {
    id: 'hill_repeats_long',
    name: 'Côtes longues',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 60, climbing: true, trailOnly: true,
    phases: ['build', 'specific'],
    description: 'Ex : 5×4 min en montée à allure seuil. Spécifique montée trail soutenue.',
  },
  {
    id: 'downhill_technique',
    name: 'Descente technique',
    system: 'descent', intensity: 'moderate', terrain: 'downhill',
    baseDurationMin: 50, climbing: false, trailOnly: true,
    phases: ['build', 'specific'],
    description: 'Répétitions de descente technique. Durabilité musculaire (excentrique) et pilotage en descente.',
  },
  {
    id: 'race_pace_dplus',
    name: 'Bloc spécifique allure course (D+)',
    system: 'long', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 90, climbing: true, trailOnly: true,
    phases: ['specific'],
    description: 'Bloc à allure course sur profil proche de l\'objectif (montées + descentes). Spécificité maximale.',
  },
  {
    id: 'progressive_run',
    name: 'Sortie progressive',
    system: 'tempo', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 60, climbing: false,
    phases: ['base', 'build'],
    description: 'Allure croissante, finir les derniers km soutenus. Travaille la gestion d\'allure.',
  },
  {
    id: 'strength_link',
    name: 'Renforcement (module Renfo)',
    system: 'strength', intensity: 'moderate', terrain: 'any',
    baseDurationMin: 40, climbing: false,
    phases: ['base', 'build'],
    description: 'Séance de renforcement co-périodisée avec la course. Voir le module Renfo.',
  },
  {
    id: 'sharpener',
    name: 'Rappels de vitesse',
    system: 'vo2max', intensity: 'moderate', terrain: 'flat',
    baseDurationMin: 35, climbing: false,
    phases: ['taper', 'race'],
    description: 'Ex : 6×100 m en accélération. Garde le système nerveux affûté pendant l\'affûtage.',
  },
  {
    id: 'shakeout',
    name: 'Déverrouillage (veille de course)',
    system: 'recovery', intensity: 'easy', terrain: 'flat',
    baseDurationMin: 25, climbing: false,
    phases: ['race'],
    description: 'Footing très court avec quelques lignes. Active les jambes sans fatiguer.',
  },
  // ── Alignement knowledge-base §7 : types spécifiques manquants ──
  {
    id: 'block_choc_d1',
    name: 'Bloc choc — jour 1',
    system: 'long', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 240, climbing: true, trailOnly: true,
    phases: ['specific'],
    description: 'Double sortie longue (1/2) : grosse sortie trail. À enchaîner avec le jour 2 sous 72 h. Surcharge spécifique ultra (B2B).',
  },
  {
    id: 'block_choc_d2',
    name: 'Bloc choc — jour 2',
    system: 'long', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 150, climbing: true, trailOnly: true,
    phases: ['specific'],
    description: 'Double sortie longue (2/2) : le lendemain, sur jambes fatiguées. Durabilité musculaire spécifique ultra.',
  },
  {
    id: 'billat_30_30',
    name: '30/30 (Billat)',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 45, climbing: false,
    phases: ['build', 'specific'],
    description: 'Ex : 2×(10×30 s à VMA / 30 s footing). Accumule du temps proche de VO2max avec une fatigue gérée.',
  },
  {
    id: 'roche_1_1',
    name: 'VO2 court 1/1 (Roche)',
    system: 'vo2max', intensity: 'hard', terrain: 'any',
    baseDurationMin: 45, climbing: false,
    phases: ['build', 'specific'],
    description: '16×[1 min à VMA / 1 min footing flottant]. Puissance aérobie en format fluide, utilisable toute l\'année.',
  },
  {
    id: 'hill_30_30',
    name: '30/30 en côte',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 45, climbing: true,
    phases: ['build', 'specific'],
    description: 'Ex : 12×(30 s intense en côte / 45 s footing lent pour redescendre). Puissance et force spécifique en montée.',
  },
  {
    id: 'marathon_pace',
    name: 'Spécifique allure marathon',
    system: 'tempo', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 80, climbing: false,
    phases: ['specific'],
    description: 'Blocs à allure marathon (ex : 5×[½ mile seuil + ½ mile allure marathon]). Spécificité course route.',
  },
] as const

const WORKOUT_BY_ID = new Map(WORKOUTS.map((w) => [w.id, w]))

export function getWorkout(id: string): WorkoutTemplate | undefined {
  return WORKOUT_BY_ID.get(id)
}
