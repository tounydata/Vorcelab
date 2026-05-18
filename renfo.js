// ============================================================
// VORCELAB — MODULE RENFORCEMENT MUSCULAIRE
// ============================================================

const RENFO_EXERCISES = {

  // ── FORCE LOURDE ──────────────────────────────────────────

  squat_lourd: {
    id: 'squat_lourd',
    name_fr: 'Squat',
    name_tech: 'Back squat',
    category: 'force_lourde',
    primary_muscles: ['quadriceps', 'fessiers'],
    benefits: ['force_max', 'economie_course', 'prevention_blessure'],
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
    name_fr: 'Soulevé jambes tendues',
    name_tech: 'Romanian Deadlift',
    category: 'force_lourde',
    primary_muscles: ['ischio-jambiers', 'fessiers', 'bas du dos'],
    benefits: ['force_max', 'prevention_blessure', 'descente_trail'],
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
    benefits: ['force_max', 'prevention_blessure', 'stabilite'],
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
    name_fr: 'Mollets lourds',
    name_tech: 'Calf raise (loaded)',
    category: 'force_lourde',
    primary_muscles: ['gastrocnémien', 'soléaire'],
    benefits: ['force_max', 'prevention_blessure', 'economie_course'],
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
    name_fr: 'Sauts pogo',
    name_tech: 'Pogo jumps',
    category: 'pliometrie',
    primary_muscles: ['mollets', 'tendons d\'Achille'],
    benefits: ['economie_course', 'prevention_blessure'],
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
    name_fr: 'Drop jumps',
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
    name_fr: 'Skips',
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
    name_fr: 'Step down excentrique',
    name_tech: 'Eccentric step down',
    category: 'excentrique',
    primary_muscles: ['quadriceps', 'genou'],
    benefits: ['prevention_blessure', 'descente_trail', 'stabilite'],
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
    benefits: ['prevention_blessure', 'descente_trail'],
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
    youtube_search: 'nordic curl ischio prévention blessure'
  },

  mollet_excentrique: {
    id: 'mollet_excentrique',
    name_fr: 'Mollet excentrique',
    name_tech: 'Eccentric calf raise (Alfredson)',
    category: 'excentrique',
    primary_muscles: ['gastrocnémien', 'soléaire', 'tendon d\'Achille'],
    benefits: ['prevention_blessure', 'economie_course'],
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
    name_fr: 'RDL unilatéral',
    name_tech: 'Single-leg RDL',
    category: 'excentrique',
    primary_muscles: ['ischio-jambiers', 'fessiers', 'stabilisateurs cheville'],
    benefits: ['prevention_blessure', 'stabilite', 'descente_trail'],
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
    benefits: ['stabilite', 'prevention_blessure', 'economie_course'],
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
    name_fr: 'Planche latérale hip drop',
    name_tech: 'Side plank with hip drop',
    category: 'tronc',
    primary_muscles: ['obliques', 'abducteurs', 'fessier moyen'],
    benefits: ['stabilite', 'prevention_blessure'],
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
    benefits: ['stabilite', 'posture', 'prevention_blessure'],
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
    name_fr: 'Farmer carry unilatéral',
    name_tech: 'Suitcase carry',
    category: 'tronc',
    primary_muscles: ['obliques', 'quadratus lumborum', 'trapèzes'],
    benefits: ['stabilite', 'prevention_blessure', 'posture'],
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
    benefits: ['posture', 'prevention_blessure'],
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
    benefits: ['posture', 'prevention_blessure'],
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
    name_fr: 'YTW allongé',
    name_tech: 'YTW prone (scapular)',
    category: 'haut_corps',
    primary_muscles: ['trapèzes inférieurs', 'rhomboïdes', 'deltoïdes postérieurs'],
    benefits: ['posture', 'prevention_blessure'],
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
    name_fr: 'Hip 90/90',
    name_tech: 'Hip 90/90 stretch',
    category: 'mobilite',
    primary_muscles: ['rotateurs de hanche', 'fléchisseurs de hanche'],
    benefits: ['stabilite', 'prevention_blessure'],
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
    benefits: ['prevention_blessure', 'stabilite'],
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
    common_errors: 'Position passive sans activation musculaire. Tibia avant trop vertical (risque genou). Ne pas s\'écraser vers l\'avant.',
    youtube_search: 'pigeon actif mobilité hanche trail'
  },

  knee_to_wall: {
    id: 'knee_to_wall',
    name_fr: 'Mobilité cheville (knee to wall)',
    name_tech: 'Knee to wall / Wall ankle mobility',
    category: 'mobilite',
    primary_muscles: ['cheville', 'mollet', 'tendon Achille'],
    benefits: ['prevention_blessure', 'economie_course'],
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
    name_fr: 'Open book (rotation thoracique)',
    name_tech: 'Open book thoracic rotation',
    category: 'mobilite',
    primary_muscles: ['thoracique', 'pectoraux', 'épaules'],
    benefits: ['posture', 'prevention_blessure'],
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
    name_fr: 'Monster walk',
    name_tech: 'Monster walk (banded)',
    category: 'mobilite',
    primary_muscles: ['fessier moyen', 'abducteurs', 'stabilisateurs genou'],
    benefits: ['prevention_blessure', 'stabilite'],
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
  force_lourde:           ['squat_lourd','rdl','bulgare','mollets_lourds'],
  pliometrie:             ['pogo_jumps','bondissements','drop_jumps','skips'],
  excentrique:            ['step_down','nordic','mollet_excentrique','single_leg_rdl'],
  excentrique_pliometrie: ['step_down','nordic','pogo_jumps','bondissements'],
  tronc:                  ['pallof_press','side_plank_hipdrop','dead_bug','bird_dog','suitcase_carry'],
  haut_corps:             ['tractions_or_row','pompes','face_pull','ytw_prone'],
  mobilite:               ['hip_9090','pigeon_actif','knee_to_wall','open_book','monster_walk']
};

const FOCUS_META = {
  force_lourde:           { label: 'Force lourde', duration_min: 55, location: 'salle_ou_maison' },
  pliometrie:             { label: 'Pliométrie', duration_min: 35, location: 'exterieur_ou_maison' },
  excentrique:            { label: 'Excentrique', duration_min: 40, location: 'maison' },
  excentrique_pliometrie: { label: 'Excentrique + Pliométrie', duration_min: 45, location: 'maison' },
  tronc:                  { label: 'Tronc & stabilité', duration_min: 30, location: 'maison' },
  haut_corps:             { label: 'Haut du corps', duration_min: 40, location: 'maison' },
  mobilite:               { label: 'Mobilité active', duration_min: 25, location: 'maison' }
};

function buildSession(focus, profile) {
  const meta = FOCUS_META[focus] || FOCUS_META['tronc'];
  const exoIds = SESSION_EXERCISES[focus] || [];
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

  return {
    focus,
    label: meta.label,
    duration_min: meta.duration_min,
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
      return Math.round(currentLoad * 0.95 * 2) / 2;
    return currentLoad;
  }

  if (last.rpe <= 7) return currentLoad + 5;
  if (last.rpe === 8) return currentLoad + 2.5;
  if (last.rpe === 9) return currentLoad;
  if (last.rpe >= 10) return Math.round(currentLoad * 0.95 * 2) / 2;
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
