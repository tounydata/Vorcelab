import type { NutritionProduct } from './nutritionProducts'

export interface NutritionRow {
  moment: string
  action: string
  glucides: string
  note: string
}

// ── P0.1 (audit 23/07) : le plan de nutrition est construit autour du TEMPS ────
// Ancien défaut : la cible (ex. ~600 g sur 10 h) était calculée, mais on ne
// planifiait que ~4 prises à des % de DISTANCE fixes (~30/50/65/85 %) → le total
// réellement planifié (~120 g) ne couvrait pas la cible, et deux sections de même
// distance mais de durées différentes recevaient les mêmes horaires.
// Nouveau moteur : prises réparties dans le TEMPS à une cadence configurable,
// dont la SOMME approche la cible (± 10 %), fusionnées avec les ravitaillements,
// avec cibles conservatrices d'hydratation (ml/h) et de sodium (mg/h), et une
// alerte si les produits disponibles ne permettent pas d'atteindre la cible.
// Valeurs à TESTER à l'entraînement — jamais des prescriptions médicales.
//
// SOURCE — chiffres ancrés sur la base de connaissance interne (traçabilité) :
//   • docs/coach/knowledge-base.md §7 (l.117) : glucides 60-90 g/h (élite/ultra
//     jusqu'à 120), glucose+fructose au-delà de 60 g/h, hydratation 500-1000 mL/h,
//     ~1500 mg sodium/L. Réf. Jeukendrup PMC5371619, Precision Hydration.
//   • docs/coach/predictive-layer.md §8 : plafond glucose seul ~60 g/h (SGLT1),
//     glu+fru ~90-105 g/h ; sueur 0,5-2,0 L/h ; sodium 300-1000+ mg/h, majoré chaleur.
//   • docs/coach/knowledge-base-gaps.md §4 (l.70) : cible par durée
//     <2h 60 g/h · 2-3h 75-90 · >3h 90-120 (si entraîné digestif).
// Cf. réponse au propriétaire (23/07) : ce module ré-opérationnalise ce savoir,
// jusque-là resté en prose et perdu lors de la migration React (catalogue produits).

// Cible g/h par profil de tolérance × durée (short = <2h30, long = ≥2h30),
// bornée par les fourchettes ci-dessus (knowledge-base-gaps §4).
const CARBS_PROFILES: Record<string, { short: number; long: number }> = {
  prudent:     { short: 30, long: 45 },
  standard:    { short: 40, long: 60 },
  trained:     { short: 50, long: 70 },
  gut_trained: { short: 60, long: 80 },
  elite:       { short: 70, long: 90 },
}

const LEVEL_LABELS: Record<string, string> = {
  prudent: 'Prudent', standard: 'Standard', trained: 'Entraîné',
  gut_trained: 'Entr. digestif', elite: 'Élite',
}

// Cadence par défaut d'une prise glucidique, et cadence plancher (au-delà, viser
// plus de 4 prises/h devient peu réaliste → on plafonne et on signale un déficit).
const DEFAULT_CADENCE_MIN = 25
const MIN_CADENCE_MIN = 15 // ⇔ 4 prises/h max
// Cibles conservatrices (à ajuster au ressenti / à la chaleur, non médicales).
const HYDRATION_ML_PER_H = 500
const SODIUM_MG_PER_H = 500
const DEFAULT_GEL_CARBS = 25 // repli quand l'athlète n'a pas renseigné de produit
const STOP_FUEL_BEFORE_S = 300 // on ne planifie pas de prise dans les 5 dernières min

export type IntakeKind = 'gel' | 'gel_caf' | 'drink'

export interface NutritionIntake {
  /** Temps écoulé prévu de la prise (secondes depuis le départ). */
  atS: number
  /** Position approximative (km) — allure moyenne, pour l'affichage. */
  km: number
  kind: IntakeKind
  label: string
  carbs: number
  caffeineMg: number
  /** La prise tombe sur un ravitaillement (fusionnée, pas de doublon). */
  atAidStation: boolean
  aidLabel?: string
}

export interface NutritionIntakePlan {
  targetCarbsPerH: number
  totalCarbsTarget: number
  plannedCarbsTotal: number
  hydrationMlPerH: number
  sodiumMgPerH: number
  cadenceMin: number
  intakes: NutritionIntake[]
  /** Vrai si les produits ne permettent pas d'atteindre la cible (< 90 %). */
  shortfall: boolean
  /** Course trop courte (< 1h30) : réserves suffisantes, aucune prise. */
  tooShort: boolean
}

export interface RavitoLike { km: number; label?: string }

