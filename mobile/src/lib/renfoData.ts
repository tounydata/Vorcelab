 
// ============================================================
// VORCELAB — RENFO DATA (static data only)
// ============================================================


export const RENFO_FOCUS_COLORS: Record<string, string> = {
  force_lourde:'#E5562A', pliometrie:'#f39c12', excentrique:'#3498db',
  excentrique_pliometrie:'#e67e22', tronc:'#9b59b6', haut_corps:'#1abc9c', mobilite:'#2ecc71',
  yoga_coureur:'#4ade80', stretching:'#2dd4bf',
};

export function gifPlaceholder(category: string, variant: string) {
  const c = RENFO_FOCUS_COLORS[category] || '#7c3aed';
  if (variant === 'thumb') return `<div style="width:66px;height:66px;border-radius:8px;border:1px solid ${c}55;flex-shrink:0;background:${c}18"></div>`;
  return `<div style="margin-bottom:14px;border-radius:10px;border:1px solid ${c}55;background:${c}0f;height:140px;display:flex;align-items:center;justify-content:center"><span style="font-family:var(--vl-mono);font-size:.55rem;color:${c};letter-spacing:.08em;opacity:.8">DÉMO À VENIR</span></div>`;
}

export function fmtRest(s: number){ const m=Math.floor(s/60),r=s%60; return m>0?(r>0?m+'min'+r+'s':m+'min'):s+'s'; }

