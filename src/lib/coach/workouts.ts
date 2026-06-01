// src/lib/coach/workouts.ts
// Base de connaissances « séances » du Coach algorithmique.
// 100% déterministe, aucune IA — conforme à la règle Strava (pas d'envoi de
// données à un fournisseur d'IA). Cette bibliothèque est destinée à grandir et
// à migrer en table Supabase (`workout_library`) ; ici elle sert de socle seed.
//
// Source de vérité scientifique : docs/coach/session-library.md (57 séances,
// Daniels/VDOT, Canova, Koop, Billat, Magness, Seiler, Pfitzinger, Uphill
// Athlete, Roche). Chaque séance porte les métadonnées d'ADAPTATION AU PROFIL
// (levels × distances × target) consommées par le moteur adaptCatalog.

export type WorkoutSystem =
  | 'endurance'   // aérobie fondamentale (Z2)
  | 'recovery'    // récupération active
  | 'long'        // sortie longue
  | 'tempo'       // seuil aérobie / tempo
  | 'threshold'   // seuil anaérobie
  | 'vo2max'      // VO2max
  | 'speed'       // vitesse & économie (strides, R, sprints, fartlek)
  | 'hills'       // côtes — force-vitesse spécifique montée
  | 'descent'     // descente technique — durabilité musculaire
  | 'race_pace'   // spécifique allure course (5k→ultra)
  | 'strength'    // renfo (renvoi vers le module Renfo)
  | 'race'        // jour de course

export type Intensity = 'easy' | 'moderate' | 'hard'
export type Terrain = 'flat' | 'rolling' | 'uphill' | 'downhill' | 'any'
export type Phase = 'base' | 'build' | 'specific' | 'taper' | 'race'

/** Niveau d'expérience du coureur (gating de sécurité). */
export type Level = 'beginner' | 'intermediate' | 'advanced'

/** Distance cible de l'objectif (priorité des systèmes). */
export type DistanceFocus = '5k' | '10k' | 'half' | 'marathon' | 'ultra'

/** Qualité développée / point faible adressé (levier d'adaptation le plus fort). */
export type WorkoutTarget =
  | 'aerobic_base'
  | 'threshold'
  | 'vo2max'
  | 'economy'
  | 'speed'
  | 'climbing'
  | 'descending'
  | 'durability'
  | 'race_specificity'
  | 'recovery'

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
  /** Niveaux d'expérience pour lesquels la séance est appropriée (gating). */
  levels: Level[]
  /** Distances cibles où la séance est prioritaire/pertinente. */
  distances: DistanceFocus[]
  /** Qualité développée / point faible adressé. */
  target: WorkoutTarget
  /** Séance spécifique trail — ignorée pour une course sur route. */
  trailOnly?: boolean
  description: string
}

const ALL_LEVELS: Level[] = ['beginner', 'intermediate', 'advanced']
const INT_ADV: Level[] = ['intermediate', 'advanced']
const ALL_DIST: DistanceFocus[] = ['5k', '10k', 'half', 'marathon', 'ultra']

