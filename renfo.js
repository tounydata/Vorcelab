// ============================================================
// VORCELAB — MODULE RENFORCEMENT MUSCULAIRE
// ============================================================

import { VLState, sb } from './app-state.js';

function fmtRest(s){ const m=Math.floor(s/60),r=s%60; return m>0?(r>0?m+'min'+r+'s':m+'min'):s+'s'; }

const RENFO_FOCUS_COLORS = {
  force_lourde:'#E5562A', pliometrie:'#f39c12', excentrique:'#3498db',
  excentrique_pliometrie:'#e67e22', tronc:'#9b59b6', haut_corps:'#1abc9c', mobilite:'#2ecc71'
};
VLState.RENFO_FOCUS_COLORS = RENFO_FOCUS_COLORS;

const RENFO_EXERCISES = {

  // ── FORCE LOURDE ──────────────────────────────────────────

  squat_lourd: {
    id: 'squat_lourd',
    name_fr: 'Squat',
    name_tech: 'Back squat',
    category: 'force_lourde',
    primary_muscles: ['quadriceps', 'fessiers'],
    benefits: ['force_max', 'economie_course', 'resilience'],
    variants: [
      {
        id: 'squat_barbell',
        name: 'Squat à la barre',
        required_equipment: { barbell: true },
        priority: 1,
        load_type: 'external_kg',
        default_sets: 5, default_reps: 5, target_rpe: 8,
        rest_seconds: 180
      },
      {
        id: 'leg_press',
        name: 'Presse à cuisses',
        required_equipment: { leg_press: true },
        priority: 2,
        load_type: 'external_kg',
        default_sets: 5, default_reps: 6, target_rpe: 8,
        rest_seconds: 150
      },
      {
        id: 'goblet_squat',
        name: 'Goblet squat',
        required_equipment_any: [{ dumbbells_max_kg: 16 }, { kettlebell_max_kg: 16 }],
        priority: 3,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 8, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'squat_tempo',
        name: 'Squat tempo 4s descente',
        required_equipment: {},
        priority: 4,
        load_type: 'bodyweight_variant',
        load_variant_options: ['standard', 'pied surélevé 10cm', 'pied surélevé 20cm'],
        default_sets: 4, default_reps: 10, target_rpe: 8,
        rest_seconds: 60
      }
    ],
    position: 'Barre posée sur le haut des trapèzes (pas sur la nuque). Pieds écartés largeur d\'épaules, pointes légèrement tournées vers l\'extérieur (10-30°).',
    movement: 'Inspirer, verrouiller le tronc. Descendre en 2-3s comme pour s\'asseoir sur une chaise, en poussant les genoux dans l\'axe des pieds. Cuisses parallèles au sol minimum. Remonter en explosant, expirer en haut.',
    common_errors: 'Genoux qui rentrent vers l\'intérieur. Dos qui s\'arrondit en bas. Talons qui décollent. Tronc qui s\'effondre vers l\'avant.',
    youtube_search: 'squat barre technique débutant'
  },

  rdl: {
    id: 'rdl',
    name_fr: 'Soulevé roumain',
    name_tech: 'Romanian Deadlift (RDL)',
    category: 'force_lourde',
    primary_muscles: ['ischio-jambiers', 'fessiers', 'bas du dos'],
    benefits: ['force_max', 'resilience', 'descente_trail'],
    variants: [
      {
        id: 'rdl_barbell',
        name: 'RDL à la barre',
        required_equipment: { barbell: true },
        priority: 1,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 6, target_rpe: 8,
        rest_seconds: 150
      },
      {
        id: 'rdl_dumbbells',
        name: 'RDL aux haltères',
        required_equipment_any: [{ dumbbells_max_kg: 20 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 8, target_rpe: 8,
        rest_seconds: 120
      },
      {
        id: 'rdl_kettlebell',
        name: 'RDL au kettlebell',
        required_equipment_any: [{ kettlebell_max_kg: 20 }],
        priority: 3,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 8, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'rdl_bande',
        name: 'RDL à l\'élastique',
        required_equipment: { bands: true },
        priority: 4,
        load_type: 'band',
        load_variant_options: ['light', 'medium', 'heavy'],
        default_sets: 4, default_reps: 10, target_rpe: 8,
        rest_seconds: 60
      },
      {
        id: 'rdl_bw',
        name: 'Good morning poids de corps',
        required_equipment: {},
        priority: 5,
        load_type: 'bodyweight_variant',
        load_variant_options: ['standard', 'tempo 4s', 'unilatéral'],
        default_sets: 4, default_reps: 12, target_rpe: 8,
        rest_seconds: 60
      }
    ],
    position: 'Debout, pieds écartés hanches. Barre ou haltères tenus devant les cuisses, légère flexion des genoux verrouillée.',
    movement: 'Pencher le buste en avant en poussant les hanches vers l\'arrière, descendre jusqu\'à sentir l\'étirement des ischio-jambiers (≈ mi-tibias). Dos droit tout au long. Remonter en contractant les fessiers.',
    common_errors: 'Dos qui s\'arrondit. Genoux qui fléchissent trop (ça devient un deadlift). Barbell qui s\'éloigne du corps.',
    youtube_search: 'romanian deadlift technique ischio'
  },

  bulgare: {
    id: 'bulgare',
    name_fr: 'Fentes bulgares',
    name_tech: 'Bulgarian Split Squat',
    category: 'force_lourde',
    primary_muscles: ['quadriceps', 'fessiers', 'ischio-jambiers'],
    benefits: ['force_max', 'resilience', 'stabilite'],
    variants: [
      {
        id: 'bulgare_barbell',
        name: 'Bulgares à la barre',
        required_equipment: { barbell: true, bench: true },
        priority: 1,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 6, target_rpe: 8,
        rest_seconds: 150
      },
      {
        id: 'bulgare_dumbbells',
        name: 'Bulgares aux haltères',
        required_equipment_any: [{ dumbbells_max_kg: 16 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 8, target_rpe: 8,
        rest_seconds: 120
      },
      {
        id: 'bulgare_kettlebell',
        name: 'Bulgares au kettlebell',
        required_equipment_any: [{ kettlebell_max_kg: 16 }],
        priority: 3,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 8, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'bulgare_bw',
        name: 'Bulgares poids de corps',
        required_equipment: { step: true },
        priority: 4,
        load_type: 'bodyweight_variant',
        load_variant_options: ['step bas (20cm)', 'step moyen (40cm)', 'tempo 4s'],
        default_sets: 4, default_reps: 10, target_rpe: 8,
        rest_seconds: 60
      }
    ],
    position: 'Pied arrière posé sur un banc ou step, pied avant à environ 70cm devant. Corps droit.',
    movement: 'Descendre verticalement jusqu\'à ce que la cuisse avant soit parallèle au sol. Le genou avant suit l\'axe du pied. Remonter en poussant dans le talon avant.',
    common_errors: 'Pied avant trop près (genou dépasse les orteils excessivement). Tronc penché en avant. Genou avant qui rentre vers l\'intérieur.',
    youtube_search: 'bulgare split squat technique'
  },

  mollets_lourds: {
    id: 'mollets_lourds',
    name_fr: 'Élévations de mollets lestées',
    name_tech: 'Calf raise (loaded)',
    category: 'force_lourde',
    primary_muscles: ['gastrocnémien', 'soléaire'],
    benefits: ['force_max', 'resilience', 'economie_course'],
    variants: [
      {
        id: 'mollets_smith',
        name: 'Mollets à la Smith / barre',
        required_equipment: { barbell: true },
        priority: 1,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 10, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'mollets_dumbbells',
        name: 'Mollets haltère unilatéral',
        required_equipment_any: [{ dumbbells_max_kg: 20 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 12, target_rpe: 8,
        rest_seconds: 60
      },
      {
        id: 'mollets_step_bw',
        name: 'Mollets sur step poids de corps',
        required_equipment: { step: true },
        priority: 3,
        load_type: 'bodyweight_variant',
        load_variant_options: ['bilatéral', 'unilatéral', 'unilatéral tempo 3s'],
        default_sets: 4, default_reps: 15, target_rpe: 8,
        rest_seconds: 60
      },
      {
        id: 'mollets_sol',
        name: 'Mollets au sol',
        required_equipment: {},
        priority: 4,
        load_type: 'bodyweight_variant',
        load_variant_options: ['bilatéral', 'unilatéral', 'unilatéral lent'],
        default_sets: 4, default_reps: 20, target_rpe: 7,
        rest_seconds: 45
      }
    ],
    position: 'Debout, avant des pieds sur le rebord d\'une marche ou step. Talons dans le vide.',
    movement: 'Descendre les talons sous le niveau du step (étirement maximal). Monter le plus haut possible sur la pointe des pieds. 1s de contraction en haut.',
    common_errors: 'Amplitude réduite (ne pas descendre assez bas). Rebond en bas (utiliser l\'élan au lieu de la force). Genoux fléchis.',
    youtube_search: 'calf raise course à pied prévention'
  },

  // ── PLIOMÉTRIE ────────────────────────────────────────────

  pogo_jumps: {
    id: 'pogo_jumps',
    name_fr: 'Rebonds pogo',
    name_tech: 'Pogo jumps',
    category: 'pliometrie',
    primary_muscles: ['mollets', 'tendons d\'Achille'],
    benefits: ['economie_course', 'resilience'],
    variants: [
      {
        id: 'pogo_bilatéral',
        name: 'Pogo bilatéral',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['bas (5-10cm)', 'moyen (10-15cm)'],
        default_sets: 4, default_reps: 20, target_rpe: 7,
        rest_seconds: 90
      },
      {
        id: 'pogo_unilatéral',
        name: 'Pogo unilatéral',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['jambe droite', 'jambe gauche'],
        default_sets: 3, default_reps: 15, target_rpe: 8,
        rest_seconds: 90
      }
    ],
    position: 'Debout, pieds à largeur de hanches. Légère flexion des genoux, raideur maximale des chevilles.',
    movement: 'Rebonds rapides et continus sur la pointe des pieds. Contact au sol le plus court possible (< 200ms). Bras qui aident le rythme. Progression : augmenter la hauteur et la vitesse.',
    common_errors: 'Trop de flexion du genou (devient du saut classique). Contact au sol trop long. Regarder vers le bas (garde la tête droite).',
    youtube_search: 'pogo jumps tendon achille économie course'
  },

  bondissements: {
    id: 'bondissements',
    name_fr: 'Bondissements',
    name_tech: 'Bounding',
    category: 'pliometrie',
    primary_muscles: ['quadriceps', 'fessiers', 'mollets'],
    benefits: ['economie_course', 'force_max'],
    variants: [
      {
        id: 'bondissements_avant',
        name: 'Bondissements en avant',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['5 foulées', '10 foulées', '20 foulées'],
        default_sets: 4, default_reps: 8, target_rpe: 8,
        rest_seconds: 120
      },
      {
        id: 'bondissements_alternés',
        name: 'Bondissements alternés',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['sans charge', 'gilet lesté 5kg'],
        default_sets: 4, default_reps: 10, target_rpe: 8,
        rest_seconds: 120
      }
    ],
    position: 'Debout, position de départ légèrement fléchie, comme en foulée de course.',
    movement: 'Enchainer des foulées exagérées en cherchant à maximiser la longueur et la hauteur de chaque foulée. Phase d\'envol longue. Réception sur avant-pied, amortissement puis réimpulsion immédiate.',
    common_errors: 'Foulées trop courtes (perd l\'effet pliométrique). Réception sur le talon. Tronc trop penché en avant.',
    youtube_search: 'bounding trail pliometrie foulée'
  },

  drop_jumps: {
    id: 'drop_jumps',
    name_fr: 'Sauts en profondeur',
    name_tech: 'Drop jumps / Depth jumps',
    category: 'pliometrie',
    primary_muscles: ['quadriceps', 'fessiers', 'mollets'],
    benefits: ['economie_course', 'descente_trail'],
    variants: [
      {
        id: 'drop_jump_step',
        name: 'Drop jump depuis step',
        required_equipment: { step: true },
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['hauteur 20cm', 'hauteur 30cm', 'hauteur 40cm'],
        default_sets: 4, default_reps: 6, target_rpe: 8,
        rest_seconds: 120
      },
      {
        id: 'drop_jump_sol',
        name: 'Saut en contre-mouvement',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['CMJ standard', 'CMJ bras tendus'],
        default_sets: 4, default_reps: 8, target_rpe: 7,
        rest_seconds: 90
      }
    ],
    position: 'Debout sur le step, pieds à largeur d\'épaules, au bord.',
    movement: 'Descendre du step (ne pas sauter depuis le step). À l\'atterrissage, temps de contact minimal puis saut vertical maximal immédiat. L\'objectif est de raidir l\'atterrissage et re-décoller le plus vite possible.',
    common_errors: 'Trop de flexion des genoux à l\'atterrissage (perd l\'effet). Atterrissage sur les talons. Pause entre atterrissage et resaut.',
    youtube_search: 'drop jump depth jump technique trail'
  },

  skips: {
    id: 'skips',
    name_fr: 'Gammes de course',
    name_tech: 'A-skips / B-skips',
    category: 'pliometrie',
    primary_muscles: ['fléchisseurs de hanche', 'mollets'],
    benefits: ['economie_course', 'stabilite'],
    variants: [
      {
        id: 'a_skips',
        name: 'A-skips',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['sur place', 'en avançant'],
        default_sets: 3, default_reps: 20, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'b_skips',
        name: 'B-skips',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['sur place', 'en avançant'],
        default_sets: 3, default_reps: 20, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Debout, position de course. Bras à 90° prêts à alterner.',
    movement: 'A-skip : montée genou à hauteur de hanche, frappe active du pied sous la hanche, bras alternés. B-skip : idem mais jambe d\'appui tendue vers l\'avant après la montée de genou.',
    common_errors: 'Montée de genou sans frappe active du pied. Bras qui ne travaillent pas. Regarde vers le bas.',
    youtube_search: 'a-skip b-skip drills course technique'
  },

  // ── EXCENTRIQUE TRAIL ─────────────────────────────────────

  step_down: {
    id: 'step_down',
    name_fr: 'Descente de marche excentrique',
    name_tech: 'Eccentric step down',
    category: 'excentrique',
    primary_muscles: ['quadriceps', 'genou'],
    benefits: ['resilience', 'descente_trail', 'stabilite'],
    variants: [
      {
        id: 'step_down_step',
        name: 'Step down sur marche',
        required_equipment: { step: true },
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['20cm', '30cm', '40cm'],
        default_sets: 3, default_reps: 10, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'step_down_book',
        name: 'Step down sur livre épais',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['10cm', '15cm'],
        default_sets: 3, default_reps: 12, target_rpe: 8,
        rest_seconds: 60
      }
    ],
    position: 'Debout sur un step ou une marche, sur une seule jambe, au bord.',
    movement: 'Descendre lentement (4s) avec la jambe d\'appui jusqu\'à ce que le talon de la jambe libre effleure le sol. Genou dans l\'axe du pied. Remonter activement. La phase excentrique (descente) est le cœur de l\'exercice.',
    common_errors: 'Descente trop rapide (perdre le bénéfice excentrique). Genou qui part vers l\'intérieur. Tronc qui compense en penchant.',
    youtube_search: 'step down excentrique genou trail runner'
  },

  nordic: {
    id: 'nordic',
    name_fr: 'Curl nordique',
    name_tech: 'Nordic hamstring curl',
    category: 'excentrique',
    primary_muscles: ['ischio-jambiers'],
    benefits: ['resilience', 'descente_trail'],
    variants: [
      {
        id: 'nordic_ancre',
        name: 'Nordic curl avec point d\'ancrage',
        required_equipment: { anchor_point: true },
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['standard', 'assisté élastique'],
        default_sets: 3, default_reps: 5, target_rpe: 9,
        rest_seconds: 120
      },
      {
        id: 'nordic_sol',
        name: 'Nordic curl au sol (partner)',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['assisté mains', 'standard'],
        default_sets: 3, default_reps: 5, target_rpe: 9,
        rest_seconds: 120
      }
    ],
    position: 'À genoux, chevilles bloquées sous une barre fixe, un banc ou tenues par un partenaire. Corps droit des genoux à la tête.',
    movement: 'Descendre le corps vers le sol le plus lentement possible (objectif 5-8s) en contractant les ischio-jambiers au maximum. Se laisser tomber quand impossible de tenir, amortir avec les mains. Remonter avec les mains en aidant.',
    common_errors: 'Trop de flexion de hanche (fesses qui partent en arrière). Descente trop rapide. Ne pas contracte activement les ischio.',
    youtube_search: 'nordic curl ischio excentrique trail'
  },

  mollet_excentrique: {
    id: 'mollet_excentrique',
    name_fr: 'Mollets excentriques (protocole Alfredson)',
    name_tech: 'Eccentric calf raise',
    category: 'excentrique',
    primary_muscles: ['gastrocnémien', 'soléaire', 'tendon d\'Achille'],
    benefits: ['resilience', 'economie_course'],
    variants: [
      {
        id: 'mollet_exc_step',
        name: 'Mollet excentrique sur step',
        required_equipment: { step: true },
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['genou tendu (gastro)', 'genou fléchi 20° (soléaire)'],
        default_sets: 3, default_reps: 15, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'mollet_exc_lesté',
        name: 'Mollet excentrique lesté',
        required_equipment_any: [{ dumbbells_max_kg: 10 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 10, target_rpe: 9,
        rest_seconds: 90
      },
      {
        id: 'mollet_exc_sol',
        name: 'Mollet excentrique au sol',
        required_equipment: {},
        priority: 3,
        load_type: 'bodyweight_variant',
        load_variant_options: ['bilatéral 5s', 'unilatéral 5s'],
        default_sets: 3, default_reps: 15, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Avant des pieds sur le bord d\'un step, talon dans le vide.',
    movement: 'Monter sur la pointe des deux pieds (concentrique bilatéral pour ménager). Descendre sur UN seul pied très lentement (3-5s) jusqu\'en dessous du niveau du step. Répéter. Protocole Alfredson : genou tendu + genou fléchi.',
    common_errors: 'Descente trop rapide (perd le bénéfice excentrique). Ne pas aller assez bas (amplitude incomplète). Utiliser les deux jambes pour descendre.',
    youtube_search: 'protocole alfredson tendon achille mollet excentrique'
  },

  single_leg_rdl: {
    id: 'single_leg_rdl',
    name_fr: 'Soulevé roumain unilatéral',
    name_tech: 'Single-leg RDL',
    category: 'excentrique',
    primary_muscles: ['ischio-jambiers', 'fessiers', 'stabilisateurs cheville'],
    benefits: ['resilience', 'stabilite', 'descente_trail'],
    variants: [
      {
        id: 'slrdl_haltere',
        name: 'SL-RDL avec haltère',
        required_equipment_any: [{ dumbbells_max_kg: 12 }],
        priority: 1,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 8, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'slrdl_kettlebell',
        name: 'SL-RDL au kettlebell',
        required_equipment_any: [{ kettlebell_max_kg: 12 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 8, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'slrdl_bw',
        name: 'SL-RDL poids de corps',
        required_equipment: {},
        priority: 3,
        load_type: 'bodyweight_variant',
        load_variant_options: ['standard', 'tempo 4s'],
        default_sets: 3, default_reps: 10, target_rpe: 8,
        rest_seconds: 60
      }
    ],
    position: 'Debout sur une jambe, légère flexion du genou d\'appui. Haltère ou kettlebell dans la main opposée.',
    movement: 'Pencher le buste en avant en levant la jambe libre derrière (corps forme un T). Descendre jusqu\'à sentir l\'étirement ischio. Dos droit. Remonter en contractant le fessier d\'appui.',
    common_errors: 'Rotation du bassin (hanche qui s\'ouvre). Genou d\'appui verrouillé (doit rester légèrement fléchi). Perte d\'équilibre par manque de gainage.',
    youtube_search: 'single leg rdl équilibre trail ischio'
  },

  // ── TRONC ANTI-ROTATION ───────────────────────────────────

  pallof_press: {
    id: 'pallof_press',
    name_fr: 'Pallof press',
    name_tech: 'Pallof press (anti-rotation)',
    category: 'tronc',
    primary_muscles: ['obliques', 'transverse', 'fessiers'],
    benefits: ['stabilite', 'resilience', 'economie_course'],
    variants: [
      {
        id: 'pallof_cable',
        name: 'Pallof press à la poulie',
        required_equipment: { has_gym_access: true },
        priority: 1,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 12, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'pallof_bande',
        name: 'Pallof press élastique',
        required_equipment: { bands: true, anchor_point: true },
        priority: 2,
        load_type: 'band',
        load_variant_options: ['light', 'medium', 'heavy'],
        default_sets: 3, default_reps: 12, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Debout de côté par rapport au point d\'ancrage (poulie ou élastique). Pieds écartés largeur d\'épaules, genoux légèrement fléchis. Tenir la poignée à hauteur de sternum, les deux mains.',
    movement: 'Pousser les mains devant soi (extension des coudes) tout en résistant à la rotation. Tenir 1-2s bras tendus. Revenir lentement. Le but est de NE PAS bouger les hanches et les épaules.',
    common_errors: 'Rotation du bassin pour aider (invalide l\'exercice). Bras pas complètement tendus. S\'éloigner trop du point d\'ancrage.',
    youtube_search: 'pallof press anti rotation tronc'
  },

  side_plank_hipdrop: {
    id: 'side_plank_hipdrop',
    name_fr: 'Planche latérale dynamique',
    name_tech: 'Side plank with hip drop',
    category: 'tronc',
    primary_muscles: ['obliques', 'abducteurs', 'fessier moyen'],
    benefits: ['stabilite', 'resilience'],
    variants: [
      {
        id: 'side_plank_genou',
        name: 'Planche latérale sur genou',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['statique', 'avec hip drop'],
        default_sets: 3, default_reps: 10, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'side_plank_pied',
        name: 'Planche latérale sur pied',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['statique 30s', 'avec hip drop', 'pied supérieur levé'],
        default_sets: 3, default_reps: 12, target_rpe: 8,
        rest_seconds: 60
      }
    ],
    position: 'Sur le côté, appui sur l\'avant-bras et les pieds (ou genou pour régresser). Corps aligné de la tête aux pieds.',
    movement: 'Laisser la hanche descendre vers le sol lentement (3s), puis remonter au-dessus du niveau d\'alignement. Maintien de l\'alignement tête-hanches-pieds tout au long.',
    common_errors: 'Hanche qui tourne vers l\'avant. Bassin qui avance ou recule. Épaule qui se dégage.',
    youtube_search: 'side plank hip drop fessier moyen stabilité'
  },

  dead_bug: {
    id: 'dead_bug',
    name_fr: 'Dead bug',
    name_tech: 'Dead bug',
    category: 'tronc',
    primary_muscles: ['transverse', 'fléchisseurs hanche'],
    benefits: ['stabilite', 'posture'],
    variants: [
      {
        id: 'dead_bug_simple',
        name: 'Dead bug bras seul',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['bras alterné', 'jambe + bras'],
        default_sets: 3, default_reps: 10, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'dead_bug_lesté',
        name: 'Dead bug avec charge',
        required_equipment_any: [{ dumbbells_max_kg: 5 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 8, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Allongé sur le dos. Bras verticaux. Hanches et genoux à 90° (cuisses verticales, tibias horizontaux). Bas du dos plaqué au sol.',
    movement: 'Étendre simultanément le bras droit et la jambe gauche vers le sol sans toucher. Revenir. Alterner. Le bas du dos ne doit jamais décoller du sol.',
    common_errors: 'Bas du dos qui se cambre (bras ou jambe trop loin). Apnée (respirer normalement). Mouvements trop rapides.',
    youtube_search: 'dead bug gainage tronc lombaires'
  },

  bird_dog: {
    id: 'bird_dog',
    name_fr: 'Bird dog',
    name_tech: 'Bird dog',
    category: 'tronc',
    primary_muscles: ['érecteurs spinaux', 'fessiers', 'épaules'],
    benefits: ['stabilite', 'posture', 'resilience'],
    variants: [
      {
        id: 'bird_dog_standard',
        name: 'Bird dog standard',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['standard', 'avec pause 3s', 'avec élastique cheville'],
        default_sets: 3, default_reps: 10, target_rpe: 6,
        rest_seconds: 60
      }
    ],
    position: 'À quatre pattes. Mains sous les épaules, genoux sous les hanches. Dos plat, regard vers le sol.',
    movement: 'Étendre simultanément le bras droit et la jambe gauche jusqu\'à l\'horizontal. Tenir 2s. Revenir sans toucher le sol avec le genou et le coude. Alterner.',
    common_errors: 'Rotation des hanches (une hanche monte). Bas du dos qui s\'affaisse. Aller trop vite.',
    youtube_search: 'bird dog gainage lombaires dos'
  },

  suitcase_carry: {
    id: 'suitcase_carry',
    name_fr: 'Marche avec charge unilatérale',
    name_tech: 'Suitcase carry',
    category: 'tronc',
    primary_muscles: ['obliques', 'quadratus lumborum', 'trapèzes'],
    benefits: ['stabilite', 'resilience', 'posture'],
    variants: [
      {
        id: 'suitcase_kb',
        name: 'Suitcase carry kettlebell',
        required_equipment_any: [{ kettlebell_max_kg: 16 }],
        priority: 1,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 20, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'suitcase_db',
        name: 'Suitcase carry haltère',
        required_equipment_any: [{ dumbbells_max_kg: 16 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 20, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Debout, charge dans une seule main le long du corps. Épaule chargée légèrement plus basse.',
    movement: 'Marcher sur 20m en gardant les hanches et les épaules parfaitement horizontales. Résister à l\'inclinaison latérale. Changer de main.',
    common_errors: 'Pencher du côté chargé. Épaule opposée qui monte. Regarder la charge.',
    youtube_search: 'suitcase carry farmer walk gainage latéral'
  },

  // ── HAUT DU CORPS + POSTURE ───────────────────────────────

  tractions_or_row: {
    id: 'tractions_or_row',
    name_fr: 'Tractions / Tirage',
    name_tech: 'Pull-up / Bent-over row',
    category: 'haut_corps',
    primary_muscles: ['grand dorsal', 'biceps', 'rhomboïdes'],
    benefits: ['posture', 'resilience'],
    variants: [
      {
        id: 'tractions',
        name: 'Tractions',
        required_equipment: { pullup_bar: true },
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['pronation', 'supination', 'lestées'],
        default_sets: 4, default_reps: 6, target_rpe: 8,
        rest_seconds: 120
      },
      {
        id: 'tirage_halteres',
        name: 'Rowing haltères',
        required_equipment_any: [{ dumbbells_max_kg: 20 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 10, target_rpe: 8,
        rest_seconds: 90
      },
      {
        id: 'tirage_bande',
        name: 'Tirage élastique',
        required_equipment: { bands: true, anchor_point: true },
        priority: 3,
        load_type: 'band',
        load_variant_options: ['light', 'medium', 'heavy'],
        default_sets: 3, default_reps: 12, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'inverted_row',
        name: 'Tirage inversé (table)',
        required_equipment: {},
        priority: 4,
        load_type: 'bodyweight_variant',
        load_variant_options: ['jambes fléchies', 'jambes tendues', 'pieds surélevés'],
        default_sets: 3, default_reps: 12, target_rpe: 8,
        rest_seconds: 60
      }
    ],
    position: 'Suspendu à une barre (tractions) ou penché en avant à 45° (rowing). Corps gaîné.',
    movement: 'Tirer les coudes vers le bas et vers l\'arrière en contractant les omoplates. Poitrine vers la barre (traction) ou coudes au-delà du torse (rowing). Descente contrôlée 2s.',
    common_errors: 'Balancement du corps. Hausser les épaules. Chin trop en avant.',
    youtube_search: 'tractions dos technique débutant'
  },

  pompes: {
    id: 'pompes',
    name_fr: 'Pompes',
    name_tech: 'Push-up',
    category: 'haut_corps',
    primary_muscles: ['pectoraux', 'triceps', 'épaules antérieures'],
    benefits: ['posture', 'stabilite'],
    variants: [
      {
        id: 'pompes_standard',
        name: 'Pompes standard',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['standard', 'serré (triceps)', 'large (pecto)', 'décliné pieds surélevés'],
        default_sets: 4, default_reps: 12, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'pompes_lestées',
        name: 'Pompes lestées',
        required_equipment_any: [{ dumbbells_max_kg: 10 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 4, default_reps: 8, target_rpe: 8,
        rest_seconds: 90
      }
    ],
    position: 'Position gaîné, mains légèrement plus larges que les épaules. Corps en ligne droite des talons à la tête.',
    movement: 'Descendre en contrôlant (2s) jusqu\'à ce que la poitrine effleure le sol. Coudes à 45° du corps (pas à 90°). Pousser sans verrouiller les coudes en haut.',
    common_errors: 'Hanches qui montent ou descendent. Coudes à 90° (mauvais pour les épaules). Ne pas aller au fond.',
    youtube_search: 'pompes technique forme correcte'
  },

  face_pull: {
    id: 'face_pull',
    name_fr: 'Face pull',
    name_tech: 'Face pull',
    category: 'haut_corps',
    primary_muscles: ['deltoïdes postérieurs', 'rhomboïdes', 'coiffe des rotateurs'],
    benefits: ['posture', 'resilience'],
    variants: [
      {
        id: 'face_pull_cable',
        name: 'Face pull poulie haute',
        required_equipment: { has_gym_access: true },
        priority: 1,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 15, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'face_pull_bande',
        name: 'Face pull élastique',
        required_equipment: { bands: true, anchor_point: true },
        priority: 2,
        load_type: 'band',
        load_variant_options: ['light', 'medium'],
        default_sets: 3, default_reps: 15, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Face au point d\'ancrage (poulie ou élastique à hauteur des yeux). Bras tendus en avant.',
    movement: 'Tirer vers le visage en écartant les coudes vers l\'extérieur et le haut (coudes au-dessus des poignets). Finir avec les mains de chaque côté de la tête, paumes vers l\'avant. Contraction des omoplates en fin de mouvement.',
    common_errors: 'Coudes qui descendent (devient un tirage basse). Corps qui bascule en arrière. Pas de rotation externe de l\'épaule.',
    youtube_search: 'face pull épaule rotateur externe posture'
  },

  ytw_prone: {
    id: 'ytw_prone',
    name_fr: 'Exercice YTW (omoplate)',
    name_tech: 'YTW prone (scapular)',
    category: 'haut_corps',
    primary_muscles: ['trapèzes inférieurs', 'rhomboïdes', 'deltoïdes postérieurs'],
    benefits: ['posture', 'resilience'],
    variants: [
      {
        id: 'ytw_bw',
        name: 'YTW au sol',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['Y seul', 'T seul', 'W seul', 'enchaîné YTW'],
        default_sets: 3, default_reps: 10, target_rpe: 6,
        rest_seconds: 60
      },
      {
        id: 'ytw_lesté',
        name: 'YTW avec petits haltères',
        required_equipment_any: [{ dumbbells_max_kg: 5 }],
        priority: 2,
        load_type: 'external_kg',
        default_sets: 3, default_reps: 8, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Allongé sur le ventre, front contre le sol. Bras dans la position initiale (le long du corps).',
    movement: 'Y : bras à 135° du corps, pouces vers le plafond. T : bras à 90° (croix). W : coudes à 90°, tirage vers les oreilles. Lever depuis les omoplates, pas les bras.',
    common_errors: 'Lever la tête (reste au sol). Trap supérieur qui compense (épaules qui montent). Mouvements trop rapides.',
    youtube_search: 'YTW scapulaire posture dos coureur'
  },

  // ── MOBILITÉ ACTIVE ───────────────────────────────────────

  hip_9090: {
    id: 'hip_9090',
    name_fr: 'Rotation de hanche 90/90',
    name_tech: 'Hip 90/90 stretch',
    category: 'mobilite',
    primary_muscles: ['rotateurs de hanche', 'fléchisseurs de hanche'],
    benefits: ['stabilite', 'resilience'],
    variants: [
      {
        id: 'hip_9090_statique',
        name: 'Hip 90/90 statique',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['statique 60s', 'avec rotation active', 'avec inclinaison avant'],
        default_sets: 2, default_reps: 5, target_rpe: 6,
        rest_seconds: 30
      }
    ],
    position: 'Assis au sol. Jambe avant à 90° (genou et cheville au sol). Jambe arrière à 90° derrière toi (cuisse perpendiculaire au corps).',
    movement: 'S\'asseoir droit, chercher à poser les deux fesses au sol. Inclinaison vers l\'avant (jambe avant) pour augmenter l\'intensité. Rotation active d\'une hanche à l\'autre.',
    common_errors: 'Se pencher sur le côté pour simuler la position. Mauvaise position des 90° (angles pas respectés).',
    youtube_search: 'hip 90 90 mobilité hanche coureur'
  },

  pigeon_actif: {
    id: 'pigeon_actif',
    name_fr: 'Pigeon actif',
    name_tech: 'Active pigeon / Running pigeon',
    category: 'mobilite',
    primary_muscles: ['piriforme', 'fessiers', 'fléchisseurs de hanche'],
    benefits: ['resilience', 'stabilite'],
    variants: [
      {
        id: 'pigeon_sol',
        name: 'Pigeon au sol',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['statique', 'avec contraction fessier', 'avec rotation tronc'],
        default_sets: 2, default_reps: 8, target_rpe: 6,
        rest_seconds: 30
      }
    ],
    position: 'Au sol. Jambe avant pliée devant vous (cuisse à 90°, tibia à 45°). Jambe arrière tendue derrière. Mains de chaque côté de la jambe avant.',
    movement: 'Contracte le fessier de la jambe avant (activation active). Chercher à redresser le buste sur la jambe avant. Alterner contraction/relâchement toutes les 5s.',
    common_errors: 'Position passive sans activation musculaire. Tibia avant trop vertical (contrainte genou augmentée). Ne pas s\'écraser vers l\'avant.',
    youtube_search: 'pigeon actif mobilité hanche trail'
  },

  knee_to_wall: {
    id: 'knee_to_wall',
    name_fr: 'Mobilité cheville au mur',
    name_tech: 'Knee to wall',
    category: 'mobilite',
    primary_muscles: ['cheville', 'mollet', 'tendon Achille'],
    benefits: ['resilience', 'economie_course'],
    variants: [
      {
        id: 'ktw_mur',
        name: 'Knee to wall au mur',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['distance 5cm', 'distance 8cm', 'distance 12cm'],
        default_sets: 2, default_reps: 15, target_rpe: 5,
        rest_seconds: 30
      }
    ],
    position: 'Debout face à un mur. Pied en fente avant, orteils à Xcm du mur.',
    movement: 'Plier le genou avant en cherchant à toucher le mur avec le genou, sans lever le talon. Mesurer la distance maximale à laquelle le genou touche encore le mur. Objectif : ≥ 10cm.',
    common_errors: 'Lever le talon (invalide le test). Pied tourné vers l\'extérieur. Aller trop vite sans sentir l\'étirement.',
    youtube_search: 'knee to wall mobilité cheville dorsifléxion'
  },

  open_book: {
    id: 'open_book',
    name_fr: 'Rotation thoracique',
    name_tech: 'Open book',
    category: 'mobilite',
    primary_muscles: ['thoracique', 'pectoraux', 'épaules'],
    benefits: ['posture', 'resilience'],
    variants: [
      {
        id: 'open_book_sol',
        name: 'Open book au sol',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['genoux fléchis', 'jambe droite tendue en avant'],
        default_sets: 2, default_reps: 10, target_rpe: 5,
        rest_seconds: 30
      }
    ],
    position: 'Allongé sur le côté. Genoux fléchis à 90°, empilés. Bras tendus devant, paumes ensemble.',
    movement: 'Ouvrir le bras supérieur vers l\'arrière en cherchant à poser l\'épaule et le bras au sol (rotation thoracique). Regard suit la main. Les genoux restent empilés (les hanches ne bougent pas). Tenir 2s. Revenir.',
    common_errors: 'Hanches qui bougent (compenser par le bas). Aller trop vite. Manque d\'amplitude (s\'arrêter avant l\'étirement maximum).',
    youtube_search: 'open book rotation thoracique coureur dos'
  },

  monster_walk: {
    id: 'monster_walk',
    name_fr: 'Marche résistée latérale',
    name_tech: 'Monster walk',
    category: 'mobilite',
    primary_muscles: ['fessier moyen', 'abducteurs', 'stabilisateurs genou'],
    benefits: ['resilience', 'stabilite'],
    variants: [
      {
        id: 'monster_bande',
        name: 'Monster walk élastique',
        required_equipment: { bands: true },
        priority: 1,
        load_type: 'band',
        load_variant_options: ['light', 'medium', 'heavy'],
        default_sets: 3, default_reps: 20, target_rpe: 7,
        rest_seconds: 60
      },
      {
        id: 'monster_bw',
        name: 'Monster walk poids de corps',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['latéral', 'diagonal', 'en cercle'],
        default_sets: 3, default_reps: 20, target_rpe: 6,
        rest_seconds: 45
      }
    ],
    position: 'Debout, élastique autour des genoux ou chevilles. Semi-squat (légère flexion). Pieds écartés largeur épaules.',
    movement: 'Marcher latéralement en maintenant la tension dans l\'élastique. Ne jamais ramener les pieds à moins de largeur d\'épaules. 10 pas dans un sens, 10 dans l\'autre.',
    common_errors: 'Laisser les pieds se rapprocher complètement (perd la tension). Se tenir debout (perdre la semi-flexion). Tronc qui bascule d\'un côté.',
    youtube_search: 'monster walk fessier moyen prévention genou'
  },

  hip_thrust: {
    id: 'hip_thrust',
    name_fr: 'Hip thrust',
    name_tech: 'Pont de hanche chargé',
    category: 'force_lourde',
    primary_muscles: ['grand fessier', 'ischio-jambiers'],
    benefits: ['force_max', 'economie_course', 'resilience'],
    variants: [
      { id: 'hip_thrust_barbell', name: 'Hip thrust barre', required_equipment: { barbell: true, bench: true }, priority: 1, load_type: 'external_kg', default_sets: 4, default_reps: 8, target_rpe: 8, rest_seconds: 120 },
      { id: 'hip_thrust_haltere', name: 'Hip thrust haltère', required_equipment_any: [{ dumbbells_max_kg: 20 }], priority: 2, load_type: 'external_kg', default_sets: 4, default_reps: 10, target_rpe: 8, rest_seconds: 90 },
      { id: 'hip_thrust_bw', name: 'Hip thrust poids de corps', required_equipment: {}, priority: 3, load_type: 'bodyweight_variant', load_variant_options: ['au sol', 'épaules sur banc', 'unilatéral'], default_sets: 3, default_reps: 15, target_rpe: 7, rest_seconds: 60 }
    ],
    position: 'Épaules appuyées sur un banc ou au sol. Pieds à plat, écartés largeur hanches, proches des fesses. Barre posée sur les hanches (au-dessus des os du bassin).',
    movement: 'Pousser les talons dans le sol, soulever les hanches en contractant les fessiers. Finir en ligne droite épaules-hanches-genoux. Tenir 1s en haut. Descendre lentement en 2s.',
    common_errors: 'Creuser le bas du dos en hyperextension. Genoux qui tombent vers l\'intérieur. Pousser avec les orteils plutôt que les talons.',
    youtube_search: 'hip thrust fessier course à pied force'
  },

  lunge_marcheur: {
    id: 'lunge_marcheur',
    name_fr: 'Fente marcheur',
    name_tech: 'Walking Lunge',
    category: 'force_lourde',
    primary_muscles: ['quadriceps', 'grand fessier', 'ischio-jambiers'],
    benefits: ['force_max', 'stabilite', 'trail_technique'],
    variants: [
      { id: 'lunge_halteres', name: 'Fente marcheur haltères', required_equipment_any: [{ dumbbells_max_kg: 12 }], priority: 1, load_type: 'external_kg', default_sets: 3, default_reps: 12, target_rpe: 8, rest_seconds: 90 },
      { id: 'lunge_bw', name: 'Fente marcheur poids de corps', required_equipment: {}, priority: 2, load_type: 'bodyweight_variant', load_variant_options: ['standard', 'avec rotation de buste', 'fente arrière'], default_sets: 3, default_reps: 16, target_rpe: 7, rest_seconds: 60 }
    ],
    position: 'Debout, mains sur les hanches ou haltères dans chaque main. Dos droit, regard devant.',
    movement: 'Grand pas en avant. Descendre le genou arrière à 5 cm du sol. Genou avant dans l\'axe du pied, ne dépasse pas les orteils. Pousser sur le pied avant pour avancer. Alterner les côtés.',
    common_errors: 'Genou avant qui dépasse les orteils. Tronc qui s\'incline en avant. Pas assez d\'amplitude.',
    youtube_search: 'fente marcheur haltères trail musculation coureur'
  },

  tibialis_raise: {
    id: 'tibialis_raise',
    name_fr: 'Relevé tibial',
    name_tech: 'Tibialis Raise',
    category: 'excentrique',
    primary_muscles: ['tibial antérieur'],
    benefits: ['resilience', 'prevention_blessure'],
    variants: [
      { id: 'tibialis_bw', name: 'Tibialis raise dos au mur', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['dos au mur', 'bord de marche', 'avec charge sur pied'], default_sets: 3, default_reps: 25, target_rpe: 7, rest_seconds: 45 },
      { id: 'tibialis_bande', name: 'Tibialis raise élastique', required_equipment: { bands: true }, priority: 2, load_type: 'band', load_variant_options: ['light', 'medium'], default_sets: 3, default_reps: 20, target_rpe: 7, rest_seconds: 45 }
    ],
    position: 'Dos appuyé contre un mur, pieds à 30 cm du mur. Jambes tendues, talons au sol.',
    movement: 'Relever les pointes de pied vers le tibia le plus haut possible. Tenir 1s. Redescendre lentement en 3s. Sentir le muscle devant le tibia travailler. Ne pas compenser avec les mollets.',
    common_errors: 'Mouvement trop rapide (phase excentrique essentielle). Genoux fléchis. Amplitude trop petite.',
    youtube_search: 'tibialis raise prévention fracture de stress running shin splints'
  },

  reverse_nordic: {
    id: 'reverse_nordic',
    name_fr: 'Reverse nordic',
    name_tech: 'Reverse Nordic Curl',
    category: 'excentrique',
    primary_muscles: ['quadriceps', 'tendon rotulien'],
    benefits: ['resilience', 'prevention_blessure', 'descente_trail'],
    variants: [
      { id: 'reverse_nordic_bw', name: 'Reverse nordic poids de corps', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['amplitude partielle', 'amplitude complète', 'avec élastique assisté'], default_sets: 3, default_reps: 8, target_rpe: 8, rest_seconds: 90 }
    ],
    position: 'À genoux sur tapis. Corps droit de genoux à tête. Pieds fixés sous un objet lourd ou par un partenaire.',
    movement: 'Maintenir le gainage du corps. S\'incliner vers l\'arrière lentement en 3-4s (quadriceps excentriques). Arrêter juste avant de toucher le sol. Pousser avec les talons pour remonter.',
    common_errors: 'Plier les hanches (doit rester droit). Aller trop vite. Ne pas aller assez loin par peur.',
    youtube_search: 'reverse nordic curl prévention tendinopathie rotule coureur'
  },

  lateral_bound: {
    id: 'lateral_bound',
    name_fr: 'Bonds latéraux',
    name_tech: 'Lateral Bounds / Skater Jumps',
    category: 'pliometrie',
    primary_muscles: ['grand fessier', 'abducteurs', 'quadriceps'],
    benefits: ['stabilite', 'pliometrie', 'trail_technique'],
    variants: [
      { id: 'lateral_bound_bw', name: 'Bonds latéraux poids de corps', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['amplitude réduite', 'amplitude maximale', 'avec pause équilibre 2s'], default_sets: 3, default_reps: 8, target_rpe: 7, rest_seconds: 90 }
    ],
    position: 'Debout sur une jambe, légère flexion de genou. Bras libres pour l\'équilibre.',
    movement: 'Sauter latéralement vers la jambe opposée. Atterrir sur une seule jambe en amortissant sur 2-3s (genou fléchi). Stabiliser. Rebondir de l\'autre côté. 4 bonds de chaque côté = 1 série.',
    common_errors: 'Atterrissage raide sans amortissement. Genou qui s\'effondre en valgus à l\'atterrissage. Amplitude trop faible.',
    youtube_search: 'lateral bounds skater jumps trail running stability'
  },

  box_jump: {
    id: 'box_jump',
    name_fr: 'Saut sur box',
    name_tech: 'Box Jump',
    category: 'pliometrie',
    primary_muscles: ['quadriceps', 'grand fessier', 'mollets'],
    benefits: ['pliometrie', 'force_max', 'economie_course'],
    variants: [
      { id: 'box_jump_step', name: 'Box jump sur marche/caisse', required_equipment: { step: true }, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['~20 cm', '~40 cm', '~60 cm'], default_sets: 4, default_reps: 5, target_rpe: 7, rest_seconds: 120 },
      { id: 'box_jump_bw', name: 'Saut vertical sur place', required_equipment: {}, priority: 2, load_type: 'bodyweight_variant', load_variant_options: ['standard', 'triple flexion maximale'], default_sets: 4, default_reps: 6, target_rpe: 7, rest_seconds: 90 }
    ],
    position: 'Debout devant la box, pieds écartés largeur hanches. Semi-flexion de préparation.',
    movement: 'Contre-mouvement rapide (bras en arrière). Sauter sur la box, atterrir pieds à plat en semi-squat. Descendre de la box (ne pas sauter en arrière). Récupération complète entre répétitions.',
    common_errors: 'Atterrir sur les orteils. Genoux en valgus à l\'atterrissage. Enchaîner trop vite.',
    youtube_search: 'box jump explosivité running puissance'
  },

  copenhagen_plank: {
    id: 'copenhagen_plank',
    name_fr: 'Copenhagen plank',
    name_tech: 'Copenhagen Hip Adduction',
    category: 'tronc',
    primary_muscles: ['adducteurs', 'fessier moyen', 'obliques'],
    benefits: ['stabilite', 'resilience', 'prevention_blessure'],
    variants: [
      { id: 'copenhagen_genou', name: 'Copenhagen plank appui genou', required_equipment: { bench: true }, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['statique 20s', 'statique 30s', 'avec balancement'], default_sets: 3, default_reps: 3, target_rpe: 7, rest_seconds: 60 },
      { id: 'copenhagen_pied', name: 'Copenhagen plank appui pied', required_equipment: { bench: true }, priority: 2, load_type: 'bodyweight_variant', load_variant_options: ['statique 15s', 'statique 25s'], default_sets: 3, default_reps: 3, target_rpe: 8, rest_seconds: 60 },
      { id: 'copenhagen_sol', name: 'Adduction latérale au sol', required_equipment: {}, priority: 3, load_type: 'bodyweight_variant', load_variant_options: ['jambe du bas levée', 'écartement debout'], default_sets: 3, default_reps: 15, target_rpe: 6, rest_seconds: 45 }
    ],
    position: 'En planche latérale. Jambe supérieure posée sur un banc (genou pour variante facile, pied pour variante difficile). Jambe inférieure libre.',
    movement: 'Tenir la planche latérale. Lever la jambe inférieure pour rejoindre la jambe supérieure. Tenir. Redescendre lentement. Bassin droit, pas de rotation.',
    common_errors: 'Bassin qui tombe. Rotation du tronc. Jambe inférieure trop basse.',
    youtube_search: 'copenhagen plank adducteurs prévention pubalgie running'
  },

  single_leg_glute_bridge: {
    id: 'single_leg_glute_bridge',
    name_fr: 'Pont fessier 1 jambe',
    name_tech: 'Single Leg Glute Bridge',
    category: 'excentrique',
    primary_muscles: ['grand fessier', 'ischio-jambiers', 'stabilisateurs lombaires'],
    benefits: ['resilience', 'stabilite', 'prevention_blessure'],
    variants: [
      { id: 'slgb_bw', name: 'Pont fessier unilatéral', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['standard', 'jambe opposée tendue', 'pied surélevé'], default_sets: 3, default_reps: 12, target_rpe: 7, rest_seconds: 45 },
      { id: 'slgb_charge', name: 'Pont fessier unilatéral lesté', required_equipment_any: [{ dumbbells_max_kg: 16 }], priority: 2, load_type: 'external_kg', default_sets: 3, default_reps: 10, target_rpe: 8, rest_seconds: 60 }
    ],
    position: 'Allongé sur le dos, bras à plat. Une jambe pliée (pied à plat), l\'autre jambe tendue horizontalement.',
    movement: 'Pousser sur le talon de la jambe pliée. Soulever les hanches jusqu\'à alignement épaules-hanche-genou. Tenir 2s en contractant le fessier. Descendre en 2s. Jambe tendue reste parallèle à la jambe de travail.',
    common_errors: 'Bassin qui s\'incline d\'un côté. Jambe tendue qui aide. Descente trop rapide.',
    youtube_search: 'single leg glute bridge fessier running unilatéral'
  },

  hip_abduction: {
    id: 'hip_abduction',
    name_fr: 'Abduction de hanche',
    name_tech: 'Hip Abduction / Coquillage',
    category: 'mobilite',
    primary_muscles: ['fessier moyen', 'petit fessier', 'rotateurs externes'],
    benefits: ['stabilite', 'resilience', 'prevention_blessure'],
    variants: [
      { id: 'hip_abd_bande', name: 'Abduction debout élastique', required_equipment: { bands: true }, priority: 1, load_type: 'band', load_variant_options: ['light', 'medium', 'heavy'], default_sets: 3, default_reps: 15, target_rpe: 6, rest_seconds: 45 },
      { id: 'hip_abd_clam', name: 'Coquillage au sol', required_equipment: {}, priority: 2, load_type: 'bodyweight_variant', load_variant_options: ['genou plié 45°', 'genou plié 90°', 'jambe tendue'], default_sets: 3, default_reps: 20, target_rpe: 6, rest_seconds: 30 }
    ],
    position: 'Couché sur le côté, genoux pliés à 45°, hanches empilées. (Variante debout: élastique autour des chevilles, main sur un mur.)',
    movement: 'Ouvrir le genou supérieur vers le plafond comme un coquillage, sans rouler les hanches en arrière. Tenir 1s. Redescendre lentement. Sentir le fessier moyen travailler, pas la colonne.',
    common_errors: 'Rouler les hanches en arrière pour compenser. Amplitude trop limitée. Pas de contraction consciente au sommet.',
    youtube_search: 'coquillage fessier moyen running prévention valgus genou'
  },

  core_rotation: {
    id: 'core_rotation',
    name_fr: 'Rotation de tronc',
    name_tech: 'Rotational Chop / Anti-rotation',
    category: 'tronc',
    primary_muscles: ['obliques', 'transverse', 'grand dorsal'],
    benefits: ['stabilite', 'economie_course', 'trail_technique'],
    variants: [
      { id: 'chop_bande', name: 'Rotation avec élastique', required_equipment: { bands: true, anchor_point: true }, priority: 1, load_type: 'band', load_variant_options: ['light', 'medium', 'heavy'], default_sets: 3, default_reps: 12, target_rpe: 7, rest_seconds: 60 },
      { id: 'chop_bw', name: 'Rotation poids de corps', required_equipment: {}, priority: 2, load_type: 'bodyweight_variant', load_variant_options: ['mains jointes', 'bras tendu devant'], default_sets: 3, default_reps: 15, target_rpe: 6, rest_seconds: 45 }
    ],
    position: 'Debout, pieds écartés largeur épaules. Élastique ancré à hauteur épaule sur le côté. Bras légèrement fléchis.',
    movement: 'Tirer l\'élastique en diagonale (épaule haute → hanche opposée) en faisant pivoter le buste. Hanches restent face devant. Contrôler le retour en 2s. 12 répétitions d\'un côté puis de l\'autre.',
    common_errors: 'Faire pivoter les hanches (le travail vient des obliques). Aller trop vite. Bras verrouillés.',
    youtube_search: 'rotation tronc élastique obliques running gainage'
  },

  cossack_squat: {
    id: 'cossack_squat',
    name_fr: 'Squat cosaque',
    name_tech: 'Cossack Squat',
    category: 'mobilite',
    primary_muscles: ['adducteurs', 'quadriceps', 'fléchisseurs de hanche'],
    benefits: ['stabilite', 'mobilite_hanche', 'trail_technique'],
    variants: [
      { id: 'cossack_bw', name: 'Squat cosaque poids de corps', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['amplitude partielle', 'amplitude complète', 'avec contre-poids'], default_sets: 3, default_reps: 8, target_rpe: 7, rest_seconds: 60 }
    ],
    position: 'Pieds très écartés (2× largeur épaules). Orteils légèrement en dehors. Mains jointes devant soi ou contre-poids pour l\'équilibre.',
    movement: 'Descendre sur une jambe (flexion profonde) en gardant l\'autre jambe tendue au sol. Pied de la jambe tendue à plat. Pousser sur le talon pour remonter. Alterner les côtés.',
    common_errors: 'Jambe tendue dont le pied décolle. Dos arrondi en bas. Genou de travail en valgus.',
    youtube_search: 'cossack squat mobilité hanche trail running adducteurs'
  },

  wall_sit: {
    id: 'wall_sit',
    name_fr: 'Chaise contre le mur',
    name_tech: 'Wall Sit isométrique',
    category: 'excentrique',
    primary_muscles: ['quadriceps', 'fessiers', 'ischio-jambiers'],
    benefits: ['resilience', 'descente_trail', 'prevention_blessure'],
    variants: [
      { id: 'wall_sit_bw', name: 'Chaise poids de corps', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['30s', '45s', '60s', 'unilatéral 20s'], default_sets: 3, default_reps: 1, target_rpe: 8, rest_seconds: 90 }
    ],
    position: 'Dos à plat contre le mur. Pieds à 60 cm du mur, largeur hanches. Descendre jusqu\'à 90° de flexion de genou.',
    movement: 'Tenir la position statique. Quadriceps parallèles au sol. Ne pas se tenir avec les mains. Respirer. Progresser en durée puis passer en unilatéral.',
    common_errors: 'Angle du genou trop ouvert (plus de 90°, moins de travail). S\'appuyer avec les mains. Laisser le dos se décoller du mur.',
    youtube_search: 'wall sit isométrique quadriceps descente trail running'
  }

};

// ── HELPERS ────────────────────────────────────────────────────────────────

function epley1RM(load_kg, reps) {
  if (!load_kg || reps <= 0) return null;
  if (reps === 1) return load_kg;
  return Math.round(load_kg * (1 + reps / 30) * 10) / 10;
}

function getBestVariant(exercise, profile) {
  const eq = profile.equipment || {};
  const variants = [...exercise.variants].sort((a, b) => a.priority - b.priority);
  for (const v of variants) {
    if (v.required_equipment) {
      if (v.required_equipment.has_gym_access && !profile.has_gym_access) continue;
      if (v.required_equipment.barbell && !eq.barbell) continue;
      if (v.required_equipment.leg_press && !eq.leg_press) continue;
      if (v.required_equipment.bench && !eq.bench) continue;
      if (v.required_equipment.pullup_bar && !eq.pullup_bar) continue;
      if (v.required_equipment.step && !eq.step) continue;
      if (v.required_equipment.anchor_point && !eq.anchor_point) continue;
      if (v.required_equipment.bands && (!eq.bands || eq.bands.length === 0)) continue;
    }
    if (v.required_equipment_any) {
      const ok = v.required_equipment_any.some(req => {
        if (req.dumbbells_max_kg) return (eq.dumbbells_max_kg || 0) >= req.dumbbells_max_kg;
        if (req.kettlebell_max_kg) return (eq.kettlebell_max_kg || 0) >= req.kettlebell_max_kg;
        return false;
      });
      if (!ok) continue;
    }
    return v;
  }
  return variants[variants.length - 1];
}

// ── GÉNÉRATEUR DE PROGRAMME ────────────────────────────────────────────────

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function generateRenfoProgram(profile) {
  const spw = Math.min(6, Math.max(1, profile.sessions_per_week));
  const ow = profile.objective_weight || 50;

  const focuses = allocateFocuses(spw, ow);
  const sessionDays = pickDays(spw);

  const week_schedule = {};
  DAYS.forEach(day => {
    const idx = sessionDays.indexOf(day);
    if (idx === -1) {
      week_schedule[day] = { rest: true, focus: null, exercises: [] };
    } else {
      const focus = focuses[idx];
      week_schedule[day] = buildSession(focus, profile);
    }
  });

  return week_schedule;
}

function allocateFocuses(spw, ow) {
  if (spw === 1) return ['force_lourde'];
  if (spw === 2) {
    if (ow <= 30) return ['force_lourde', 'excentrique'];
    if (ow >= 70) return ['force_lourde', 'pliometrie'];
    return ['force_lourde', 'excentrique_pliometrie'];
  }
  if (spw === 3) {
    const base = ['force_lourde', 'pliometrie', 'excentrique'];
    if (ow <= 30) return ['force_lourde', 'excentrique', 'mobilite'];
    return base;
  }
  if (spw === 4) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc'];
  if (spw === 5) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps'];
  return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps', 'mobilite'];
}

function pickDays(spw) {
  const patterns = {
    1: ['tuesday'],
    2: ['tuesday','friday'],
    3: ['monday','wednesday','friday'],
    4: ['monday','tuesday','thursday','friday'],
    5: ['monday','tuesday','wednesday','friday','saturday'],
    6: ['monday','tuesday','wednesday','thursday','friday','saturday']
  };
  return patterns[spw] || patterns[3];
}

const SESSION_EXERCISES = {
  force_lourde:           ['squat_lourd','rdl','bulgare','hip_thrust','lunge_marcheur'],
  pliometrie:             ['pogo_jumps','bondissements','drop_jumps','lateral_bound','box_jump'],
  excentrique:            ['step_down','nordic','mollet_excentrique','single_leg_rdl','tibialis_raise','reverse_nordic'],
  excentrique_pliometrie: ['step_down','nordic','pogo_jumps','bondissements','tibialis_raise'],
  tronc:                  ['pallof_press','side_plank_hipdrop','dead_bug','bird_dog','suitcase_carry','copenhagen_plank','core_rotation'],
  haut_corps:             ['tractions_or_row','pompes','face_pull','ytw_prone'],
  mobilite:               ['hip_9090','pigeon_actif','knee_to_wall','open_book','monster_walk','hip_abduction','cossack_squat']
};

const FOCUS_META = {
  force_lourde: {
    label: 'Force lourde', duration_min: 55, duration_short: 40, location: 'salle_ou_maison',
    timing_after_easy: true, timing_before_long: false, timing_same_quality: false,
    timing_notes: ['✅ Après sortie facile ou repos', '⚠️ 48h avant une sortie longue', '❌ Pas le même jour qu\'une séance de qualité']
  },
  pliometrie: {
    label: 'Pliométrie', duration_min: 35, duration_short: 25, location: 'extérieur ou maison',
    timing_after_easy: true, timing_before_long: false, timing_same_quality: false,
    timing_notes: ['✅ Après sortie facile ou repos', '⚠️ 24h avant sortie longue', '❌ Pas avant une séance de côtes ou VMA']
  },
  excentrique: {
    label: 'Excentrique', duration_min: 40, duration_short: 30, location: 'maison',
    timing_after_easy: true, timing_before_long: false, timing_same_quality: false,
    timing_notes: ['✅ Après sortie facile ou repos', '⚠️ 24h avant descente technique', '❌ Pas le jour d\'une séance de qualité']
  },
  excentrique_pliometrie: {
    label: 'Excentrique + Pliométrie', duration_min: 45, duration_short: 30, location: 'maison',
    timing_after_easy: true, timing_before_long: false, timing_same_quality: false,
    timing_notes: ['✅ Après sortie facile', '⚠️ 24h avant sortie longue', '❌ Pas avant qualité']
  },
  tronc: {
    label: 'Tronc & stabilité', duration_min: 30, duration_short: 20, location: 'maison',
    timing_after_easy: true, timing_before_long: true, timing_same_quality: true,
    timing_notes: ['✅ Après n\'importe quelle sortie', '✅ Peut s\'intercaler partout', '✅ Le soir d\'un jour de qualité']
  },
  haut_corps: {
    label: 'Haut du corps', duration_min: 40, duration_short: 25, location: 'maison ou salle',
    timing_after_easy: true, timing_before_long: true, timing_same_quality: false,
    timing_notes: ['✅ Après sortie facile', '✅ Avant sortie longue (peu d\'impact jambes)', '⚠️ Éviter avant séance côtes (fatigue générale)']
  },
  mobilite: {
    label: 'Mobilité active', duration_min: 20, duration_short: 15, location: 'maison',
    timing_after_easy: true, timing_before_long: true, timing_same_quality: true,
    timing_notes: ['✅ Le soir après n\'importe quelle séance', '✅ Avant une sortie longue en activation', '✅ Partout — aucune fatigue systémique']
  }
};

function buildSession(focus, profile) {
  const meta = FOCUS_META[focus] || FOCUS_META['tronc'];
  const allExoIds = SESSION_EXERCISES[focus] || [];
  const maxExos = (focus === 'tronc' || focus === 'mobilite') ? 5 : 4;
  const weekNum = Math.floor(Date.now() / (7 * 86400000));
  const offset = weekNum % Math.max(1, allExoIds.length - maxExos + 1);
  const exoIds = allExoIds.slice(offset, offset + maxExos);
  const exercises = exoIds.map(id => {
    const exo = RENFO_EXERCISES[id];
    if (!exo) return null;
    const variant = getBestVariant(exo, profile);
    return {
      exercise_id: id,
      variant_id: variant.id,
      sets: variant.default_sets,
      reps: variant.default_reps,
      target_rpe: variant.target_rpe,
      rest_seconds: variant.rest_seconds,
      load_type: variant.load_type
    };
  }).filter(Boolean);

  const duration = (profile.sessions_per_week >= 5) ? meta.duration_short : meta.duration_min;

  return {
    focus,
    label: meta.label,
    duration_min: duration,
    timing_notes: meta.timing_notes || [],
    location: meta.location,
    exercises
  };
}

// ── AUTO-RÉGULATION ────────────────────────────────────────────────────────

async function suggestNextLoad(userId, exerciseId) {
  const { data: recent } = await sb.from('renfo_exercise_log')
    .select('*')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .order('session_date', { ascending: false })
    .limit(3);

  if (!recent || recent.length === 0) return null;

  const last = recent[0];
  const currentLoad = last.load_kg;
  if (!currentLoad) return null;

  if (!last.completed_all_reps) {
    if (recent.length >= 2 && !recent[1].completed_all_reps)
      return Math.round(currentLoad * 0.95 / 1.25) * 1.25;
    return currentLoad;
  }

  // +4% arrondi au multiple de 1.25kg le plus proche (plancher 1.25kg)
  if (last.rpe <= 7) {
    const raw = currentLoad * 1.04;
    const inc = Math.max(1.25, Math.round((raw - currentLoad) / 1.25) * 1.25);
    return currentLoad + inc;
  }
  if (last.rpe === 8) return currentLoad;
  if (last.rpe === 9) return Math.round(currentLoad * 0.975 / 1.25) * 1.25;
  if (last.rpe >= 10) return Math.round(currentLoad * 0.95 / 1.25) * 1.25;
  return currentLoad;
}

async function suggestNextVariant(userId, exerciseId, currentVariantId) {
  const { data: recent } = await sb.from('renfo_exercise_log')
    .select('rpe, load_variant')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .eq('variant_id', currentVariantId)
    .order('session_date', { ascending: false })
    .limit(3);

  if (!recent || recent.length < 3) return currentVariantId;

  const exo = RENFO_EXERCISES[exerciseId];
  if (!exo) return currentVariantId;
  const variants = [...exo.variants].sort((a, b) => a.priority - b.priority);
  const idx = variants.findIndex(v => v.id === currentVariantId);

  const allEasy = recent.every(r => r.rpe <= 7);
  const allHard = recent.filter(r => r.rpe >= 10).length >= 2;

  if (allEasy && idx < variants.length - 1) return variants[idx + 1].id;
  if (allHard && idx > 0) return variants[idx - 1].id;
  return currentVariantId;
}

// ── DÉTECTION PLATEAU ──────────────────────────────────────────────────────

function daysBetween(dateA, dateB) {
  return Math.abs(new Date(dateA) - new Date(dateB)) / 86400000;
}

async function checkPlateau(userId, exerciseId) {
  const { data: logs } = await sb.from('renfo_exercise_log')
    .select('session_date, e1rm')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .not('e1rm', 'is', null)
    .order('session_date', { ascending: false });

  if (!logs || logs.length < 6) return null;

  const now = logs[0];
  const threeWeeksAgo = logs.find(l => daysBetween(now.session_date, l.session_date) >= 21);
  const sixWeeksAgo   = logs.find(l => daysBetween(now.session_date, l.session_date) >= 42);

  if (sixWeeksAgo && now.e1rm <= sixWeeksAgo.e1rm)
    return { type: 'change_exercise', message: 'Plateau 6 semaines. Essaie de switcher d\'exercice (squat ↔ presse).' };

  if (threeWeeksAgo && now.e1rm <= threeWeeksAgo.e1rm)
    return { type: 'deload', message: 'Plateau 3 semaines. Semaine de deload recommandée (volume −30%, charges −10%).' };

  return null;
}

// ── JAUGE DOSAGE HEBDO ─────────────────────────────────────────────────────

const RENFO_LOAD_WEIGHTS = {
  force_lourde: 1.5, pliometrie: 1.3, excentrique: 1.2,
  haut_corps: 1.0, tronc: 0.8, mobilite: 0.5
};

function weeklyImpactScore(sessionsLast7) {
  return sessionsLast7.reduce((sum, s) => {
    const w = RENFO_LOAD_WEIGHTS[s.focus] || 1.0;
    return sum + (s.duration_min || 30) * w;
  }, 0);
}

function weeklyImpactZone(score, objectiveWeight) {
  if (score < 60)  return { zone: 'sous_dose',  label: 'Sous-dosé',          color: '#e74c3c' };
  if (score < 120) return { zone: 'maintien',   label: 'Maintien',           color: '#f39c12' };
  if (score < 180) return { zone: 'adaptation', label: 'Adaptation',         color: '#2ecc71' };
  if (score < 240) return { zone: 'optimal',    label: 'Optimal coureur',    color: '#27ae60' };
  return           { zone: 'surcharge',         label: 'Risque interférence',color: '#e67e22' };
}


// ── UI & STATE (renfo.js) ──────────────────────────────────────────────────

// RENFO MODULE
// ════════════════════════════════════════════════════

let renfoProfile = null;
let renfoProgram = null;
let renfoSessionLogs = [];
let _renfoOnboarding = { equipment: {} };

export async function preloadRenfoState() {
  if(!VLState.currentUser) return;
  const [{ data: prog }, { data: logs }] = await Promise.all([
    sb.from('renfo_program').select('*').eq('user_id', VLState.currentUser.id).maybeSingle(),
    sb.from('renfo_session_log').select('*').eq('user_id', VLState.currentUser.id),
  ]);
  VLState.renfoProgram = prog || null;
  VLState.renfoSessionLogs = logs || [];
  VLState.RENFO_FOCUS_COLORS = RENFO_FOCUS_COLORS;
}

export async function loadRenfoApp() {
  const el = document.getElementById('renfoApp');
  if (!el || !VLState.currentUser) return;
  el.innerHTML = `<div style="padding:48px 0;text-align:center;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem">Chargement…</div>`;

  const { data: profile } = await sb.from('renfo_profile').select('*').eq('user_id', VLState.currentUser.id).maybeSingle();
  renfoProfile = profile;

  if (!profile || !profile.onboarding_completed) {
    el.innerHTML = '';
    _renfoOnboarding = { equipment: {} };
    renderOnboardingStep(1);
    return;
  }

  const [{ data: program }, { data: logs }] = await Promise.all([
    sb.from('renfo_program').select('*').eq('user_id', VLState.currentUser.id).maybeSingle(),
    sb.from('renfo_session_log').select('*').eq('user_id', VLState.currentUser.id)
      .gte('session_date', new Date(Date.now() - 14*86400000).toISOString().slice(0,10))
      .order('session_date', { ascending: false })
  ]);

  renfoProgram = program;
  renfoSessionLogs = logs || [];
  VLState.renfoProgram = renfoProgram;
  VLState.renfoSessionLogs = renfoSessionLogs;
  renderRenfoHome();
}

export function renderOnboardingStep(step) {
  const el = document.getElementById('renfoApp');
  if (!el) return;

  const obBtn = (v, type, title, sub) => `<button class="vl-ob-btn" data-val="${v}" data-type="${type}" onclick="renfoObSelect(this)"
    style="text-align:left;padding:14px 16px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text);touch-action:manipulation;-webkit-tap-highlight-color:transparent;width:100%">
    <div style="font-family:var(--vl-display);font-size:1.05rem;font-weight:700;margin-bottom:3px">${title}</div>
    <div style="font-size:.73rem;color:var(--vl-text-2)">${sub}</div>
  </button>`;

  const eqLabel = (k, l) => `<label style="display:flex;align-items:center;gap:8px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:10px;padding:10px 12px;cursor:pointer;touch-action:manipulation">
    <input type="checkbox" onchange="renfoEquipSet('${k}',this.checked)" style="accent-color:var(--vl-ember);width:16px;height:16px;flex-shrink:0">
    <span style="font-size:.78rem;color:var(--vl-text)">${l}</span>
  </label>`;

  const contents = [null,
    `<div style="display:flex;flex-direction:column;gap:10px">
      ${obBtn(25,'obj','Renforcement préventif','Excentrique · Mobilité · Stabilité')}
      ${obBtn(75,'obj','Progresser en performance','Force lourde · Pliométrie · Économie de course')}
      ${obBtn(50,'obj','Les deux à parts égales','Programme équilibré')}
    </div>`,
    `<div style="display:flex;flex-direction:column;gap:10px">
      ${obBtn(1,'spw','1 séance / semaine','~50 min · Force lourde uniquement')}
      ${obBtn(3,'spw','2–3 séances / semaine ⭐','~35–50 min · Recommandé scientifique (Blagrove 2018)')}
      ${obBtn(5,'spw','4–5 séances / semaine','~30–40 min · Force + pliométrie + tronc + haut du corps')}
      ${obBtn(6,'spw','6 séances / semaine','~20–30 min · Format court quotidien')}
    </div>`,
    `<div style="display:flex;flex-direction:column;gap:14px">
      <div>
        <div style="font-family:var(--vl-mono);font-size:.6rem;letter-spacing:.08em;color:var(--vl-text-2);margin-bottom:8px">À DOMICILE — disponible tous les jours</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${eqLabel('pullup_bar','Barre de traction')}
          ${eqLabel('step','Step / marche')}
          ${eqLabel('anchor_point','Point d\'ancrage')}
        </div>
        <div style="margin-top:8px">
          <div style="font-size:.73rem;color:var(--vl-text-2);margin-bottom:5px">Haltères — charge max : <strong id="dbVal">0</strong> kg</div>
          <input type="range" min="0" max="50" step="2.5" value="0" oninput="document.getElementById('dbVal').textContent=this.value;_renfoOnboarding.equipment.dumbbells_max_kg=+this.value" style="width:100%;accent-color:var(--vl-ember)">
        </div>
        <div style="margin-top:8px">
          <div style="font-size:.73rem;color:var(--vl-text-2);margin-bottom:5px">Kettlebell — charge max : <strong id="kbVal">0</strong> kg</div>
          <input type="range" min="0" max="40" step="4" value="0" oninput="document.getElementById('kbVal').textContent=this.value;_renfoOnboarding.equipment.kettlebell_max_kg=+this.value" style="width:100%;accent-color:var(--vl-ember)">
        </div>
        <div style="margin-top:8px">
          <div style="font-size:.73rem;color:var(--vl-text-2);margin-bottom:6px">Élastiques de résistance</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${['Léger','Moyen','Fort','Extra-fort'].map((b,i)=>{
              const val = ['light','medium','heavy','extra-heavy'][i];
              return `<button type="button" id="band-${val}" onclick="renfoToggleBand(this,'${val}')"
                style="padding:7px 13px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:8px;cursor:pointer;font-size:.75rem;color:var(--vl-text);touch-action:manipulation;-webkit-tap-highlight-color:transparent">${b}</button>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div>
        <div style="font-family:var(--vl-mono);font-size:.6rem;letter-spacing:.08em;color:var(--vl-text-2);margin-bottom:8px">EN SALLE — si tu as accès à une salle</div>
        <label style="display:flex;align-items:center;gap:10px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:10px;padding:12px;cursor:pointer;touch-action:manipulation;margin-bottom:8px">
          <input type="checkbox" id="gymAccessCheck" onchange="renfoEquipSet('_gym',this.checked)" style="accent-color:var(--vl-ember);width:18px;height:18px;flex-shrink:0">
          <div>
            <div style="font-size:.82rem;color:var(--vl-text);font-weight:600">J'ai accès à une salle régulièrement</div>
            <div style="font-size:.7rem;color:var(--vl-text-2)">Débloque les variantes avec barres et machines</div>
          </div>
        </label>
        <div id="gymEquipSection" style="display:none;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${eqLabel('barbell','Barre + disques')}
          ${eqLabel('leg_press','Presse à cuisses')}
          ${eqLabel('bench','Banc')}
        </div>
      </div>
    </div>`
  ];

  const titles = [null, 'Ton objectif', 'Ton rythme', 'Ton matériel'];
  const subs   = [null,
    'Le programme s\'adaptera à ta priorité.',
    'Sois réaliste — 2 séances tenues valent mieux que 5 ratées.',
    'Le programme choisit automatiquement les meilleures variantes.'
  ];

  el.innerHTML = `<div style="padding:4px 0 24px">
    <div style="font-family:var(--vl-mono);font-size:.6rem;letter-spacing:.12em;color:var(--vl-ember);margin-bottom:8px">ÉTAPE ${step} / 3</div>
    <div style="font-family:var(--vl-display);font-size:1.8rem;font-weight:800;line-height:1.1;margin-bottom:6px">${titles[step]}</div>
    <div style="font-size:.8rem;color:var(--vl-text-2);margin-bottom:20px">${subs[step]}</div>
    ${contents[step]}
    <div style="display:flex;gap:10px;margin-top:24px">
      ${step > 1 ? `<button onclick="renderOnboardingStep(${step-1})" style="flex:1;padding:14px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text);font-family:var(--vl-mono);touch-action:manipulation">← Retour</button>` : ''}
      ${step < 3
        ? `<button onclick="renfoNextStep(${step})" style="flex:2;padding:14px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-mono);font-weight:700;touch-action:manipulation">Suivant →</button>`
        : `<button onclick="finishRenfoOnboarding()" style="flex:2;padding:14px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-mono);font-weight:700;touch-action:manipulation">Générer mon programme →</button>`}
    </div>
  </div>`;
}

export function renfoNextStep(current) {
  if (current === 1 && _renfoOnboarding.objective_weight === undefined) {
    showToast('Choisis un objectif pour continuer', 'info'); return;
  }
  if (current === 2 && _renfoOnboarding.sessions_per_week === undefined) {
    showToast('Choisis un rythme de séances', 'info'); return;
  }
  renderOnboardingStep(current + 1);
}

function renfoEquipSet(key, val) {
  if (!_renfoOnboarding.equipment) _renfoOnboarding.equipment = {};
  if (key === '_gym') {
    _renfoOnboarding.has_gym_access = val;
    const sec = document.getElementById('gymEquipSection');
    if (sec) sec.style.display = val ? 'grid' : 'none';
  } else {
    _renfoOnboarding.equipment[key] = val;
  }
}

export function renfoObSelect(btn) {
  const type = btn.dataset.type;
  const val = +btn.dataset.val;
  document.querySelectorAll(`.vl-ob-btn[data-type="${type}"]`).forEach(b => {
    b.style.borderColor = 'var(--vl-border)';
    b.style.background = 'var(--vl-bg2)';
  });
  btn.style.borderColor = 'var(--vl-ember)';
  btn.style.background = 'rgba(229,86,42,.1)';
  if (type === 'obj') _renfoOnboarding.objective_weight = val;
  if (type === 'spw') _renfoOnboarding.sessions_per_week = val;
}

export function renfoToggleBand(btn, band) {
  if (!_renfoOnboarding.equipment) _renfoOnboarding.equipment = {};
  if (!_renfoOnboarding.equipment.bands) _renfoOnboarding.equipment.bands = [];
  const idx = _renfoOnboarding.equipment.bands.indexOf(band);
  if (idx === -1) {
    _renfoOnboarding.equipment.bands.push(band);
    btn.style.borderColor = 'var(--vl-ember)';
    btn.style.background = 'rgba(229,86,42,.1)';
  } else {
    _renfoOnboarding.equipment.bands.splice(idx, 1);
    btn.style.borderColor = 'var(--vl-border)';
    btn.style.background = 'var(--vl-bg2)';
  }
}

export async function finishRenfoOnboarding() {
  const el = document.getElementById('renfoApp');
  el.innerHTML = `<div style="padding:48px 0;text-align:center;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem">Génération du programme…</div>`;

  const profile = {
    user_id: VLState.currentUser.id,
    objective_weight: _renfoOnboarding.objective_weight || 50,
    sessions_per_week: _renfoOnboarding.sessions_per_week || 3,
    equipment: _renfoOnboarding.equipment || {},
    has_gym_access: _renfoOnboarding.has_gym_access || false,
    onboarding_completed: true
  };

  const { error: pe } = await sb.from('renfo_profile').upsert(profile);
  if (pe) { showToast('Erreur sauvegarde profil', 'error'); return; }
  renfoProfile = profile;

  const schedule = generateRenfoProgram(profile);
  const { error: re } = await sb.from('renfo_program').upsert({
    user_id: VLState.currentUser.id,
    week_schedule: schedule,
    generated_at: new Date().toISOString(),
    generation_inputs: profile
  });
  if (re) { showToast('Erreur génération programme', 'error'); return; }

  renfoProgram = { week_schedule: schedule };
  renfoSessionLogs = [];
  VLState.renfoProgram = renfoProgram;
  VLState.renfoSessionLogs = renfoSessionLogs;
  showToast('Programme généré 🎯', 'success');
  renderRenfoHome();
}

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const _ICON_PLAY = `<svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor" style="display:block;flex-shrink:0"><path d="M0 0.5l9 5-9 5z"/></svg>`;
const _ICON_CHECK = `<svg width="13" height="10" viewBox="0 0 13 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0"><polyline points="1 5 5 9 12 1"/></svg>`;
const _ICON_GEAR = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const _ICON_CHEVRON = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 1l4 4 4-4"/></svg>`;
const _ICON_ARROW_LEFT = `<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M7 1L1 7l6 6"/></svg>`;

const RENFO_DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const RENFO_DAY_FR = ['D','L','M','M','J','V','S'];

export function renderRenfoHome() {
  const el = document.getElementById('renfoApp');
  if (!el || !renfoProgram) return;

  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const todayLog = renfoSessionLogs.find(l => l.session_date === todayStr);

  // Find next unfinished session this week (flexible — not day-bound)
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const thisWeekLogs = renfoSessionLogs.filter(l => new Date(l.session_date) >= weekStart);
  const doneFocuses = new Set(thisWeekLogs.map(l => renfoProgram.week_schedule?.[l.day_key]?.focus).filter(Boolean));
  const sessionDays = DAYS.filter(d => { const s = renfoProgram.week_schedule?.[d]; return s && !s.rest; });
  const nextDayKey = sessionDays.find(d => !doneFocuses.has(renfoProgram.week_schedule[d]?.focus));
  const suggestedSession = nextDayKey ? renfoProgram.week_schedule[nextDayKey] : null;

  // Load gauge
  const last7 = renfoSessionLogs.filter(l => (today - new Date(l.session_date)) / 86400000 <= 7);
  const last7WithFocus = last7.map(l => {
    const s = renfoProgram.week_schedule?.[l.day_key];
    return { focus: s?.focus || 'tronc', duration_min: s?.duration_min || 30 };
  });
  const loadScore = weeklyImpactScore(last7WithFocus);
  const loadZone = weeklyImpactZone(loadScore, renfoProfile?.objective_weight || 50);

  // Streak (consecutive days with a session log)
  let streak = 0;
  const sortedLogs = [...renfoSessionLogs].sort((a,b) => new Date(b.session_date) - new Date(a.session_date));
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0,10);
    if (sortedLogs.find(l => l.session_date === dStr)) streak++;
    else break;
  }

  // 7-day calendar (last 6 days + today)
  const calDays = Array.from({length:7}, (_,i) => {
    const d = new Date(today); d.setDate(d.getDate() - (6-i));
    const dKey = RENFO_DAY_NAMES[d.getDay()];
    const dStr = d.toISOString().slice(0,10);
    const logged = renfoSessionLogs.find(l => l.session_date === dStr);
    const ses = logged ? renfoProgram.week_schedule?.[logged.day_key] : null;
    return { d, dKey, dStr, ses, logged, isToday: i===6 };
  });

  // Session list for home
  const todayBanner = todayLog
    ? (() => {
        const n = Object.keys(todayLog.completed_exercises||{}).length;
        const doneLabel = renfoProgram.week_schedule?.[todayLog.day_key]?.label || '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(34,197,94,.1);border-radius:8px;margin-bottom:10px">
          <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0"></div>
          <div style="font-size:.8rem"><strong>Séance du jour faite</strong> · ${n} exercices · ${doneLabel}</div>
        </div>`;
      })()
    : '';

  const allSessionDays = DAYS.filter(d => { const s = renfoProgram.week_schedule?.[d]; return s && !s.rest; });
  const sessionListHTML = allSessionDays.map(dayKey => {
    const session = renfoProgram.week_schedule[dayKey];
    const done = doneFocuses.has(session.focus);
    const col = RENFO_FOCUS_COLORS[session.focus] || 'var(--vl-ember)';
    return `<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;background:var(--vl-bg2);border:1.5px solid ${done?'var(--vl-border)':col};border-radius:10px;margin-bottom:8px;${done?'opacity:.6':''}">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--vl-display);font-size:.95rem;font-weight:700">${session.label}</div>
        <div style="font-family:var(--vl-mono);font-size:.58rem;color:var(--vl-text-2)">~${session.duration_min} min · ${session.exercises.length} exercices</div>
      </div>
      ${done
        ? `<div style="display:flex;align-items:center;gap:5px;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2)">${_ICON_CHECK} fait</div>`
        : `<button onclick="startRenfoSession('${dayKey}')" style="display:flex;align-items:center;gap:7px;padding:9px 14px;background:${col};border:none;border-radius:8px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:.75rem;font-weight:700;touch-action:manipulation;flex-shrink:0;-webkit-tap-highlight-color:transparent">${_ICON_PLAY} LANCER</button>`
      }
    </div>`;
  }).join('');
  const sessionsCardHTML = `${todayBanner}${sessionListHTML || '<div style="font-size:.8rem;color:var(--vl-text-2)">Aucune séance dans ton programme.</div>'}`;

  el.innerHTML = `<div style="padding-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1.25rem">
      <div>
        <div class="mlabel" style="margin-bottom:4px">Section 03</div>
        <div style="font-family:var(--vl-display);font-size:2rem;font-weight:700;letter-spacing:0.01em;line-height:1">RENFO MUSCULAIRE</div>
      </div>
      <button onclick="showRenfoSettings()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:6px;touch-action:manipulation;display:flex;align-items:center">${_ICON_GEAR}</button>
    </div>

    <div class="card" style="margin-bottom:12px;padding:16px">
      <div class="clabel" style="margin-bottom:10px">SÉANCES</div>
      ${sessionsCardHTML}
    </div>

    <div class="card" style="margin-bottom:12px;padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div class="clabel">CHARGE HEBDO</div>
        <div style="font-size:.72rem;color:${loadZone.color};font-family:var(--vl-mono)">${loadZone.label}</div>
      </div>
      <div style="height:8px;background:var(--vl-bg2);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${Math.min(100,loadScore/240*100).toFixed(1)}%;background:${loadZone.color};border-radius:4px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-2);margin-top:4px">
        <span>0</span><span>60</span><span>120</span><span>180</span><span>240+</span>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div class="card" style="flex:1;padding:14px;text-align:center">
        <div style="font-family:var(--vl-display);font-size:2.2rem;font-weight:800;color:var(--vl-ember);line-height:1">${streak}</div>
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-top:4px">JOURS STREAK</div>
      </div>
      <div class="card" style="flex:1;padding:14px;text-align:center">
        <div style="font-family:var(--vl-display);font-size:2.2rem;font-weight:800;line-height:1">${last7.length}</div>
        <div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-top:4px">SÉANCES / 7J</div>
      </div>
    </div>

    <button onclick="showRenfoHistoryView()" style="width:100%;text-align:left;padding:14px 16px;background:var(--vl-bg2);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text);display:flex;justify-content:space-between;align-items:center;touch-action:manipulation">
      <span style="font-size:.85rem">Charges &amp; historique</span><span style="color:var(--vl-ember);font-size:.9rem">→</span>
    </button>
  </div>`;
}

export async function startRenfoSession(dayKey) {
  const el = document.getElementById('renfoApp');
  if (!el || !renfoProgram) return;
  const session = renfoProgram.week_schedule?.[dayKey];
  if (!session || session.rest) return;

  const completedExos = {};

  // Pre-load weight suggestions for external_kg exercises
  const suggestions = {};
  if (VLState.currentUser) {
    await Promise.all(
      session.exercises
        .filter(e => e.load_type === 'external_kg')
        .map(async e => {
          const kg = await suggestNextLoad(VLState.currentUser.id, e.exercise_id);
          if (kg !== null) suggestions[e.exercise_id] = kg;
        })
    );
  }

  const exoRows = session.exercises.map(exo => {
    const def = RENFO_EXERCISES[exo.exercise_id];
    if (!def) return '';
    const variant = def.variants.find(v => v.id === exo.variant_id) || def.variants[0];

    let actionHtml;
    if (exo.load_type === 'external_kg') {
      const suggested = suggestions[exo.exercise_id];
      actionHtml = `<div style="display:flex;gap:8px;align-items:center;margin-top:10px">
        <input id="load-${exo.exercise_id}" type="number" inputmode="decimal" step="2.5" min="0"
          placeholder="${suggested ? `${suggested} kg (suggéré)` : 'Charge en kg…'}"
          ${suggested ? `value="${suggested}"` : ''}
          style="flex:1;padding:9px 12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:8px;color:var(--vl-text);font-size:.9rem;box-sizing:border-box">
        <button id="chk-${exo.exercise_id}" onclick="validateExoWithLoad('${exo.exercise_id}','${exo.variant_id}','${exo.load_type}')"
          style="display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:8px;border:1.5px solid var(--vl-border);background:transparent;cursor:pointer;font-family:var(--vl-display);font-size:.8rem;font-weight:700;color:var(--vl-text-2);touch-action:manipulation;white-space:nowrap;flex-shrink:0;-webkit-tap-highlight-color:transparent">
          ${_ICON_CHECK} Valider
        </button>
      </div>`;
    } else {
      const loadLabel = exo.load_type === 'band' ? 'élastique' : 'poids de corps';
      actionHtml = `<div style="font-size:.72rem;color:var(--vl-text-2);margin-top:6px;margin-bottom:8px">${loadLabel}</div>
      <button id="chk-${exo.exercise_id}" onclick="toggleExoCheck('${exo.exercise_id}','${exo.variant_id}','${exo.load_type}')"
        style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--vl-border);background:transparent;cursor:pointer;font-family:var(--vl-display);font-size:.8rem;font-weight:700;color:var(--vl-text-2);touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:7px">
        ${_ICON_CHECK} Exercice fait
      </button>`;
    }

    return `<div id="exo-card-${exo.exercise_id}" class="card" style="margin-bottom:10px;padding:14px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
        <div style="min-width:0">
          <div style="font-family:var(--vl-display);font-size:1.05rem;font-weight:700;margin-bottom:2px">${def.name_fr}</div>
          <div data-variant-name style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2)">${def.name_tech} · ${variant.name}</div>
          ${def.primary_muscles && def.primary_muscles.length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px">${def.primary_muscles.map(m=>`<span style="font-family:var(--vl-mono);font-size:.5rem;color:var(--vl-text-2);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:2px 6px">${m}</span>`).join('')}</div>` : ''}
        </div>
        ${def.variants.length > 1 ? `<button onclick="showVariantPicker('${exo.exercise_id}')" style="padding:4px 8px;background:transparent;border:1px solid var(--vl-border);border-radius:6px;cursor:pointer;font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);touch-action:manipulation;flex-shrink:0">Variante</button>` : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div data-sets-rpe style="font-size:.8rem;color:var(--vl-ember);font-weight:600">${exo.sets}×${exo.reps} · RPE cible ${exo.target_rpe} · Repos ${fmtRest(variant.rest_seconds||60)}</div>
        <button onclick="startRestTimer(${variant.rest_seconds||60})" style="padding:4px 10px;background:transparent;border:1px solid var(--vl-ember);border-radius:6px;cursor:pointer;font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-ember);touch-action:manipulation;flex-shrink:0">⏱ Repos</button>
      </div>
      ${actionHtml}
      <button onclick="toggleExoDetail('${exo.exercise_id}')" style="margin-top:10px;background:none;border:none;cursor:pointer;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);padding:0;touch-action:manipulation;display:flex;align-items:center;gap:5px">
        ${_ICON_CHEVRON} Comment faire
      </button>
      <div id="exo-detail-${exo.exercise_id}" style="display:none;margin-top:10px;border-top:1px solid var(--vl-border);padding-top:10px">
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px"><strong style="color:var(--vl-text)">Position</strong><br>${def.position}</div>
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px"><strong style="color:var(--vl-text)">Mouvement</strong><br>${def.movement}</div>
        <div style="font-size:.75rem;color:var(--vl-ember);margin-bottom:8px"><strong>Erreurs fréquentes</strong><br>${def.common_errors}</div>
        <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(def.youtube_search)}" target="_blank" rel="noopener"
          style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,0,0,.1);border:1px solid rgba(255,0,0,.3);border-radius:7px;padding:6px 11px;font-family:var(--vl-mono);font-size:.6rem;color:#ff4444;text-decoration:none">${_ICON_PLAY} Rechercher sur YouTube</a>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div style="padding-bottom:8px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem">
      <button onclick="renderRenfoHome()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:6px;touch-action:manipulation;display:flex;align-items:center">${_ICON_ARROW_LEFT}</button>
      <div>
        <div style="font-family:var(--vl-mono);font-size:.6rem;letter-spacing:.1em;color:${RENFO_FOCUS_COLORS[session.focus]||'var(--vl-ember)'}">
          ${(session.focus||'').replace(/_/g,' ').toUpperCase()} · ~${session.duration_min} MIN
        </div>
        <div style="font-family:var(--vl-display);font-size:1.5rem;font-weight:800;line-height:1.1">${session.label}</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:14px;padding:12px 14px;background:rgba(229,86,42,.07);border-color:rgba(229,86,42,.2)">
      <div style="font-family:var(--vl-mono);font-size:.65rem;color:var(--vl-ember);margin-bottom:4px">ÉCHAUFFEMENT (5–8 min)</div>
      <div style="font-size:.78rem;color:var(--vl-text-2)">Footing léger 3min → montées de genoux 30s → talons-fesses 30s → squat profond × 10 → rotation de buste × 10 de chaque côté</div>
    </div>
    ${exoRows}
    <button onclick="completeRenfoSession('${dayKey}')" style="width:100%;padding:14px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:1rem;font-weight:700;letter-spacing:.04em;margin-top:6px;touch-action:manipulation">
      TERMINER LA SÉANCE
    </button>
  </div>`;

  window._renfoSessionCompleted = completedExos;
  window._renfoSessionDayKey = dayKey;
}

export function toggleExoDetail(exerciseId) {
  const d = document.getElementById('exo-detail-' + exerciseId);
  if (!d) return;
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

export function toggleExoCheck(exerciseId, variantId, loadType) {
  const btn = document.getElementById('chk-' + exerciseId);
  if (!btn) return;
  const isChecked = btn.dataset.checked === '1';
  if (!isChecked) {
    showRenfoLogPopup(exerciseId, variantId, loadType);
  } else {
    btn.dataset.checked = '0';
    btn.style.borderColor = 'var(--vl-border)';
    btn.style.background = 'transparent';
    btn.style.color = 'transparent';
    if (window._renfoSessionCompleted) delete window._renfoSessionCompleted[exerciseId];
  }
}

export function validateExoWithLoad(exerciseId, variantId, loadType) {
  const inputEl = document.getElementById('load-' + exerciseId);
  const prefillLoad = inputEl ? (parseFloat(inputEl.value) || null) : null;
  showRenfoLogPopup(exerciseId, variantId, loadType, prefillLoad);
}

export function startRestTimer(secs) {
  clearInterval(window._renfoRestTimer);
  const existing = document.getElementById('renfoRestBar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.id = 'renfoRestBar';
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9000;background:var(--vl-bg2);border-top:1.5px solid var(--vl-border);padding:12px 16px 20px;display:flex;flex-direction:column;gap:8px';
  bar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);letter-spacing:.08em">REPOS</div>
      <button id="renfoRestSkip" style="padding:5px 12px;background:transparent;border:1px solid var(--vl-border);border-radius:6px;cursor:pointer;font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);touch-action:manipulation">Passer</button>
    </div>
    <div id="renfoRestCountdown" style="font-family:var(--vl-display);font-size:1.6rem;font-weight:800;color:var(--vl-ember);text-align:center;line-height:1">${fmtRest(secs)}</div>
    <div style="height:6px;background:var(--vl-bg);border-radius:3px;overflow:hidden">
      <div id="renfoRestProgress" style="height:100%;width:100%;background:var(--vl-ember);border-radius:3px;transition:width .9s linear"></div>
    </div>`;
  document.body.appendChild(bar);

  bar.querySelector('#renfoRestSkip').addEventListener('click', () => {
    clearInterval(window._renfoRestTimer);
    bar.remove();
  });

  let remaining = secs;
  window._renfoRestTimer = setInterval(() => {
    remaining--;
    const countdown = bar.querySelector('#renfoRestCountdown');
    const progress = bar.querySelector('#renfoRestProgress');
    if (countdown) countdown.textContent = fmtRest(remaining);
    if (progress) progress.style.width = Math.max(0, (remaining / secs * 100)).toFixed(1) + '%';
    if (remaining <= 0) {
      clearInterval(window._renfoRestTimer);
      bar.remove();
      navigator.vibrate?.([100, 50, 100]);
    }
  }, 1000);
}

function markExoChecked(exerciseId, variantId, loadType, loadKg, reps, rpe) {
  const btn = document.getElementById('chk-' + exerciseId);
  if (btn) {
    btn.dataset.checked = '1';
    btn.style.borderColor = 'var(--vl-ember)';
    btn.style.background = 'var(--vl-ember)';
    btn.style.color = '#fff';
    btn.innerHTML = _ICON_CHECK;
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
  }
  if (window._renfoSessionCompleted) {
    window._renfoSessionCompleted[exerciseId] = { variantId, loadType, loadKg, reps, rpe, logged_at: new Date().toISOString() };
  }
  // Show e1RM toast if applicable
  if (loadKg && reps) {
    const e1rm = epley1RM(loadKg, reps);
    if (e1rm) showToast(`e1RM estimé : ${e1rm} kg`, 'success', 3000);
  }
  // Start rest timer
  const def2 = RENFO_EXERCISES[exerciseId];
  const v2 = def2?.variants?.find(v => v.id === variantId) || def2?.variants?.[0];
  if (v2?.rest_seconds) startRestTimer(v2.rest_seconds);
}

function showRenfoLogPopup(exerciseId, variantId, loadType, prefillLoad = null) {
  const def = RENFO_EXERCISES[exerciseId];
  if (!def) { markExoChecked(exerciseId, variantId, loadType, null, null, null); return; }

  const existing = document.getElementById('renfoLogPopup');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'renfoLogPopup';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:8000;display:flex;align-items:flex-end;touch-action:none';

  const isWeighted = loadType === 'external_kg';
  overlay.innerHTML = `<div style="width:100%;background:var(--vl-bg2);border-radius:20px 20px 0 0;padding:20px 20px 32px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div style="width:36px;height:4px;background:var(--vl-border);border-radius:2px;margin:0 auto 18px"></div>
    <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:700;margin-bottom:4px">${def.name_fr}</div>
    <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-bottom:18px">${def.name_tech}</div>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${isWeighted ? `<div>
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px">Charge (kg)</div>
        <input id="rlLoad" type="number" inputmode="decimal" min="0" step="2.5"
          placeholder="${prefillLoad ? '' : '60'}" ${prefillLoad !== null ? `value="${prefillLoad}"` : ''}
          style="width:100%;padding:10px 12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:8px;color:var(--vl-text);font-size:1rem;box-sizing:border-box">
      </div>
      <div>
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px">Répétitions effectuées</div>
        <input id="rlReps" type="number" inputmode="numeric" min="1" max="30" placeholder="5" style="width:100%;padding:10px 12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:8px;color:var(--vl-text);font-size:1rem;box-sizing:border-box">
      </div>` : `<div style="font-family:var(--vl-mono);font-size:.8rem;color:var(--vl-text-2);padding:8px 0">Terminé ✓</div>`}
      <div>
        <div style="font-size:.75rem;color:var(--vl-text-2);margin-bottom:6px">Difficulté (RPE) — <span id="rpeLabel">8</span>/10</div>
        <input id="rlRpe" type="range" min="6" max="10" step="1" value="8" oninput="document.getElementById('rpeLabel').textContent=this.value" style="width:100%;accent-color:var(--vl-ember)">
        <div style="display:flex;justify-content:space-between;font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2)">
          <span>6 (facile)</span><span>8 (cible)</span><span>10 (max)</span>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button onclick="document.getElementById('renfoLogPopup').remove();markExoChecked('${exerciseId}','${variantId}','${loadType}',null,null,null)" style="flex:1;padding:13px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Passer</button>
      <button onclick="submitRenfoLog('${exerciseId}','${variantId}','${loadType}')" style="flex:2;padding:13px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-mono);font-weight:700;touch-action:manipulation">Valider</button>
    </div>
  </div>`;

  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

export function submitRenfoLog(exerciseId, variantId, loadType) {
  const loadKg = parseFloat(document.getElementById('rlLoad')?.value) || null;
  const reps = parseInt(document.getElementById('rlReps')?.value) || null;
  const rpe = parseInt(document.getElementById('rlRpe')?.value) || 8;
  document.getElementById('renfoLogPopup')?.remove();

  markExoChecked(exerciseId, variantId, loadType, loadKg, reps, rpe);

  // Save to DB async (don't block UI)
  const todayStr = new Date().toISOString().slice(0,10);
  const e1rm = (loadKg && reps) ? epley1RM(loadKg, reps) : null;
  sb.from('renfo_exercise_log').insert({
    user_id: VLState.currentUser.id,
    session_date: todayStr,
    exercise_id: exerciseId,
    variant_id: variantId,
    load_kg: loadKg,
    reps_completed: reps,
    reps_target: RENFO_EXERCISES[exerciseId]?.variants?.find(v=>v.id===variantId)?.default_reps || null,
    rpe,
    e1rm,
    completed_all_reps: reps >= (RENFO_EXERCISES[exerciseId]?.variants?.find(v=>v.id===variantId)?.default_reps || reps),
    load_type: loadType
  }).then(({ error }) => {
    if (error) showToast('Erreur log exercice', 'error');
  });

  if (e1rm) {
    sb.from('renfo_max_lifts').upsert({
      user_id: VLState.currentUser.id,
      exercise_id: exerciseId,
      one_rm: e1rm,
      is_estimated: true,
      recorded_at: new Date().toISOString()
    }, { onConflict: 'user_id,exercise_id', ignoreDuplicates: false }).then(({ error, data }) => {
      if (!error) showToast(`e1RM estimé : ${e1rm} kg`, 'success', 3000);
    });
  }
}

export function showVariantPicker(exerciseId) {
  const def = RENFO_EXERCISES[exerciseId];
  if (!def) return;

  const existing = document.getElementById('renfoVariantPicker');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'renfoVariantPicker';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:8000;display:flex;align-items:flex-end;touch-action:none';

  const variantItems = def.variants.map(v => {
    const eqHint = v.required_equipment
      ? Object.keys(v.required_equipment).filter(k => v.required_equipment[k]).join(', ') || 'poids de corps'
      : (v.required_equipment_any ? 'haltères / kettlebell' : '');
    return `<button onclick="applyVariant('${exerciseId}','${v.id}')" style="width:100%;text-align:left;padding:12px 14px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:10px;cursor:pointer;color:var(--vl-text);touch-action:manipulation;margin-bottom:8px">
      <div style="font-family:var(--vl-display);font-size:.85rem;font-weight:700">${v.name}</div>
      ${eqHint ? `<div style="font-family:var(--vl-mono);font-size:.55rem;color:var(--vl-text-2);margin-top:3px">${eqHint}</div>` : ''}
    </button>`;
  }).join('');

  overlay.innerHTML = `<div style="width:100%;background:var(--vl-bg2);border-radius:20px 20px 0 0;padding:20px 20px 32px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
    <div style="width:36px;height:4px;background:var(--vl-border);border-radius:2px;margin:0 auto 18px"></div>
    <div style="font-family:var(--vl-display);font-size:1.1rem;font-weight:700;margin-bottom:4px">${def.name_fr}</div>
    <div style="font-family:var(--vl-mono);font-size:.6rem;color:var(--vl-text-2);margin-bottom:18px">Choisir une variante</div>
    ${variantItems}
    <button onclick="document.getElementById('renfoVariantPicker').remove()" style="width:100%;padding:12px;background:var(--vl-bg);border:1.5px solid var(--vl-border);border-radius:10px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;touch-action:manipulation">Annuler</button>
  </div>`;

  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

export function applyVariant(exerciseId, newVariantId) {
  const picker = document.getElementById('renfoVariantPicker');
  if (picker) picker.remove();

  const dayKey = window._renfoSessionDayKey;
  if (!dayKey || !renfoProgram) return;
  const session = renfoProgram.week_schedule?.[dayKey];
  if (!session) return;

  const exo = session.exercises.find(e => e.exercise_id === exerciseId);
  if (!exo) return;

  const def = RENFO_EXERCISES[exerciseId];
  const newVariant = def?.variants?.find(v => v.id === newVariantId);
  if (!newVariant) return;

  exo.variant_id = newVariantId;
  exo.sets = newVariant.default_sets;
  exo.reps = newVariant.default_reps;
  exo.target_rpe = newVariant.target_rpe;
  exo.rest_seconds = newVariant.rest_seconds;
  exo.load_type = newVariant.load_type;

  // Update DOM text elements in the card
  const card = document.getElementById('exo-card-' + exerciseId);
  if (card) {
    const techEl = card.querySelector('[data-variant-name]');
    if (techEl) techEl.textContent = def.name_tech + ' · ' + newVariant.name;
    const setsEl = card.querySelector('[data-sets-rpe]');
    if (setsEl) setsEl.textContent = `${exo.sets}×${exo.reps} · RPE cible ${exo.target_rpe} · Repos ${fmtRest(newVariant.rest_seconds||60)}`;
  }

  showToast('Variante mise à jour', 'success');
}

export async function completeRenfoSession(dayKey) {
  const completed = window._renfoSessionCompleted || {};
  const n = Object.keys(completed).length;
  if (n === 0) { showToast('Coche au moins un exercice', 'info'); return; }

  const todayStr = new Date().toISOString().slice(0,10);
  const { error } = await sb.from('renfo_session_log').upsert({
    user_id: VLState.currentUser.id,
    session_date: todayStr,
    day_key: dayKey,
    completed_exercises: completed
  }, { onConflict: 'user_id,session_date' });

  if (error) { showToast('Erreur sauvegarde séance', 'error'); return; }

  showToast(`Séance complétée · ${n} exercice${n>1?'s':''}`, 'success');
  // Refresh logs and go back to home
  renfoSessionLogs = renfoSessionLogs.filter(l => l.session_date !== todayStr);
  renfoSessionLogs.unshift({ session_date: todayStr, day_key: dayKey, completed_exercises: completed });
  VLState.renfoSessionLogs = renfoSessionLogs;
  renderRenfoHome();
}

function showRenfoProgramView() {
  const el = document.getElementById('renfoApp');
  if (!el || !renfoProgram) return;
  const sched = renfoProgram.week_schedule || {};

  // This week done focuses
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const thisWeekDone = new Set(
    renfoSessionLogs
      .filter(l => new Date(l.session_date) >= weekStart)
      .map(l => sched[l.day_key]?.focus)
      .filter(Boolean)
  );

  // Unique non-rest sessions in program order
  const sessions = DAYS
    .map((d, i) => ({ dayKey: d, session: sched[d], letter: String.fromCharCode(65 + i) }))
    .filter(({ session }) => session && !session.rest);

  let letterIdx = 0;
  const cards = sessions.map(({ dayKey, session }) => {
    const col = RENFO_FOCUS_COLORS[session.focus] || 'var(--vl-ember)';
    const done = thisWeekDone.has(session.focus);
    const letter = String.fromCharCode(65 + letterIdx++);
    const notes = session.timing_notes || FOCUS_META[session.focus]?.timing_notes || [];

    const timingBadges = notes.map(note => {
      const bg = note.startsWith('✅') ? 'rgba(34,197,94,.12)' : note.startsWith('⚠') ? 'rgba(234,179,8,.12)' : 'rgba(239,68,68,.12)';
      const tc = note.startsWith('✅') ? '#22c55e' : note.startsWith('⚠') ? '#eab308' : '#ef4444';
      const label = note.replace(/^[✅⚠️❌]️?\s*/, '');
      return `<div style="display:flex;align-items:flex-start;gap:7px;font-size:.62rem;padding:4px 8px;background:${bg};border-radius:6px;color:${tc};font-family:var(--vl-mono);line-height:1.4"><div style="width:6px;height:6px;border-radius:50%;background:${tc};flex-shrink:0;margin-top:3px"></div><div>${label}</div></div>`;
    }).join('');

    const exoList = session.exercises.map(e => {
      const def = RENFO_EXERCISES[e.exercise_id];
      if (!def) return '';
      const v = def.variants.find(vv => vv.id === e.variant_id) || def.variants[0];
      return `<div style="font-size:.72rem;color:var(--vl-text-2);margin-bottom:2px">· ${def.name_fr} — ${v.name} · ${e.sets}×${e.reps}</div>`;
    }).join('');

    return `<div class="card" style="padding:14px 16px;margin-bottom:10px${done ? ';opacity:.65' : ''}">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px">
        <div style="width:30px;height:30px;border-radius:50%;background:${done ? col : 'transparent'};border:2px solid ${col};display:flex;align-items:center;justify-content:center;font-family:var(--vl-mono);font-size:.65rem;font-weight:700;color:${done ? '#fff' : col};flex-shrink:0">${done ? _ICON_CHECK : letter}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--vl-mono);font-size:.52rem;letter-spacing:.1em;color:${col};margin-bottom:2px">${(session.focus||'').replace(/_/g,' ').toUpperCase()}</div>
          <div style="font-family:var(--vl-display);font-size:1rem;font-weight:700">${session.label}</div>
          <div style="font-size:.68rem;color:var(--vl-text-2)">~${session.duration_min} min · ${session.exercises.length} exercices · ${session.location}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">${timingBadges}</div>
      <div style="margin-bottom:${done ? '0' : '10px'}">${exoList}</div>
      ${!done
        ? `<button onclick="startRenfoSession('${dayKey}')" style="width:100%;padding:11px;background:${col};border:none;border-radius:10px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:.85rem;font-weight:700;letter-spacing:.04em;touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:8px">${_ICON_PLAY} LANCER</button>`
        : `<div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:.65rem;color:var(--vl-text-2);font-family:var(--vl-mono);padding-top:4px">${_ICON_CHECK} Fait cette semaine</div>`}
    </div>`;
  }).join('');

  el.innerHTML = `<div style="padding-bottom:8px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem">
      <button onclick="renderRenfoHome()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:6px;touch-action:manipulation;display:flex;align-items:center">${_ICON_ARROW_LEFT}</button>
      <div style="font-family:var(--vl-display);font-size:1.5rem;font-weight:800">Programme</div>
    </div>
    <div style="font-size:.72rem;color:var(--vl-text-2);font-family:var(--vl-mono);margin-bottom:16px">Choisis ta séance selon ton planning — aucun jour n'est fixe.</div>
    ${cards}
  </div>`;
}

export function showRenfoHistoryView() {
  showToast('Historique — disponible dans la prochaine version', 'info');
}

export async function showRenfoSettings() {
  if (!renfoProfile) return;
  const el = document.getElementById('renfoApp');

  el.innerHTML = `<div style="padding-bottom:8px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem">
      <button onclick="renderRenfoHome()" style="background:none;border:none;cursor:pointer;color:var(--vl-text-2);padding:6px;touch-action:manipulation;display:flex;align-items:center">${_ICON_ARROW_LEFT}</button>
      <div style="font-family:var(--vl-display);font-size:1.5rem;font-weight:800">Réglages Renfo</div>
    </div>
    <div class="card" style="padding:16px;margin-bottom:12px">
      <div class="clabel" style="margin-bottom:12px">OBJECTIF</div>
      ${[
        [25,'Renforcement préventif'],[50,'Équilibré'],[75,'Performance']
      ].map(([v,t])=>`<button class="vl-ob-btn" data-val="${v}" data-type="obj" onclick="renfoObSelect(this)" style="display:block;width:100%;text-align:left;padding:12px;background:${renfoProfile.objective_weight===v?'rgba(229,86,42,.1)':'var(--vl-bg2)'};border:1.5px solid ${renfoProfile.objective_weight===v?'var(--vl-ember)':'var(--vl-border)'};border-radius:10px;cursor:pointer;color:var(--vl-text);margin-bottom:8px;touch-action:manipulation">
        <span style="font-size:.85rem">${t}</span>
      </button>`).join('')}
    </div>
    <div class="card" style="padding:16px;margin-bottom:12px">
      <div class="clabel" style="margin-bottom:12px">SÉANCES / SEMAINE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${[1,3,5,6].map(v=>`<button class="vl-ob-btn" data-val="${v}" data-type="spw" onclick="renfoObSelect(this)" style="padding:12px;background:${renfoProfile.sessions_per_week===v?'rgba(229,86,42,.1)':'var(--vl-bg2)'};border:1.5px solid ${renfoProfile.sessions_per_week===v?'var(--vl-ember)':'var(--vl-border)'};border-radius:10px;cursor:pointer;color:var(--vl-text);touch-action:manipulation">
          <span style="font-family:var(--vl-display);font-size:1.2rem;font-weight:700">${v}</span>
          <div style="font-size:.65rem;color:var(--vl-text-2)">séance${v>1?'s':''}/sem</div>
        </button>`).join('')}
      </div>
    </div>
    <button onclick="saveRenfoSettings()" style="width:100%;padding:14px;background:var(--vl-ember);border:none;border-radius:12px;cursor:pointer;color:#fff;font-family:var(--vl-display);font-size:1rem;font-weight:700;touch-action:manipulation">Sauvegarder & Régénérer</button>
    <button onclick="resetRenfoOnboarding()" style="width:100%;padding:12px;background:none;border:1.5px solid var(--vl-border);border-radius:12px;cursor:pointer;color:var(--vl-text-2);font-family:var(--vl-mono);font-size:.75rem;margin-top:10px;touch-action:manipulation">Recommencer l'onboarding</button>
  </div>`;

  _renfoOnboarding = { ...renfoProfile };
}

export async function saveRenfoSettings() {
  const updated = {
    ...renfoProfile,
    objective_weight: _renfoOnboarding.objective_weight ?? renfoProfile.objective_weight,
    sessions_per_week: _renfoOnboarding.sessions_per_week ?? renfoProfile.sessions_per_week
  };
  const { error } = await sb.from('renfo_profile').upsert(updated);
  if (error) { showToast('Erreur sauvegarde', 'error'); return; }
  renfoProfile = updated;

  const schedule = generateRenfoProgram(updated);
  await sb.from('renfo_program').upsert({
    user_id: VLState.currentUser.id,
    week_schedule: schedule,
    generated_at: new Date().toISOString(),
    generation_inputs: updated
  });
  renfoProgram = { week_schedule: schedule };
  VLState.renfoProgram = renfoProgram;
  showToast('Programme ajusté à ton nouveau profil', 'success');
  renderRenfoHome();
}

export async function resetRenfoOnboarding() {
  await sb.from('renfo_profile').upsert({ user_id: VLState.currentUser.id, onboarding_completed: false });
  renfoProfile = null;
  _renfoOnboarding = {};
  renderOnboardingStep(1);
}

