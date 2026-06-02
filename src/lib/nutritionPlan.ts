import type { NutritionProduct } from './nutritionProducts'

export interface NutritionRow {
  moment: string
  action: string
  glucides: string
  note: string
}

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

export function computeNutritionPlan(
  distM: number,
  estTimeS: number,
  nutritionLevel = 'standard',
  products: NutritionProduct[] = [],
): NutritionRow[] {
  const dh = estTimeS / 3600
  const dk = distM / 1000
  const profile = CARBS_PROFILES[nutritionLevel] ?? CARBS_PROFILES.standard
  const rows: NutritionRow[] = []

  // Produits réels de l'athlète (si renseignés) → on personnalise les apports.
  const gelPlain = products.find((p) => p.type === 'gel' && !p.caffeine)
    ?? products.find((p) => p.type === 'chew' && !p.caffeine)
  const gelCaf = products.find((p) => p.type === 'gel' && p.caffeine > 0)
  const drink = products.find((p) => p.type === 'drink')
  const lateFuel = products.find((p) => p.type === 'gel' && p.id !== gelPlain?.id) ?? gelPlain
  const label = (p?: NutritionProduct) => p ? `${p.brand} ${p.name}` : null
  const carbsOf = (p?: NutritionProduct) => p ? `${p.carbs}g${p.per ? `/${p.per}` : ''}` : null

  if (dh < 1.5) {
    rows.push({
      moment: 'Pendant',
      action: dh > 0.75 ? 'Eau + électrolytes si >25°C' : 'Eau selon la soif',
      glucides: '0g',
      note: '< 1h30 : réserves glycogéniques suffisantes · Burke et al., 2011',
    })
    return rows
  }

  const targetCarbsPerH = dh < 2.5 ? profile.short : profile.long
  const totalCarbsTarget = Math.round(targetCarbsPerH * dh)
  const levelLabel = LEVEL_LABELS[nutritionLevel] ?? nutritionLevel

  rows.push({
    moment: 'Objectif',
    action: `${targetCarbsPerH} g/h — cible ~${totalCarbsTarget} g sur ${dh.toFixed(1)}h`,
    glucides: `${totalCarbsTarget}g total`,
    note: `Profil ${levelLabel}`,
  })

  const t1km = Math.round(dk * 0.30)
  rows.push({
    moment: `~${t1km} km`,
    action: label(gelPlain) ? `${label(gelPlain)} + eau` : 'Gel sans caféine + eau',
    glucides: carbsOf(gelPlain) ?? '25–30g',
    note: 'Premier apport après 30min · Jeukendrup, 2004',
  })

  if (dh >= 1.75) {
    const t2km = Math.round(dk * 0.50)
    rows.push({
      moment: `~${t2km} km`,
      action: label(drink) ?? 'Boisson isotonique 200ml',
      glucides: carbsOf(drink) ?? '~20g',
      note: 'Hydratation + glucides',
    })
  }

  const t3km = Math.round(dk * 0.65)
  rows.push({
    moment: `~${t3km} km`,
    action: label(gelCaf) ? `${label(gelCaf)} (caféine) + eau` : 'Gel caféiné + eau',
    glucides: carbsOf(gelCaf) ?? '25–30g',
    note: "Pic d'effet 30–45min. À tester à l'entraînement, jamais le jour J",
  })

  if (dk > 20) {
    const t4km = Math.round(dk * 0.85)
    rows.push({
      moment: `~${t4km} km`,
      action: label(lateFuel) ? `${label(lateFuel)} + eau` : 'Gel + eau ou cola',
      glucides: carbsOf(lateFuel) ?? '25–30g',
      note: 'Maintien glycémie sur derniers km',
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