function fmtElapsed(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

/**
 * Cœur numérique : planifie les prises dans le TEMPS. Déterministe et testable.
 * La somme des glucides planifiés approche la cible (± 10 %) quand les produits
 * le permettent ; sinon `shortfall = true`.
 */
export function computeNutritionIntakes(
  distM: number,
  estTimeS: number,
  nutritionLevel = 'standard',
  products: NutritionProduct[] = [],
  avoidCaffeine = false,
  ravitos: RavitoLike[] = [],
  cadenceMin = DEFAULT_CADENCE_MIN,
): NutritionIntakePlan {
  const dh = estTimeS / 3600
  const dk = distM / 1000
  const profile = CARBS_PROFILES[nutritionLevel] ?? CARBS_PROFILES.standard

  if (dh < 1.5 || estTimeS <= 0) {
    return {
      targetCarbsPerH: 0, totalCarbsTarget: 0, plannedCarbsTotal: 0,
      hydrationMlPerH: dh > 0.75 ? HYDRATION_ML_PER_H : 0, sodiumMgPerH: dh > 0.75 ? SODIUM_MG_PER_H : 0,
      cadenceMin, intakes: [], shortfall: false, tooShort: true,
    }
  }

  const targetCarbsPerH = dh < 2.5 ? profile.short : profile.long
  const totalCarbsTarget = Math.round(targetCarbsPerH * dh)

  // Produits réels de l'athlète (sinon génériques).
  const gelPlain = products.find((p) => p.type === 'gel' && !p.caffeine)
    ?? products.find((p) => p.type === 'chew' && !p.caffeine)
  const gelCaf = avoidCaffeine ? undefined : products.find((p) => p.type === 'gel' && p.caffeine > 0)
  const drink = products.find((p) => p.type === 'drink')
  const baseCarbs = gelPlain?.carbs ?? DEFAULT_GEL_CARBS

  // Nombre de prises : d'abord piloté par la CIBLE (combien de prises du produit
  // de l'athlète faut-il pour couvrir ~la cible), puis borné par le plafond
  // physiologique de 4 prises/h (MIN_CADENCE_MIN). Si la cible demande plus que ce
  // plafond, on ne peut pas l'atteindre → `shortfall` se déclenchera plus bas.
  const maxIntakes = Math.max(1, Math.floor(estTimeS / (MIN_CADENCE_MIN * 60)))
  const idealIntakes = Math.max(1, Math.round(totalCarbsTarget / baseCarbs))
  let intakeCount = Math.min(idealIntakes, maxIntakes)
  // Confort : ne pas espacer les prises au-delà de la cadence de référence
  // (cadenceMin) — SAUF si cela dépassait la cible de >20 % (produits très
  // riches : on ne fractionne pas une portion fixe, on garde peu de prises).
  const byCadence = Math.min(maxIntakes, Math.max(1, Math.round(estTimeS / (cadenceMin * 60))))
  if (byCadence > intakeCount && byCadence * baseCarbs <= totalCarbsTarget * 1.2) {
    intakeCount = byCadence
  }

  // Répartition RÉGULIÈRE dans le temps (1re prise ~ à la cadence, dernière ~5 min
  // avant l'arrivée). Deux courses de même distance mais durées différentes →
  // horaires différents (placement piloté par le temps).
  const firstS = Math.min(cadenceMin * 60, estTimeS * 0.2)
  const lastS = Math.max(firstS, estTimeS - STOP_FUEL_BEFORE_S)
  const step = intakeCount > 1 ? (lastS - firstS) / (intakeCount - 1) : 0

  const intakes: NutritionIntake[] = []
  for (let i = 0; i < intakeCount; i++) {
    const atS = intakeCount > 1 ? firstS + i * step : (firstS + lastS) / 2
    const f = atS / estTimeS
    // Caféine : uniquement au cœur de la course (40–75 %), jamais au début ni sur
    // la toute fin ; au plus ~1 prise caféinée par heure.
    const wantCaf = !avoidCaffeine && !!gelCaf && f >= 0.4 && f <= 0.75
    let kind: IntakeKind
    let carbs: number
    let caffeineMg: number
    let label: string
    if (wantCaf && gelCaf) {
      kind = 'gel_caf'; carbs = gelCaf.carbs; caffeineMg = gelCaf.caffeine
      label = `${gelCaf.brand} ${gelCaf.name} (caféine) + eau`
    } else if (drink && i % 4 === 3) {
      // Une prise sur ~4 sous forme de boisson (hydratation + glucides).
      kind = 'drink'; carbs = drink.carbs; caffeineMg = 0
      label = `${drink.brand} ${drink.name}`
    } else if (gelPlain) {
      kind = 'gel'; carbs = gelPlain.carbs; caffeineMg = 0
      label = `${gelPlain.brand} ${gelPlain.name} + eau`
    } else {
      kind = 'gel'; carbs = DEFAULT_GEL_CARBS; caffeineMg = 0
      label = 'Gel sans caféine + eau'
    }
    intakes.push({ atS, km: +(dk * f).toFixed(1), kind, label, carbs, caffeineMg, atAidStation: false })
  }

  // Fusion avec les ravitaillements : on « aimante » la prise la plus proche du
  // temps de passage estimé du ravito (allure moyenne), sans créer de doublon.
  const snapWindowS = (step || cadenceMin * 60) / 2
  for (const r of ravitos) {
    if (!(r.km > 0) || r.km >= dk) continue
    const tRav = (r.km / dk) * estTimeS
    let best = -1, bestDelta = Infinity
    for (let i = 0; i < intakes.length; i++) {
      const d = Math.abs(intakes[i].atS - tRav)
      if (d < bestDelta) { bestDelta = d; best = i }
    }
    if (best >= 0 && bestDelta <= snapWindowS && !intakes[best].atAidStation) {
      intakes[best] = { ...intakes[best], atS: tRav, km: r.km, atAidStation: true, aidLabel: r.label }
    }
  }
  intakes.sort((a, b) => a.atS - b.atS)

  const plannedCarbsTotal = intakes.reduce((s, x) => s + x.carbs, 0)
  const shortfall = plannedCarbsTotal < totalCarbsTarget * 0.9

  return {
    targetCarbsPerH, totalCarbsTarget, plannedCarbsTotal,
    hydrationMlPerH: HYDRATION_ML_PER_H, sodiumMgPerH: SODIUM_MG_PER_H,
    cadenceMin, intakes, shortfall, tooShort: false,
  }
}

/**
 * Vue TABLEAU (rétro-compatible) : construit les lignes d'affichage à partir du
 * plan temporel. Sépare explicitement objectif, hydratation, prises réelles,
 * ravitaillements, récupération, et alerte de déficit éventuelle.
 */
export function computeNutritionPlan(
  distM: number,
  estTimeS: number,
  nutritionLevel = 'standard',
  products: NutritionProduct[] = [],
  avoidCaffeine = false,
  ravitos: RavitoLike[] = [],
  cadenceMin = DEFAULT_CADENCE_MIN,
): NutritionRow[] {
  const plan = computeNutritionIntakes(distM, estTimeS, nutritionLevel, products, avoidCaffeine, ravitos, cadenceMin)
  const dh = estTimeS / 3600
  const rows: NutritionRow[] = []

  if (plan.tooShort) {
    rows.push({
      moment: 'Pendant',
      action: dh > 0.75 ? 'Eau + électrolytes si >25°C' : 'Eau selon la soif',
      glucides: '0g',
      note: '< 1h30 : réserves glycogéniques suffisantes · Burke et al., 2011',
    })
    return rows
  }

  const levelLabel = LEVEL_LABELS[nutritionLevel] ?? nutritionLevel
  rows.push({
    moment: 'Objectif',
    action: `${plan.targetCarbsPerH} g/h — cible ~${plan.totalCarbsTarget} g sur ${dh.toFixed(1)}h`,
    glucides: `${plan.plannedCarbsTotal}g planifiés`,
    note: `Profil ${levelLabel} · ${plan.intakes.length} prises réparties dans le temps`,
  })
  rows.push({
    moment: 'Hydratation',
    action: `~${plan.hydrationMlPerH} ml/h + électrolytes`,
    glucides: `~${plan.sodiumMgPerH} mg/h sodium`,
    note: 'Cible conservatrice — à ajuster à la chaleur et au ressenti',
  })

  if (plan.shortfall) {
    rows.push({
      moment: '⚠ Alerte',
      action: 'Tes produits ne couvrent pas la cible',
      glucides: `${plan.plannedCarbsTotal}g / ${plan.totalCarbsTarget}g`,
      note: 'Ajoute des produits plus riches en glucides ou plus de prises',
    })
  }

  for (const it of plan.intakes) {
    rows.push({
      moment: `${fmtElapsed(it.atS)} · ~${it.km} km`,
      action: it.atAidStation ? `Ravito${it.aidLabel ? ` ${it.aidLabel}` : ''} — ${it.label}` : it.label,
      glucides: `${it.carbs}g`,
      note: it.kind === 'gel_caf'
        ? "Caféine : pic d'effet 30–45min. À tester à l'entraînement, jamais le jour J"
        : it.atAidStation ? 'Au ravitaillement' : 'Prise glucidique',
    })
  }

  rows.push({
    moment: 'Récup',
    action: 'Boisson de récupération',
    glucides: '60–80g',
    note: 'Fenêtre anabolique 30min post-arrivée · Kerksick et al., 2017',
  })

  return rows
}
