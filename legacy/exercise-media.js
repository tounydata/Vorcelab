// exercise-media.js
// Media mapping for Vorcelab renfo exercises
//
// Source: Supabase Storage bucket "exercise-media" — CC0 GIFs from Kaggle
// Upload path: exercise-media/{exoId}/demo.gif
// Run scripts/ingest-kaggle-media.py --upload to populate the bucket.
//
// License: CC0 Public Domain (Kaggle fitness-exercises-with-animations)

const _SUPA_STORAGE = 'https://wanzrkdgqmcctwvnbmuv.supabase.co/storage/v1/object/public/exercise-media';

// ── MAPPING ──────────────────────────────────────────────────────────────────
// kaggle.name — matched name in Kaggle dataset for ingestion script
// kaggle.confidence — matching confidence (high/medium/low)

export const EXERCISE_MEDIA = {

  // ── FORCE LOURDE ──────────────────────────────────────────────────────────
  squat_lourd: {
    label: 'Squat',
    kaggle: { name: 'Barbell Squat',                confidence: 'high' },
  },
  rdl: {
    label: 'Soulevé roumain',
    kaggle: { name: 'Romanian Deadlift',            confidence: 'high' },
  },
  bulgare: {
    label: 'Fentes bulgares',
    kaggle: { name: 'Bulgarian Split Squat',        confidence: 'high' },
  },
  mollets_lourds: {
    label: 'Élévations mollets lestées',
    kaggle: { name: 'Standing Calf Raise',          confidence: 'high' },
  },
  hip_thrust: {
    label: 'Hip thrust',
    kaggle: { name: 'Hip Thrust',                   confidence: 'high' },
  },
  lunge_marcheur: {
    label: 'Fente marcheur',
    kaggle: { name: 'Walking Lunge',                confidence: 'high' },
  },

  // ── PLIOMÉTRIE ────────────────────────────────────────────────────────────
  pogo_jumps: {
    label: 'Rebonds pogo',
    kaggle: { name: 'Pogo Jumps',                   confidence: 'medium' },
  },
  bondissements: {
    label: 'Bondissements',
    kaggle: { name: 'Broad Jump',                   confidence: 'high' },
  },
  drop_jumps: {
    label: 'Sauts en profondeur',
    kaggle: { name: 'Depth Jump',                   confidence: 'high' },
  },
  skips: {
    label: 'Skips',
    kaggle: { name: 'High Knees',                   confidence: 'medium' },
  },
  lateral_bound: {
    label: 'Bonds latéraux',
    kaggle: { name: 'Lateral Bound',                confidence: 'high' },
  },
  box_jump: {
    label: 'Saut sur box',
    kaggle: { name: 'Box Jump',                     confidence: 'high' },
  },

  // ── EXCENTRIQUE ───────────────────────────────────────────────────────────
  step_down: {
    label: 'Descente de marche excentrique',
    kaggle: { name: 'Step Down',                    confidence: 'medium' },
  },
  nordic: {
    label: 'Curl nordique',
    kaggle: { name: 'Nordic Curl',                  confidence: 'high' },
  },
  mollet_excentrique: {
    label: 'Mollets excentriques',
    kaggle: { name: 'Eccentric Calf Raise',         confidence: 'medium' },
  },
  single_leg_rdl: {
    label: 'Soulevé roumain unilatéral',
    kaggle: { name: 'Single Leg Romanian Deadlift', confidence: 'high' },
  },
  tibialis_raise: {
    label: 'Relevé tibial',
    kaggle: { name: 'Tibialis Raise',               confidence: 'medium' },
  },
  reverse_nordic: {
    label: 'Reverse nordic',
    kaggle: { name: 'Reverse Nordic Curl',          confidence: 'high' },
  },
  single_leg_glute_bridge: {
    label: 'Fessier unilatéral',
    kaggle: { name: 'Single Leg Glute Bridge',      confidence: 'high' },
  },
  wall_sit: {
    label: 'Chaise murale',
    kaggle: { name: 'Wall Sit',                     confidence: 'high' },
  },

  // ── TRONC ─────────────────────────────────────────────────────────────────
  pallof_press: {
    label: 'Pallof press',
    kaggle: { name: 'Pallof Press',                 confidence: 'high' },
  },
  side_plank_hipdrop: {
    label: 'Planche latérale dynamique',
    kaggle: { name: 'Side Plank Hip Drop',          confidence: 'medium' },
  },
  dead_bug: {
    label: 'Dead bug',
    kaggle: { name: 'Dead Bug',                     confidence: 'high' },
  },
  bird_dog: {
    label: 'Bird dog',
    kaggle: { name: 'Bird Dog',                     confidence: 'high' },
  },
  suitcase_carry: {
    label: 'Marche avec charge unilatérale',
    kaggle: { name: "Farmer's Walk",                confidence: 'high' },
  },
  copenhagen_plank: {
    label: 'Copenhagen plank',
    kaggle: { name: 'Copenhagen Plank',             confidence: 'high' },
  },
  core_rotation: {
    label: 'Rotation de tronc',
    kaggle: { name: 'Russian Twist',                confidence: 'high' },
  },

  // ── HAUT DU CORPS ─────────────────────────────────────────────────────────
  tractions_or_row: {
    label: 'Tractions / Tirage',
    kaggle: { name: 'Pull-Up',                      confidence: 'high' },
  },
  pompes: {
    label: 'Pompes',
    kaggle: { name: 'Push-Up',                      confidence: 'high' },
  },
  face_pull: {
    label: 'Face pull',
    kaggle: { name: 'Face Pull',                    confidence: 'high' },
  },
  ytw_prone: {
    label: 'Exercice YTW',
    kaggle: { name: 'YTW Raise',                    confidence: 'low' },
  },

  // ── MOBILITÉ ──────────────────────────────────────────────────────────────
  hip_9090: {
    label: 'Rotation hanche 90/90',
    kaggle: { name: '90/90 Hip Rotation',           confidence: 'medium' },
  },
  pigeon_actif: {
    label: 'Pigeon actif',
    kaggle: { name: 'Pigeon Pose',                  confidence: 'medium' },
  },
  knee_to_wall: {
    label: 'Mobilité cheville au mur',
    kaggle: { name: 'Knee to Wall',                 confidence: 'medium' },
  },
  open_book: {
    label: 'Rotation thoracique',
    kaggle: { name: 'Open Book',                    confidence: 'high' },
  },
  monster_walk: {
    label: 'Marche résistée latérale',
    kaggle: { name: 'Monster Walk',                 confidence: 'high' },
  },
  hip_abduction: {
    label: 'Abduction de hanche',
    kaggle: { name: 'Hip Abduction',                confidence: 'high' },
  },
  cossack_squat: {
    label: 'Squat cosaque',
    kaggle: { name: 'Cossack Squat',                confidence: 'medium' },
  },
};

// ── URL BUILDER ───────────────────────────────────────────────────────────────

export function getExerciseGifUrl(exoId) {
  return `${_SUPA_STORAGE}/${exoId}/demo.gif`;
}

// ── MEDIA INFO (for scripts/audit) ───────────────────────────────────────────

export function getMediaInfo(exoId) {
  const entry = EXERCISE_MEDIA[exoId];
  if (!entry) return null;
  return {
    exerciseId: exoId,
    label: entry.label,
    media: {
      source: 'supabase-storage',
      gifUrl: getExerciseGifUrl(exoId),
      license: 'CC0 Public Domain (Kaggle fitness-exercises-with-animations)',
      confidence: entry.kaggle?.confidence || 'low',
    },
  };
}