export const WORKOUTS: readonly WorkoutTemplate[] = [
  // ── Endurance & récupération ──────────────────────────────────────────────
  {
    id: 'endurance_easy',
    name: 'Endurance fondamentale',
    system: 'endurance', intensity: 'easy', terrain: 'any',
    baseDurationMin: 60, climbing: false,
    phases: ['base', 'build', 'specific', 'taper'],
    levels: ALL_LEVELS, distances: ALL_DIST, target: 'aerobic_base',
    description: 'Footing en zone 2, respiration confortable. Développe la base aérobie et la capillarisation.',
  },
  {
    id: 'recovery_jog',
    name: 'Footing récupération',
    system: 'recovery', intensity: 'easy', terrain: 'flat',
    baseDurationMin: 35, climbing: false,
    phases: ['base', 'build', 'specific', 'taper', 'race'],
    levels: ALL_LEVELS, distances: ALL_DIST, target: 'recovery',
    description: 'Très facile, sur terrain roulant. Accélère la récupération sans ajouter de stress.',
  },
  {
    id: 'hike_recovery',
    name: 'Marche active / rando récup',
    system: 'recovery', intensity: 'easy', terrain: 'any',
    baseDurationMin: 50, climbing: false,
    phases: ['base', 'taper'],
    levels: ALL_LEVELS, distances: ['ultra'], target: 'recovery',
    description: '40-60 min de marche soutenue ou rando facile. Récup active sans impact, spécifique ultra (Koop).',
  },
  {
    id: 'long_run_flat',
    name: 'Sortie longue',
    system: 'long', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 120, climbing: false,
    phases: ['base', 'build', 'specific'],
    levels: INT_ADV, distances: ['half', 'marathon', 'ultra'], target: 'aerobic_base',
    description: 'Sortie longue en endurance (≤ 25-30 % du volume hebdo). Endurance, économie, résistance à la fatigue.',
  },
  {
    id: 'long_progressive',
    name: 'Sortie longue progressive',
    system: 'long', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 110, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['half', 'marathon', 'ultra'], target: 'durability',
    description: '90-120 min : départ facile → 20-30 dernières min à allure marathon. Finir vite sur fatigue (Pfitzinger/Canova).',
  },
  {
    id: 'long_fast_finish',
    name: 'Longue à finish rapide',
    system: 'long', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 120, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['marathon', 'ultra'], target: 'race_specificity',
    description: '100-130 min facile + 15-20 min au seuil. Courir vite sur jambes fatiguées (Canova/Magness).',
  },
  {
    id: 'long_fasted',
    name: 'Sortie longue à jeun',
    system: 'long', intensity: 'easy', terrain: 'rolling',
    baseDurationMin: 90, climbing: false,
    phases: ['base', 'build'],
    levels: INT_ADV, distances: ['marathon', 'ultra'], target: 'aerobic_base',
    description: '75-100 min faciles le matin, glucides bas. Oxydation lipidique, flexibilité métabolique (Canova/Koop).',
  },
  {
    id: 'long_run_dplus',
    name: 'Sortie longue D+',
    system: 'long', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 150, climbing: true, trailOnly: true,
    phases: ['base', 'build', 'specific'],
    levels: INT_ADV, distances: ['marathon', 'ultra'], target: 'climbing',
    description: 'Sortie longue avec dénivelé soutenu. Spécifique trail : muscle les montées et la durabilité.',
  },
  {
    id: 'long_trail_specific',
    name: 'Longue trail spécifique terrain',
    system: 'long', intensity: 'moderate', terrain: 'any',
    baseDurationMin: 210, climbing: true, trailOnly: true,
    phases: ['specific'],
    levels: INT_ADV, distances: ['ultra'], target: 'race_specificity',
    description: '3-5 h sur terrain représentatif (technique, D+/D-, nutrition). Spécificité globale course (Koop).',
  },

  // ── Seuil ─────────────────────────────────────────────────────────────────
  {
    id: 'tempo_run',
    name: 'Tempo / seuil aérobie',
    system: 'tempo', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 50, climbing: false,
    phases: ['base', 'build', 'specific'],
    levels: INT_ADV, distances: ['10k', 'half', 'marathon'], target: 'threshold',
    description: 'Bloc continu à allure tempo (≈ allure 1 h). Clairance du lactate, repousse le seuil.',
  },
  {
    id: 'tempo_long',
    name: 'Tempo long',
    system: 'threshold', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 60, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['half', 'marathon'], target: 'threshold',
    description: '30-40 min en continu au seuil. Endurance au seuil, résistance demi/marathon (Daniels/Pfitzinger).',
  },
  {
    id: 'progressive_run',
    name: 'Sortie progressive',
    system: 'tempo', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 60, climbing: false,
    phases: ['base', 'build'],
    levels: INT_ADV, distances: ['half', 'marathon', 'ultra'], target: 'durability',
    description: 'Allure croissante E → M → T, finir les derniers km soutenus. Travaille la gestion d\'allure.',
  },
  {
    id: 'threshold_intervals',
    name: 'Seuil (cruise intervals)',
    system: 'threshold', intensity: 'hard', terrain: 'rolling',
    baseDurationMin: 55, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['10k', 'half', 'marathon'], target: 'threshold',
    description: 'Ex : 4×8 min au seuil, récup 1-2 min. Plus de volume au seuil avec qualité (Daniels).',
  },
  {
    id: 'threshold_cruise_short',
    name: 'Cruise intervals courts',
    system: 'threshold', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 55, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['10k', 'half'], target: 'threshold',
    description: 'Ex : 6-8×5 min au seuil, récup 1 min. Volume seuil fractionné, fraîcheur préservée (Daniels).',
  },
  {
    id: 'over_under',
    name: 'Over-under (alternance seuil)',
    system: 'threshold', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 55, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['10k', 'half'], target: 'threshold',
    description: 'Ex : (2 min au-dessus / 2 min en-dessous du seuil) × blocs. Tolérance et recyclage du lactate (Magness/Canova).',
  },
  {
    id: 'fartlek_seuil',
    name: 'Fartlek au seuil',
    system: 'threshold', intensity: 'hard', terrain: 'rolling',
    baseDurationMin: 50, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['10k', 'half'], target: 'threshold',
    description: 'Ex : 5-6×(4 min seuil / 2 min facile) sur parcours libre. Seuil moins rigide, adaptable au terrain (Daniels).',
  },
  {
    id: 'threshold_hill',
    name: 'Seuil en côte longue',
    system: 'threshold', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 55, climbing: true,
    phases: ['specific'],
    levels: INT_ADV, distances: ['half', 'marathon', 'ultra'], target: 'climbing',
    description: 'Ex : 3-4×6-8 min à effort seuil en montée régulière. Seuil + puissance de montée (Uphill Athlete/Canova).',
  },
  {
    id: 'marathon_pace',
    name: 'Spécifique allure marathon',
    system: 'tempo', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 80, climbing: false,
    phases: ['specific'],
    levels: INT_ADV, distances: ['marathon'], target: 'race_specificity',
    description: 'Blocs à allure marathon (ex : 5×[½ mile seuil + ½ mile allure marathon]). Spécificité course route.',
  },

  // ── VO2max ────────────────────────────────────────────────────────────────
  {
    id: 'vo2_intervals',
    name: 'VO2max (intervalles courts)',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 50, climbing: false,
    phases: ['build', 'specific', 'taper'],
    levels: INT_ADV, distances: ['5k', '10k'], target: 'vo2max',
    description: 'Ex : 6×3 min à allure 3 km, récup 2 min. Développe la puissance aérobie maximale.',
  },
  {
    id: 'vo2_1000',
    name: '5×1000 m VO2max',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 55, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['5k', '10k'], target: 'vo2max',
    description: 'Ex : 5×1000 m à allure I, récup 2-3 min. Plafond aérobie (VO2max) (Daniels).',
  },
  {
    id: 'vo2_800',
    name: '6×800 m VO2max',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 50, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['5k', '10k'], target: 'vo2max',
    description: 'Ex : 6×800 m à allure I, récup 2 min. Puissance aérobie, allure 3-5 km (Daniels).',
  },
  {
    id: 'billat_30_30',
    name: '30/30 (Billat)',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 45, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['5k', '10k'], target: 'vo2max',
    description: 'Ex : 2×(10×30 s à VMA / 30 s footing). Accumule du temps proche de VO2max avec une fatigue gérée.',
  },
  {
    id: 'billat_15_15',
    name: '15/15 (Billat)',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 40, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['5k', '10k'], target: 'vo2max',
    description: 'Ex : 18-30×(15 s à VMA / 15 s footing). Maintien de VO2max en fractionné court (Billat).',
  },
  {
    id: 'vo2_long_reps',
    name: 'Intervalles longs VO2max',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 50, climbing: false,
    phases: ['build', 'specific'],
    levels: ['advanced'], distances: ['5k', '10k'], target: 'vo2max',
    description: 'Ex : 4-5×3 min (ou 1200 m) à allure I, récup 2-3 min. Maximise le temps > 90 % VO2max (Seiler/Daniels).',
  },
  {
    id: 'vo2_pyramide',
    name: 'Pyramide VO2max',
    system: 'vo2max', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 50, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['5k', '10k'], target: 'vo2max',
    description: 'Ex : 200-400-600-800-600-400-200 m à allure I, récup égale. VO2max + variété d\'allure/économie.',
  },
  {
    id: 'roche_1_1',
    name: 'VO2 court 1/1 (Roche)',
    system: 'vo2max', intensity: 'hard', terrain: 'any',
    baseDurationMin: 45, climbing: false,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['10k', 'half', 'ultra'], target: 'vo2max',
    description: '16×[1 min à VMA / 1 min footing flottant]. Puissance aérobie en format fluide, intégrable en trail (Roche).',
  },
  {
    id: 'vo2_hill',
    name: 'VO2max en côte',
    system: 'vo2max', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 50, climbing: true,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['10k', 'ultra'], target: 'climbing',
    description: 'Ex : 5-6×(2-3 min montée à effort I), récup descente. VO2max + force de montée, faible impact (Uphill Athlete).',
  },

  // ── Vitesse & économie ────────────────────────────────────────────────────
  {
    id: 'strides',
    name: 'Lignes droites (strides)',
    system: 'speed', intensity: 'moderate', terrain: 'flat',
    baseDurationMin: 25, climbing: false,
    phases: ['base', 'build', 'specific', 'taper'],
    levels: ALL_LEVELS, distances: ALL_DIST, target: 'economy',
    description: 'Ex : 6-8×20 s accélérations contrôlées, récup complète. Économie et recrutement neuromusculaire (hors quota 80/20).',
  },
  {
    id: 'drills',
    name: 'Gammes athlétiques / éducatifs',
    system: 'speed', intensity: 'moderate', terrain: 'flat',
    baseDurationMin: 25, climbing: false,
    phases: ['base', 'build'],
    levels: ALL_LEVELS, distances: ALL_DIST, target: 'economy',
    description: 'Montées de genoux, talons-fesses, foulées bondissantes. Technique de foulée, coordination, économie.',
  },
  {
    id: 'hill_repeats_short',
    name: 'Côtes courtes (hill sprints)',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 45, climbing: true,
    phases: ['base', 'build'],
    levels: INT_ADV, distances: ['half', 'marathon', 'ultra'], target: 'climbing',
    description: 'Ex : 8-10×8-45 s en côte raide, récup descente. Force-vitesse, puissance et économie sans impact.',
  },
  {
    id: 'reps_r_200',
    name: 'Répétitions R 200 m',
    system: 'speed', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 40, climbing: false,
    phases: ['base', 'build', 'specific'],
    levels: INT_ADV, distances: ['5k', '10k'], target: 'economy',
    description: 'Ex : 8-10×200 m à allure R, récup 200 m trot. Économie de course et vitesse de jambe (Daniels).',
  },
  {
    id: 'reps_r_400',
    name: 'Répétitions R 400 m',
    system: 'speed', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 45, climbing: false,
    phases: ['build', 'specific'],
    levels: ['advanced'], distances: ['5k', '10k'], target: 'speed',
    description: 'Ex : 6-8×400 m à allure R, récup complète. Vitesse et tolérance à l\'allure rapide (Daniels).',
  },
  {
    id: 'sprints_alactic',
    name: 'Sprints alactiques',
    system: 'speed', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 30, climbing: false,
    phases: ['base', 'build'],
    levels: ['advanced'], distances: ['5k', '10k'], target: 'speed',
    description: 'Ex : 6-8×60-80 m quasi-max, récup 2-3 min. Puissance et vitesse pure neuromusculaire (Magness).',
  },
  {
    id: 'fartlek',
    name: 'Fartlek structuré',
    system: 'speed', intensity: 'hard', terrain: 'rolling',
    baseDurationMin: 45, climbing: false,
    phases: ['base', 'build', 'specific'],
    levels: INT_ADV, distances: ['5k', '10k', 'half'], target: 'vo2max',
    description: 'Ex : 10×(1 min vite / 1 min facile) ou pyramide 1-2-3-2-1 min. Changements d\'allure, gestion de l\'effort.',
  },
  {
    id: 'fartlek_libre',
    name: 'Fartlek libre',
    system: 'speed', intensity: 'moderate', terrain: 'rolling',
    baseDurationMin: 40, climbing: false,
    phases: ['base', 'build'],
    levels: ALL_LEVELS, distances: ['5k', '10k', 'half'], target: 'vo2max',
    description: '30-40 min, accélérations libres selon le ressenti et le terrain. Variété d\'intensité, plaisir, adaptabilité.',
  },

  // ── Spécifique allure course ──────────────────────────────────────────────
  {
    id: 'race_5k',
    name: 'Allure 5 km',
    system: 'race_pace', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 50, climbing: false,
    phases: ['specific'],
    levels: INT_ADV, distances: ['5k'], target: 'race_specificity',
    description: 'Ex : 5-6×1000 m à allure 5 km, récup 90 s-2 min. Tenue de l\'allure objectif 5 km (Daniels).',
  },
  {
    id: 'race_10k',
    name: 'Allure 10 km',
    system: 'race_pace', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 55, climbing: false,
    phases: ['specific'],
    levels: INT_ADV, distances: ['10k'], target: 'race_specificity',
    description: 'Ex : 4-5×2000 m à allure 10 km, récup 2 min. Tenue de l\'allure objectif 10 km (Daniels).',
  },
  {
    id: 'race_half',
    name: 'Allure semi',
    system: 'race_pace', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 65, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['half'], target: 'race_specificity',
    description: 'Ex : 3-4×4-5 km à allure semi, récup 2-3 min. Allure objectif semi, endurance au seuil (Pfitzinger/Canova).',
  },
  {
    id: 'race_marathon',
    name: 'Allure marathon (blocs)',
    system: 'race_pace', intensity: 'moderate', terrain: 'flat',
    baseDurationMin: 90, climbing: false,
    phases: ['specific'],
    levels: INT_ADV, distances: ['marathon'], target: 'race_specificity',
    description: 'Ex : 2-3×6-10 km à allure marathon, récup 1-2 km facile. Automatiser l\'allure marathon (Pfitzinger/Daniels).',
  },
  {
    id: 'canova_special',
    name: 'Bloc spécial Canova',
    system: 'race_pace', intensity: 'hard', terrain: 'rolling',
    baseDurationMin: 180, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['marathon', 'ultra'], target: 'race_specificity',
    description: 'AM longue avec blocs à allure M / PM intervalles longs à M+ (glucides bas entre). Adaptation marathon profonde (Canova).',
  },
  {
    id: 'canova_extensive',
    name: 'Intervalles longs Canova',
    system: 'race_pace', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 90, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['marathon'], target: 'race_specificity',
    description: 'Ex : 3-4×6-7 km à 102-105 % allure M, récup 1 km à 96-98 % M. Rendre l\'allure marathon « facile » (Canova).',
  },
  {
    id: 'race_sim',
    name: 'Simulation de course',
    system: 'race_pace', intensity: 'hard', terrain: 'any',
    baseDurationMin: 90, climbing: false,
    phases: ['specific'],
    levels: INT_ADV, distances: ['10k', 'half', 'marathon', 'ultra'], target: 'race_specificity',
    description: '60-90 % de la distance cible à allure objectif, terrain similaire. Répétition générale (allure, ravito, mental) (Koop).',
  },
  {
    id: 'negative_split',
    name: 'Négative split',
    system: 'race_pace', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 60, climbing: false,
    phases: ['specific'],
    levels: INT_ADV, distances: ['half', 'marathon'], target: 'race_specificity',
    description: 'Effort continu, 2e moitié plus rapide que la 1re (M → T). Discipline de gestion, finir fort (Daniels/Magness).',
  },
  {
    id: 'race_blocks_long',
    name: 'Bloc allure dans la longue',
    system: 'race_pace', intensity: 'hard', terrain: 'rolling',
    baseDurationMin: 130, climbing: false,
    phases: ['specific'],
    levels: ['advanced'], distances: ['marathon', 'ultra'], target: 'durability',
    description: 'Longue facile avec 3-4×10 min à allure course insérés. Tenir l\'allure cible sous fatigue (Canova/Koop).',
  },
  {
    id: 'race_pace_dplus',
    name: 'Bloc spécifique allure course (D+)',
    system: 'race_pace', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 90, climbing: true, trailOnly: true,
    phases: ['specific'],
    levels: INT_ADV, distances: ['ultra'], target: 'race_specificity',
    description: 'Bloc à allure course sur profil proche de l\'objectif (montées + descentes). Spécificité maximale.',
  },

  // ── Trail — côtes / montée ────────────────────────────────────────────────
  {
    id: 'hill_repeats_long',
    name: 'Côtes longues',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 60, climbing: true, trailOnly: true,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['ultra'], target: 'climbing',
    description: 'Ex : 5×4 min en montée à allure seuil. Endurance de force en montée, spécifique trail (Uphill Athlete/Koop).',
  },
  {
    id: 'hill_30_30',
    name: '30/30 en côte',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 45, climbing: true,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['10k', 'ultra'], target: 'climbing',
    description: 'Ex : 12×(30 s intense en côte / 30 s descente facile). VO2max + force spécifique en montée (Billat adapté/Roche).',
  },
  {
    id: 'vert_push',
    name: 'Vert push (D+ continu)',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 75, climbing: true, trailOnly: true,
    phases: ['specific'],
    levels: INT_ADV, distances: ['ultra'], target: 'climbing',
    description: '600-1200 m D+ en montée continue à effort modéré-soutenu. Capacité d\'ascension prolongée (Uphill Athlete/Koop).',
  },
  {
    id: 'power_hike',
    name: 'Rando-course (power hiking)',
    system: 'hills', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 90, climbing: true, trailOnly: true,
    phases: ['base', 'build', 'specific'],
    levels: ALL_LEVELS, distances: ['ultra'], target: 'climbing',
    description: '60-120 min montées en marche rapide soutenue + course sur les replats. Efficacité spécifique ultra montagne (Koop).',
  },
  {
    id: 'vert_specific',
    name: 'Bloc D+ spécifique course',
    system: 'hills', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 150, climbing: true, trailOnly: true,
    phases: ['specific'],
    levels: ['advanced'], distances: ['ultra'], target: 'race_specificity',
    description: 'Simulation du profil cible : X m D+ sur durée représentative. Préparer le ratio D+/km de la course (Koop).',
  },

  // ── Trail — descente ──────────────────────────────────────────────────────
  {
    id: 'downhill_technique',
    name: 'Descente technique',
    system: 'descent', intensity: 'moderate', terrain: 'downhill',
    baseDurationMin: 50, climbing: false, trailOnly: true,
    phases: ['build', 'specific'],
    levels: INT_ADV, distances: ['marathon', 'ultra'], target: 'descending',
    description: 'Répétitions de descente technique. Durabilité musculaire (excentrique) et pilotage en descente.',
  },
  {
    id: 'descent_long',
    name: 'Descente longue (durabilité)',
    system: 'descent', intensity: 'hard', terrain: 'downhill',
    baseDurationMin: 40, climbing: false, trailOnly: true,
    phases: ['specific'],
    levels: ['advanced'], distances: ['ultra'], target: 'durability',
    description: '20-40 min de descente continue soutenue (fin de longue). Résistance à la casse musculaire, jambes de fin de course (Koop).',
  },

  // ── Force-endurance / renfo ───────────────────────────────────────────────
  {
    id: 'hill_heavy',
    name: 'Côtes lourdes / force-endurance',
    system: 'strength', intensity: 'hard', terrain: 'uphill',
    baseDurationMin: 50, climbing: true, trailOnly: true,
    phases: ['base', 'build'],
    levels: INT_ADV, distances: ['ultra'], target: 'climbing',
    description: 'Ex : 4-6×3-4 min montée raide en force (cadence basse, port. sac). Force-endurance des jambes (Uphill Athlete).',
  },
  {
    id: 'strength_link',
    name: 'Renforcement (module Renfo)',
    system: 'strength', intensity: 'moderate', terrain: 'any',
    baseDurationMin: 40, climbing: false,
    phases: ['base', 'build'],
    levels: ALL_LEVELS, distances: ALL_DIST, target: 'economy',
    description: 'Séance de renforcement co-périodisée avec la course. Force, prévention des blessures, économie. Voir le module Renfo.',
  },
  {
    id: 'plyometrics',
    name: 'Pliométrie / sauts',
    system: 'strength', intensity: 'hard', terrain: 'flat',
    baseDurationMin: 30, climbing: false,
    phases: ['base', 'build'],
    levels: ['advanced'], distances: ['5k', '10k', 'half'], target: 'economy',
    description: 'Ex : 4-6 exercices (bonds, sauts, multi-bonds), récup complète. Raideur tendineuse, économie, puissance (Magness).',
  },

  // ── Blocs choc / enchaînements (ultra) ────────────────────────────────────
  {
    id: 'block_choc_d1',
    name: 'Bloc choc — jour 1',
    system: 'long', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 240, climbing: true, trailOnly: true,
    phases: ['specific'],
    levels: ['advanced'], distances: ['ultra'], target: 'durability',
    description: 'Double sortie longue (1/2) : grosse sortie trail. À enchaîner avec le jour 2 sous 72 h. Surcharge spécifique ultra (B2B).',
  },
  {
    id: 'block_choc_d2',
    name: 'Bloc choc — jour 2',
    system: 'long', intensity: 'moderate', terrain: 'uphill',
    baseDurationMin: 150, climbing: true, trailOnly: true,
    phases: ['specific'],
    levels: ['advanced'], distances: ['ultra'], target: 'durability',
    description: 'Double sortie longue (2/2) : le lendemain, sur jambes fatiguées. Durabilité musculaire spécifique ultra.',
  },

  // ── Affûtage / jour J ─────────────────────────────────────────────────────
  {
    id: 'sharpener',
    name: 'Rappels de vitesse',
    system: 'vo2max', intensity: 'moderate', terrain: 'flat',
    baseDurationMin: 35, climbing: false,
    phases: ['taper', 'race'],
    levels: ALL_LEVELS, distances: ALL_DIST, target: 'speed',
    description: 'Ex : 6×100 m en accélération. Garde le système nerveux affûté pendant l\'affûtage.',
  },
  {
    id: 'shakeout',
    name: 'Déverrouillage (veille de course)',
    system: 'recovery', intensity: 'easy', terrain: 'flat',
    baseDurationMin: 25, climbing: false,
    phases: ['race'],
    levels: ALL_LEVELS, distances: ALL_DIST, target: 'recovery',
    description: 'Footing très court avec quelques lignes. Active les jambes sans fatiguer.',
  },
] as const

const WORKOUT_BY_ID = new Map(WORKOUTS.map((w) => [w.id, w]))

export function getWorkout(id: string): WorkoutTemplate | undefined {
  return WORKOUT_BY_ID.get(id)
}
