export interface NutritionRow {
  timing: string
  action: string
  carbs: string
  note: string
  highlight?: string
}

export function genNutritionRows(distM: number, estTimeS: number, nutritionLevel = 'standard'): NutritionRow[] {
  const dh = estTimeS / 3600
  const dk = distM / 1000
  const CARBS_PROFILES: Record<string, { short: number; long: number }> = {
    prudent: { short: 30, long: 45 },
    standard: { short: 40, long: 60 },
    trained: { short: 50, long: 70 },
    gut_trained: { short: 60, long: 80 },
    elite: { short: 70, long: 90 },
  }
  const carbsPro = CARBS_PROFILES[nutritionLevel] ?? CARBS_PROFILES.standard
  const targetCarbsPerH = dh < 2.5 ? carbsPro.short : carbsPro.long
  const totalCarbsTarget = Math.round(targetCarbsPerH * dh)
  const rows: NutritionRow[] = []

  if (dh < 1.5) {
    rows.push({ timing: 'Pendant', action: 'Eau selon la soif' + (dh > 0.75 ? ' + électrolytes si >25°C' : ''), carbs: '0g', note: '< 1h30 : réserves glycogéniques suffisantes · Burke et al., 2011' })
    return rows
  }

  const levelLabel: Record<string, string> = { prudent: 'Prudent', standard: 'Standard', trained: 'Entraîné', gut_trained: 'Entr. digestif', elite: 'Élite' }
  rows.push({ timing: 'Objectif', action: `${targetCarbsPerH} g/h → ~${totalCarbsTarget} g sur ${dh.toFixed(1)}h`, carbs: `${totalCarbsTarget}g`, note: `Profil ${levelLabel[nutritionLevel] ?? nutritionLevel}`, highlight: 'info' })

  const t1km = Math.round(dk * 0.30)
  rows.push({ timing: `~${t1km} km`, action: 'Gel sans caféine + eau (150-200ml)', carbs: '25-30g', note: 'Premier apport après 30min · Jeukendrup, 2004' })

  if (dh >= 1.75) {
    const t2km = Math.round(dk * 0.50)
    rows.push({ timing: `~${t2km} km`, action: 'Boisson isotonique 200ml', carbs: '~20g', note: 'Hydratation + glucides · mi-course' })
  }

  const t3km = Math.round(dk * 0.65)
  rows.push({ timing: `~${t3km} km`, action: 'Gel caféiné + eau ☕', carbs: '25-30g', note: "Caféine : pic 30-45min après prise — timing pour fin de course. À tester à l'entraînement." })

  if (dh >= 2.5) {
    const t4km = Math.round(dk * 0.80)
    rows.push({ timing: `~${t4km} km`, action: 'Solide (barre, datte, banane) + eau', carbs: '25-35g', note: "Après 2h+ : diversifier les sources. Le solide est mieux toléré. Mâcher aide cognitivement." })
  }

  rows.push({ timing: 'Rappel eau', action: "Toujours 150-200ml d'eau avec chaque prise", carbs: '—', note: "Ne jamais prendre gel + boisson sucrée simultanément.", highlight: 'tip' })
  rows.push({ timing: 'Références', action: '—', carbs: '—', note: 'Burke 2011 · Jeukendrup 2004 · Currell & Jeukendrup 2008 · Ivy 1998' })

  return rows
}