export const RENFO_EXERCISES: Record<string, any> = {

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
        default_sets: 5, default_reps: 4, target_rpe: 8.5,
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
        default_sets: 4, default_reps: 5, target_rpe: 8.5,
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
    common_errors: 'Rotation du bassin pour aider (invalide l\'exercice). Bras pas complètement tendus. S\'éloigner trop du point d\'ancrage. À la maison : bande élastique ancrée à hauteur de taille (même mouvement anti-rotation).',
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
    common_errors: 'Balancement du corps. Hausser les épaules. Chin trop en avant. À la maison sans barre : tirage inversé sous une table solide, ou tirage à la bande élastique.',
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
    common_errors: 'Coudes qui descendent (devient un tirage basse). Corps qui bascule en arrière. Pas de rotation externe de l\'épaule. À la maison : bande élastique passée autour d\'un point d\'ancrage haut (poignée, porte).',
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

  balance_unipodal: {
    id: 'balance_unipodal',
    name_fr: 'Équilibre unipodal',
    name_tech: 'Single-leg balance (proprioception)',
    category: 'mobilite',
    primary_muscles: ['stabilisateurs cheville', 'pied', 'fessier moyen'],
    benefits: ['stabilite', 'resilience'],
    variants: [
      {
        id: 'balance_sol',
        name: 'Équilibre au sol',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['yeux ouverts', 'yeux fermés', 'tête qui tourne'],
        unit: 's',
        default_sets: 3, default_reps: 40, target_rpe: 5,
        rest_seconds: 20
      },
      {
        id: 'balance_instable',
        name: 'Équilibre sur surface instable',
        required_equipment: {},
        priority: 2,
        load_type: 'bodyweight_variant',
        load_variant_options: ['coussin / oreiller', 'avec lancers de balle', 'mini-squats'],
        unit: 's',
        default_sets: 3, default_reps: 40, target_rpe: 6,
        rest_seconds: 20
      }
    ],
    position: 'Debout sur une jambe, genou légèrement fléchi (souple, pas verrouillé). Bassin horizontal, regard à l\'horizon. Pied d\'appui ancré, orteils relâchés.',
    movement: 'Tenir l\'équilibre sans osciller ni poser le pied libre. Progresser : yeux ouverts → yeux fermés → surface instable (coussin). Si trop facile, tourner la tête lentement. 30-45 s par jambe.',
    common_errors: 'Verrouiller le genou d\'appui. Bassin qui s\'affaisse côté jambe libre (manque de moyen fessier). S\'agripper en crispant les orteils. Bloquer sa respiration.',
    youtube_search: 'single leg balance proprioception cheville prévention entorse coureur'
  },

  y_balance: {
    id: 'y_balance',
    name_fr: 'Y-balance (touches dirigées)',
    name_tech: 'Y-balance / Star excursion',
    category: 'mobilite',
    primary_muscles: ['stabilisateurs cheville', 'fessier moyen', 'quadriceps'],
    benefits: ['stabilite', 'resilience'],
    variants: [
      {
        id: 'y_balance_bw',
        name: 'Y-balance poids de corps',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['3 directions', 'amplitude réduite (débutant)'],
        default_sets: 2, default_reps: 6, target_rpe: 6,
        rest_seconds: 30
      }
    ],
    position: 'Debout sur une jambe, mains aux hanches, genou d\'appui légèrement fléchi. Jambe libre prête à aller chercher loin.',
    movement: 'Avec la jambe libre, tendre le pied le plus loin possible et effleurer le sol : devant, diagonale arrière-interne, diagonale arrière-externe. Revenir au centre en contrôle sans poser le pied d\'appui. 6 touches par direction et par jambe.',
    common_errors: 'Poser le pied d\'appui / perdre l\'équilibre (réduire l\'amplitude). Pencher tout le buste au lieu de tendre la jambe. Genou d\'appui qui part vers l\'intérieur.',
    youtube_search: 'y balance star excursion équilibre dynamique cheville coureur'
  },

  hop_and_stick: {
    id: 'hop_and_stick',
    name_fr: 'Saut-stabilisation unipodal',
    name_tech: 'Hop and stick',
    category: 'pliometrie',
    primary_muscles: ['mollets', 'quadriceps', 'stabilisateurs cheville/genou'],
    benefits: ['resilience', 'stabilite'],
    variants: [
      {
        id: 'hop_stick_av',
        name: 'Saut + réception figée',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['petit saut avant', 'distance moyenne', 'latéral'],
        default_sets: 3, default_reps: 5, target_rpe: 7,
        rest_seconds: 60
      }
    ],
    position: 'Debout sur une jambe, genou souple, bras prêts à équilibrer.',
    movement: 'Petit saut (avant ou latéral), atterrir sur UNE jambe en amortissant (genou fléchi, hanche en arrière). FIGER l\'atterrissage 2 s sans osciller ni laisser le genou rentrer. 5 par jambe. Le contrôle prime sur la distance.',
    common_errors: 'Atterrir raide (genou tendu). Genou qui s\'effondre vers l\'intérieur (valgus). Continuer à sautiller sans figer. Chercher la distance au détriment du contrôle.',
    youtube_search: 'hop and stick single leg landing contrôle genou cheville trail'
  },

  ankle_hops: {
    id: 'ankle_hops',
    name_fr: 'Sauts de cheville',
    name_tech: 'Ankle hops',
    category: 'pliometrie',
    primary_muscles: ['mollets', 'tendon d\'Achille', 'pied'],
    benefits: ['economie_course', 'resilience'],
    variants: [
      {
        id: 'ankle_hops_bip',
        name: 'Sauts de cheville bipodal',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['sur place', 'avant/arrière'],
        default_sets: 3, default_reps: 20, target_rpe: 6,
        rest_seconds: 60
      }
    ],
    position: 'Debout, pieds largeur de hanches, jambes quasi tendues, cheville raide, appui sur l\'avant-pied.',
    movement: 'Petits rebonds rapides en restant sur l\'avant-pied, contact au sol le plus court possible (< 250 ms). Amplitude minimale, fréquence élevée. C\'est l\'entrée la plus douce en pliométrie — prépare tendons et raideur avant le pogo.',
    common_errors: 'Plier les genoux (ça devient un squat jump). Contacts longs et mous. Talons qui touchent le sol.',
    youtube_search: 'ankle hops pliométrie débutant raideur cheville coureur'
  },

  sl_pogo: {
    id: 'sl_pogo',
    name_fr: 'Sauts unipodaux',
    name_tech: 'Single-leg pogo / hops',
    category: 'pliometrie',
    primary_muscles: ['mollets', 'quadriceps', 'stabilisateurs cheville/genou'],
    benefits: ['economie_course', 'resilience'],
    variants: [
      {
        id: 'sl_pogo_place',
        name: 'Pogo unipodal',
        required_equipment: {},
        priority: 1,
        load_type: 'bodyweight_variant',
        load_variant_options: ['sur place', 'vers l\'avant', 'continu'],
        default_sets: 3, default_reps: 10, target_rpe: 8,
        rest_seconds: 90
      }
    ],
    position: 'En équilibre sur une jambe, genou souple, cheville raide, appui sur l\'avant-pied.',
    movement: 'Rebonds rapides sur UNE jambe, contact court, genou qui reste dans l\'axe du pied. La course étant unipodale, c\'est le saut le plus spécifique. 10 par jambe, contrôle > hauteur. Progression : sur place → vers l\'avant → continu.',
    common_errors: 'Genou qui rentre vers l\'intérieur. Contacts longs. Partir en rotation / perdre l\'axe.',
    youtube_search: 'single leg pogo hops pliométrie spécifique course unipodal'
  },

  deadlift: {
    id: 'deadlift',
    name_fr: 'Soulevé de terre lourd',
    name_tech: 'Deadlift (trap-bar / barre)',
    category: 'force_lourde',
    primary_muscles: ['chaîne postérieure', 'fessiers', 'ischio-jambiers', 'dorsaux'],
    benefits: ['force_max', 'economie_course', 'resilience'],
    variants: [
      { id: 'deadlift_barre', name: 'Soulevé barre (trap-bar idéal)', required_equipment: { barbell: true }, priority: 1, load_type: 'external_kg', default_sets: 4, default_reps: 4, target_rpe: 8.5, rest_seconds: 150 },
      { id: 'deadlift_haltere', name: 'Soulevé haltères / kettlebell', required_equipment_any: [{ dumbbells_max_kg: 24 }], priority: 2, load_type: 'external_kg', default_sets: 4, default_reps: 8, target_rpe: 8, rest_seconds: 120 }
    ],
    position: 'Pieds largeur de hanches, barre (ou trap-bar) contre les tibias. Dos neutre, gainage serré, épaules au-dessus de la barre, regard devant.',
    movement: 'Pousser le sol avec les jambes en gardant le dos neutre ; hanches et épaules montent ENSEMBLE. Finir hanches verrouillées (fessiers serrés), sans hyperextension. Descendre contrôlé en repoussant les hanches vers l\'arrière. Charge lourde : 3-5 reps (force max → économie de course).',
    common_errors: 'Dos rond (lombaires). Barre qui s\'éloigne des jambes. Hanches qui montent avant les épaules (bon-matin). Hyperextension en haut.',
    youtube_search: 'trap bar deadlift soulevé de terre force coureur économie de course'
  },



  hip_thrust: {
    id: 'hip_thrust',
    name_fr: 'Hip thrust',
    name_tech: 'Pont de hanche chargé',
    category: 'force_lourde',
    primary_muscles: ['grand fessier', 'ischio-jambiers'],
    benefits: ['force_max', 'economie_course', 'resilience'],
    variants: [
      { id: 'hip_thrust_barbell', name: 'Hip thrust barre', required_equipment: { barbell: true, bench: true }, priority: 1, load_type: 'external_kg', default_sets: 4, default_reps: 5, target_rpe: 8.5, rest_seconds: 120 },
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
    category: 'mobilite',
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
  },
  // ── NOUVEAUX EXERCICES TRAIL-SPÉCIFIQUES ──────────────────────────────────

  step_up: {
    id: 'step_up',
    name_fr: 'Montée de marche',
    name_tech: 'Step-up',
    category: 'force_lourde',
    primary_muscles: ['quadriceps', 'grand fessier', 'ischio-jambiers'],
    benefits: ['force_max', 'stabilite', 'montee_trail'],
    variants: [
      { id: 'step_up_halteres', name: 'Step-up haltères', required_equipment_any: [{ dumbbells_max_kg: 12 }], priority: 1, load_type: 'external_kg', default_sets: 3, default_reps: 10, target_rpe: 8, rest_seconds: 90 },
      { id: 'step_up_kb', name: 'Step-up kettlebell', required_equipment_any: [{ kettlebell_max_kg: 12 }], priority: 2, load_type: 'external_kg', default_sets: 3, default_reps: 10, target_rpe: 8, rest_seconds: 90 },
      { id: 'step_up_bw', name: 'Step-up poids de corps', required_equipment: { step: true }, priority: 3, load_type: 'bodyweight_variant', load_variant_options: ['step 20cm', 'step 40cm', 'step 60cm'], default_sets: 3, default_reps: 12, target_rpe: 7, rest_seconds: 60 },
    ],
    position: 'Debout face au step ou à la marche. Un pied posé à plat sur le step. Corps droit, regard devant.',
    movement: 'Pousser dans le talon du pied haut pour monter. Corps droit, hanche haute. Redescendre lentement (2-3s). Compléter toutes les reps d\'un côté avant de changer. C\'est le concentrique de la montée trail.',
    common_errors: 'S\'appuyer sur la jambe basse pour aider (genou qui pousse). Pencher le buste en avant. Descendre trop vite (perdre le bénéfice excentrique de descente).',
    youtube_search: 'step up trail runner haltères montée',
  },

  lateral_lunge: {
    id: 'lateral_lunge',
    name_fr: 'Fente latérale',
    name_tech: 'Lateral lunge',
    category: 'force_lourde',
    primary_muscles: ['adducteurs', 'quadriceps', 'grand fessier'],
    benefits: ['stabilite', 'trail_technique', 'prevention_blessure'],
    variants: [
      { id: 'lateral_lunge_halteres', name: 'Fente latérale haltères', required_equipment_any: [{ dumbbells_max_kg: 10 }], priority: 1, load_type: 'external_kg', default_sets: 3, default_reps: 10, target_rpe: 7, rest_seconds: 90 },
      { id: 'lateral_lunge_bw', name: 'Fente latérale poids de corps', required_equipment: {}, priority: 2, load_type: 'bodyweight_variant', load_variant_options: ['standard', 'avec pause 2s en bas', 'avec toucher de sol'], default_sets: 3, default_reps: 12, target_rpe: 7, rest_seconds: 60 },
    ],
    position: 'Debout, pieds joints. Haltères tenus à la poitrine ou le long des cuisses.',
    movement: 'Grand pas latéral. Descendre en pliant le genou de la jambe d\'appui. L\'autre jambe reste tendue. Genou dans l\'axe du pied. Pied à plat. Remonter en poussant dans le talon. Alterner.',
    common_errors: 'Genou en valgus (rentre vers l\'intérieur). Pied de la jambe tendue qui décolle. Pencher le buste en avant.',
    youtube_search: 'lateral lunge fente latérale trail adducteurs',
  },

  single_leg_squat: {
    id: 'single_leg_squat',
    name_fr: 'Squat unilatéral',
    name_tech: 'Single-leg squat / Pistol squat',
    category: 'excentrique',
    primary_muscles: ['quadriceps', 'grand fessier', 'stabilisateurs cheville'],
    benefits: ['resilience', 'stabilite', 'descente_trail'],
    variants: [
      { id: 'slsquat_chaise', name: 'SL squat vers chaise', required_equipment: { bench: true }, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['chaise haute 45cm', 'chaise basse 30cm'], default_sets: 3, default_reps: 8, target_rpe: 8, rest_seconds: 90 },
      { id: 'slsquat_contrepoids', name: 'SL squat contre-poids', required_equipment_any: [{ dumbbells_max_kg: 5 }], priority: 2, load_type: 'external_kg', default_sets: 3, default_reps: 6, target_rpe: 8, rest_seconds: 90 },
      { id: 'slsquat_porte', name: 'SL squat à la porte', required_equipment: {}, priority: 3, load_type: 'bodyweight_variant', load_variant_options: ['amplitude partielle', 'amplitude complète'], default_sets: 3, default_reps: 5, target_rpe: 9, rest_seconds: 90 },
    ],
    position: 'Debout sur une jambe. Jambe libre légèrement en avant. Bras devant ou tenu à l\'appui.',
    movement: 'Descendre lentement (3-4s) sur la jambe d\'appui jusqu\'à 90°. Genou dans l\'axe du pied, ne pas effondrer en dedans. Remonter. La descente excentrique est le cœur du bénéfice.',
    common_errors: 'Genou en valgus à la descente. Compensation par le bas du dos. Aller trop vite (perdre le bénéfice excentrique). Cheville qui s\'effondre.',
    youtube_search: 'single leg squat pistol progression trail runner',
  },

  // ── YOGA DU COUREUR ───────────────────────────────────────────────────────

  low_lunge: {
    id: 'low_lunge',
    name_fr: 'Fente basse yoga',
    name_tech: 'Low lunge / Anjaneyasana',
    category: 'yoga_coureur',
    primary_muscles: ['fléchisseurs de hanche', 'quadriceps', 'mollets'],
    benefits: ['mobilite_hanche', 'posture', 'resilience'],
    variants: [
      { id: 'low_lunge_sol', name: 'Fente basse au sol', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['statique', 'avec bras levés', 'avec rotation'], unit: 's', default_sets: 2, default_reps: 90, target_rpe: 5, rest_seconds: 15 },
    ],
    position: 'Au sol en fente. Genou arrière posé sur un tapis. Cuisse avant verticale. Buste droit.',
    movement: 'Pousser doucement le bassin vers l\'avant et le bas. Tenir 90s par côté. Respirer profondément, chercher à s\'enfoncer à chaque expiration. Option : lever les bras pour plus d\'ouverture des hanches.',
    common_errors: 'Genou avant qui dépasse les orteils. Arrondir le dos. Retenir sa respiration. Ne pas laisser le bassin s\'ouvrir.',
    youtube_search: 'low lunge yoga hip flexor coureur',
  },

  downward_dog: {
    id: 'downward_dog',
    name_fr: 'Chien tête en bas',
    name_tech: 'Downward Dog / Adho Mukha Svanasana',
    category: 'yoga_coureur',
    primary_muscles: ['ischio-jambiers', 'mollets', 'grand dorsal', 'épaules'],
    benefits: ['resilience', 'posture', 'mobilite_hanche'],
    variants: [
      { id: 'down_dog_bw', name: 'Chien tête en bas', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['genoux légèrement fléchis', 'jambes tendues'], unit: 's', default_sets: 1, default_reps: 60, target_rpe: 4, rest_seconds: 15 },
    ],
    position: 'En V inversé. Mains posées à largeur d\'épaules, doigts écartés. Pieds largeur de hanches. Talons cherchent le sol.',
    movement: 'Pousser le sol avec les mains, monter les hanches. Allonger la colonne. Alterner talons qui s\'abaissent l\'un après l\'autre (pédalage). Tenir 60s.',
    common_errors: 'Dos qui s\'arrondit. Poids trop sur les poignets. Épaules qui rentrent vers les oreilles.',
    youtube_search: 'downward dog yoga runners ischio mollets',
  },

  child_pose: {
    id: 'child_pose',
    name_fr: 'Posture de l\'enfant',
    name_tech: 'Child\'s pose / Balasana',
    category: 'yoga_coureur',
    primary_muscles: ['grand dorsal', 'fessiers', 'épaules'],
    benefits: ['posture', 'resilience'],
    variants: [
      { id: 'child_pose_bw', name: 'Posture de l\'enfant', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['bras tendus devant', 'bras le long du corps'], unit: 's', default_sets: 1, default_reps: 60, target_rpe: 3, rest_seconds: 10 },
    ],
    position: 'À genoux, fesses sur les talons. Se pencher en avant en allongeant les bras devant soi. Front contre le sol.',
    movement: 'Relâcher complètement le dos et les épaules. Respirer en gonflant le dos. Laisser la gravité étirer les dorsaux. Tenir 60s en récupération active.',
    common_errors: 'Fesses qui ne touchent pas les talons (mettre un coussin si besoin). Corps contracté. Respiration superficielle.',
    youtube_search: 'child pose yoga recovery runners dorsal',
  },

  reclined_twist: {
    id: 'reclined_twist',
    name_fr: 'Torsion couchée',
    name_tech: 'Reclined spinal twist / Supta Matsyendrasana',
    category: 'yoga_coureur',
    primary_muscles: ['piriforme', 'thoracique', 'psoas'],
    benefits: ['mobilite_hanche', 'posture', 'resilience'],
    variants: [
      { id: 'reclined_twist_bw', name: 'Torsion couchée', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['genou fléchi 90°', 'jambe tendue'], unit: 's', default_sets: 2, default_reps: 90, target_rpe: 4, rest_seconds: 10 },
    ],
    position: 'Allongé sur le dos. Ramener un genou vers la poitrine, puis le faire basculer vers l\'autre côté. Bras en croix.',
    movement: 'Laisser le genou tomber vers le sol en gardant les deux épaules plaquées. Regarder vers le côté opposé. 90s par côté. Excellent pour le piriforme et les lombaires post-sortie.',
    common_errors: 'Épaule qui décolle du sol. Forcer le genou vers le bas. Ne pas tenir assez longtemps.',
    youtube_search: 'reclined spinal twist yoga piriforme runner',
  },

  butterfly: {
    id: 'butterfly',
    name_fr: 'Papillon assis',
    name_tech: 'Butterfly / Baddha Konasana',
    category: 'yoga_coureur',
    primary_muscles: ['adducteurs', 'piriforme', 'fléchisseurs de hanche'],
    benefits: ['mobilite_hanche', 'resilience'],
    variants: [
      { id: 'butterfly_bw', name: 'Papillon assis', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['statique', 'avec inclinaison avant'], unit: 's', default_sets: 1, default_reps: 90, target_rpe: 4, rest_seconds: 10 },
    ],
    position: 'Assis au sol. Plantes des pieds collées ensemble, genoux vers l\'extérieur. Tenir les pieds avec les mains.',
    movement: 'Laisser les genoux descendre vers le sol. Option : se pencher en avant pour approfondir. Respirer. Tenir 90s.',
    common_errors: 'Dos arrondi. Pousser activement les genoux vers le bas avec les coudes (forcer). Pieds trop proches du bassin (écarter si trop intense).',
    youtube_search: 'butterfly pose yoga adducteurs groin runner',
  },

  // ── STRETCHING POST-RUN ────────────────────────────────────────────────────

  ischio_debout: {
    id: 'ischio_debout',
    name_fr: 'Étirement ischio debout',
    name_tech: 'Standing hamstring stretch',
    category: 'stretching',
    primary_muscles: ['ischio-jambiers'],
    benefits: ['resilience'],
    variants: [
      { id: 'ischio_debout_bw', name: 'Ischio debout classique', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['jambe tendue sur step', 'jambe tendue sur sol'], unit: 's', default_sets: 2, default_reps: 45, target_rpe: 4, rest_seconds: 10 },
    ],
    position: 'Debout. Poser un talon sur une surface (step, marche) à hauteur de hanche. Jambe tendue.',
    movement: 'Pencher le buste en avant en gardant le dos droit. Chercher à allonger la hamstring. Tenir 45s par côté. L\'étirement se sent à l\'arrière de la cuisse, jamais derrière le genou.',
    common_errors: 'Arrondir le dos (flexion de colonne au lieu de hanche). Genou de la jambe étirée qui fléchit. Étirement trop agressif juste après l\'effort.',
    youtube_search: 'étirement ischio debout hamstring running',
  },

  gastrocnemien_stretch: {
    id: 'gastrocnemien_stretch',
    name_fr: 'Étirement gastrocnémien',
    name_tech: 'Gastrocnemius stretch',
    category: 'stretching',
    primary_muscles: ['gastrocnémien'],
    benefits: ['resilience', 'economie_course'],
    variants: [
      { id: 'gastro_mur', name: 'Gastroc au mur genou tendu', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['mur', 'step'], unit: 's', default_sets: 2, default_reps: 45, target_rpe: 4, rest_seconds: 10 },
    ],
    position: 'Debout face au mur. Pied arrière en fente longue, talon au sol, jambe arrière TENDUE.',
    movement: 'Pencher le corps vers le mur (bras appui). Sentir l\'étirement dans le haut du mollet (gastrocnémien). Tenir 45s par côté. Jambe arrière ne doit pas plier.',
    common_errors: 'Genou arrière fléchi (étire le soléaire à la place). Talon qui décolle. Pivoter le pied.',
    youtube_search: 'gastrocnemius stretch mollet coureur mur',
  },


  figure_4_piriforme: {
    id: 'figure_4_piriforme',
    name_fr: 'Figure 4 piriforme',
    name_tech: 'Figure 4 stretch / Pigeon modifié',
    category: 'stretching',
    primary_muscles: ['piriforme', 'fessier moyen', 'rotateurs externes'],
    benefits: ['resilience', 'prevention_blessure'],
    variants: [
      { id: 'fig4_sol', name: 'Figure 4 au sol', required_equipment: {}, priority: 1, load_type: 'bodyweight_variant', load_variant_options: ['couché', 'assis sur chaise'], unit: 's', default_sets: 2, default_reps: 60, target_rpe: 4, rest_seconds: 10 },
    ],
    position: 'Couché sur le dos. Plier les genoux à 90°. Croiser une cheville sur le genou opposé (position figure 4).',
    movement: 'Relever la jambe qui soutient vers la poitrine. Sentir l\'étirement dans la fesse/hanche croisée. Tenir 60s par côté. Option : pression légère sur le genou qui dépasse pour plus d\'intensité.',
    common_errors: 'Dos qui se décolle du sol. Trop d\'intensité (douleur = trop). Ne pas tenir assez longtemps (min 45s).',
    youtube_search: 'figure 4 piriformis stretch fessier running',
  },


  // ── PILATES COUREUR ───────────────────────────────────────────────────────────







  // ── NOUVEAUX EXERCICES YOGA — récupération & amplitude ────────────────────

  warrior_3: {
    id: 'warrior_3', name_fr: 'Guerrier II', name_tech: 'Warrior II / Virabhadrasana II',
    category: 'yoga_coureur',
    primary_muscles: ['grand fessier', 'stabilisateurs cheville', 'chaîne postérieure'],
    benefits: ['stabilite', 'proprioception', 'equilibre_unipodal'],
    position: 'Debout sur une jambe. Bras tendus devant ou dans l\'axe du corps.',
    movement: 'Pencher le buste vers l\'avant en levant la jambe arrière jusqu\'à l\'horizontale. Corps forme une ligne droite. Tenir 30–45s par côté. Rentrer le nombril vers la colonne. Regard au sol à 1m.',
    common_errors: 'Bassin qui s\'ouvre (hanche levée plus haute que l\'autre). Genou de support en hyperextension. Dos arrondi.',
    youtube_search: 'warrior 3 yoga coureur équilibre proprioception trail',
    variants: [
      { id:'warrior3_sol', name:'Guerrier II libre', required_equipment:{}, priority:1, load_type:'bodyweight_variant', load_variant_options:['bras le long du corps','bras tendus devant'], unit:'s', default_sets:2, default_reps:40, target_rpe:5, rest_seconds:15 },
      { id:'warrior3_mur', name:'Guerrier II mur (apprentissage)', required_equipment:{}, priority:2, load_type:'bodyweight_variant', load_variant_options:['pied au mur'], unit:'s', default_sets:2, default_reps:30, target_rpe:4, rest_seconds:10 },
    ],
  },

  lizard_pose: {
    id: 'lizard_pose', name_fr: 'Lézard', name_tech: 'Lizard Pose / Utthan Pristhasana',
    category: 'yoga_coureur',
    primary_muscles: ['fléchisseurs hanche profonds', 'adducteurs', 'piriforme'],
    benefits: ['mobilite_hanche', 'resilience'],
    position: 'En fente basse profonde. Pied avant à l\'extérieur de la main. Genou arrière au sol (tapis).',
    movement: 'Descendre les avant-bras vers le sol si possible. Bassin vers le bas et vers l\'avant. Tenir 90s par côté en respirant profondément. Excellent après D+ chargé.',
    common_errors: 'Genou avant qui s\'effondre vers l\'intérieur. Dos arrondi. Forcer l\'amplitude trop vite.',
    youtube_search: 'lizard pose yoga fléchisseur hanche trail runner récupération',
    variants: [
      { id:'lizard_avantbras', name:'Lézard avant-bras au sol', required_equipment:{}, priority:1, load_type:'bodyweight_variant', load_variant_options:['avant-bras au sol','mains au sol'], unit:'s', default_sets:2, default_reps:90, target_rpe:5, rest_seconds:15 },
      { id:'lizard_bloc', name:'Lézard mains sur blocs', required_equipment:{}, priority:2, load_type:'bodyweight_variant', load_variant_options:['avec blocs ou livres'], unit:'s', default_sets:2, default_reps:60, target_rpe:4, rest_seconds:10 },
    ],
  },

  cat_cow: {
    id: 'cat_cow', name_fr: 'Chat-vache', name_tech: 'Cat-Cow / Marjaryasana-Bitilasana',
    category: 'yoga_coureur',
    primary_muscles: ['érecteurs du rachis', 'multifides', 'abdominaux'],
    benefits: ['posture', 'mobilite_rachis'],
    position: 'À quatre pattes. Poignets sous les épaules, genoux sous les hanches. Dos neutre.',
    movement: 'Inspiration — creuser le dos, soulever la tête et le coccyx (vache). Expiration — arrondir le dos, rentrer le menton et le bassin (chat). Rythme lent et fluide. 10–15 cycles. Décompression lombaire post-sortie longue.',
    common_errors: 'Aller trop vite (perdre la synchronisation respiration-mouvement). Amplitude excessive (risque lombaire). Épaules qui montent vers les oreilles.',
    youtube_search: 'cat cow yoga mobilité colonne vertébrale coureur running récupération',
    variants: [
      { id:'catcow_standard', name:'Chat-vache classique', required_equipment:{}, priority:1, load_type:'bodyweight_variant', default_sets:2, default_reps:12, target_rpe:2, rest_seconds:10 },
    ],
  },

  supine_twist: {
    id: 'supine_twist', name_fr: 'Torsion allongée', name_tech: 'Supine Spinal Twist / Supta Matsyendrasana allongé',
    category: 'yoga_coureur',
    primary_muscles: ['thoracique', 'piriforme', 'obliques', 'psoas'],
    benefits: ['resilience', 'posture', 'mobilite_rachis'],
    position: 'Allongé sur le dos, bras en croix. Ramener les deux genoux vers la poitrine.',
    movement: 'Laisser tomber les deux genoux sur le côté jusqu\'au sol. Regarder dans la direction opposée. Tenir 60–90s par côté. Différent de reclined_twist : les deux genoux restent ensemble, torsion plus dorsale.',
    common_errors: 'Épaule opposée qui décolle du sol. Genoux qui se séparent. Retenir sa respiration.',
    youtube_search: 'supine twist torsion allongée yoga récupération dos trail',
    variants: [
      { id:'supine_twist_bw', name:'Torsion allongée deux genoux', required_equipment:{}, priority:1, load_type:'bodyweight_variant', load_variant_options:['genoux fléchis 90°','jambes plus tendues'], unit:'s', default_sets:2, default_reps:75, target_rpe:3, rest_seconds:10 },
    ],
  },

  // ── NOUVEAUX EXERCICES PILATES — core, bassin, contrôle unilatéral ─────────




  // ── NOUVEAUX ÉTIREMENTS STRETCHING — récupération post-trail ─────────────


  hip_flexor_couch: {
    id: 'hip_flexor_couch', name_fr: 'Couch stretch', name_tech: 'Couch Stretch / Rectus Femoris Stretch',
    category: 'stretching',
    primary_muscles: ['psoas', 'droit fémoral (rectus femoris)', 'iliaque'],
    benefits: ['mobilite_hanche', 'resilience', 'posture'],
    position: 'Agenouillé face à un mur ou canapé. Jambe à étirer : pied contre le mur/canapé, genou au sol. Jambe avant en fente, pied à plat.',
    movement: 'Redresser le buste progressivement. Contracter le fessier de la jambe arrière. Sentir l\'étirement profond en avant de la hanche/cuisse. Tenir 90s par côté. Plus efficace que low_lunge pour le droit fémoral.',
    common_errors: 'Dos lombaire qui s\'arque excessivement (cambrer pour compenser). Fessier non contracté. Pas assez près du mur.',
    youtube_search: 'couch stretch psoas droit fémoral trail running récupération D+',
    variants: [
      { id:'couch_standard', name:'Couch stretch contre le mur', required_equipment:{}, priority:1, load_type:'bodyweight_variant', load_variant_options:['buste droit','buste légèrement incliné'], unit:'s', default_sets:2, default_reps:90, target_rpe:5, rest_seconds:15 },
    ],
  },


};

// Temps de repos inter-série (secondes) selon la science du coaching :
// Force lourde 2-3 min (adaptation neuromusculaire), excentrique 2-2min30
// (fatigue tendineuse élevée), pliométrie haute intensité 2-2min30 (récupération
// ATP), tronc/mobilité 45-90 s (faible demande systémique).
export const INTER_SET_REST: Record<string, any> = {
  squat_lourd: 120,        rdl: 120,              bulgare: 120,
  mollets_lourds: 90,      hip_thrust: 120,        lunge_marcheur: 90,
  pogo_jumps: 90,          bondissements: 120,     drop_jumps: 150,
  skips: 60,               lateral_bound: 90,      box_jump: 150,
            nordic: 150,            mollet_excentrique: 90,
        tibialis_raise: 60,
  single_leg_glute_bridge: 60, wall_sit: 120,
  pallof_press: 60,        side_plank_hipdrop: 60, dead_bug: 45,
  bird_dog: 45,            suitcase_carry: 60,     copenhagen_plank: 90,
  tractions_or_row: 120,   pompes: 90,             face_pull: 60,
  ytw_prone: 60,
              pigeon_actif: 30,
  open_book: 30,           monster_walk: 45,       hip_abduction: 30,
  cossack_squat: 45,
  step_up: 90,             lateral_lunge: 90,      single_leg_squat: 90,
  low_lunge: 15,           downward_dog: 15,       child_pose: 10,
  reclined_twist: 10,      butterfly: 10,
  warrior_3: 15,           lizard_pose: 15,        cat_cow: 10,
  supine_twist: 10,
  ischio_debout: 10,       gastrocnemien_stretch: 10,
  figure_4_piriforme: 10,
   hip_flexor_couch: 15,
};


export const SESSION_EXERCISES: Record<string, string[]> = {
  force_lourde:           ['squat_lourd','deadlift','rdl','hip_thrust','bulgare','lunge_marcheur','step_up','lateral_lunge'],
  pliometrie:             ['pogo_jumps','ankle_hops','sl_pogo','bondissements','drop_jumps','lateral_bound','box_jump','hop_and_stick'],
  excentrique:            ['nordic','mollet_excentrique','tibialis_raise','single_leg_squat'],
  excentrique_pliometrie: ['nordic','pogo_jumps','bondissements','tibialis_raise'],
  tronc:                  ['pallof_press','side_plank_hipdrop','dead_bug','bird_dog','suitcase_carry','copenhagen_plank'],
  haut_corps:             ['tractions_or_row','pompes','face_pull','ytw_prone'],
  mobilite:               ['balance_unipodal','y_balance','pigeon_actif','open_book','monster_walk','hip_abduction','single_leg_glute_bridge','cossack_squat'],
  yoga_coureur:           ['pigeon_actif','low_lunge','reclined_twist','downward_dog','butterfly','child_pose','warrior_3','lizard_pose','cat_cow','supine_twist'],
  stretching:             ['gastrocnemien_stretch','ischio_debout','figure_4_piriforme','open_book','hip_flexor_couch'],
};

export const FOCUS_META: Record<string, any> = {
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
  },
  yoga_coureur: {
    label: 'Yoga coureur', duration_min: 25, duration_short: 20, location: 'maison',
    timing_after_easy: true, timing_before_long: false, timing_same_quality: true,
    timing_notes: ['✅ Après une sortie facile ou longue', '✅ Le soir d\'un jour de qualité', '⚠️ PNF → attendre 20min post-effort intense'],
    warmup_text: 'Respiration abdominale 2 min → 5 rotations cervicales lentes → 5 cercles d\'épaules → relâchement progressif avant de démarrer.',
  },
  stretching: {
    label: 'Stretching post-run', duration_min: 15, duration_short: 12, location: 'maison',
    timing_after_easy: true, timing_before_long: false, timing_same_quality: true,
    timing_notes: ['✅ Dans les 30min après la course', '✅ Le soir après n\'importe quelle sortie', '❌ Jamais avant une séance (réduit la raideur tendineuse)'],
    warmup_text: 'À pratiquer muscles encore chauds, après l\'effort. Pas d\'échauffement spécifique nécessaire — entrez directement dans les postures.',
  },
};

export const RENFO_LOAD_WEIGHTS: Record<string, number> = {
  force_lourde: 1.5, pliometrie: 1.3, excentrique: 1.2,
  haut_corps: 1.0, tronc: 0.8, mobilite: 0.5,
  yoga_coureur: 0.3, stretching: 0.2,
  excentrique_pliometrie: 1.25,
};

export const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

export const RENFO_DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export const RENFO_DAY_FR = ['D','L','M','M','J','V','S'];
