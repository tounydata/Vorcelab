// src/lib/hydrationHabits.ts
// Apprentissage des HABITUDES de ravitaillement du coureur (déterministe, 100 % pur).
//
// À partir des journaux de ravito saisis sur ses sorties (table
// activity_nutrition_log), on dérive ses DÉBITS réels — hydratation (mL/h),
// glucides (g/h) — pour PERSONNALISER la stratégie de course, qui utilisait
// jusqu'ici une hydratation générique fixe (500 mL/h) identique pour tout le monde.
//
// Principe (même esprit que le reste du moteur : « j'apprends TES chiffres ») :
//   • on ne retient que les sorties assez LONGUES pour être représentatives d'un
//     ravitaillement soutenu (une sortie de 20 min ne dit rien de l'hydratation
//     d'une course de 4 h) ;
//   • les débits sont pondérés par la DURÉE (une sortie de 4 h pèse plus qu'une
//     de 1 h) ;
//   • la CONFIANCE croît avec le nombre de sorties et le temps cumulé loggé ;
//   • rien n'est prescrit médicalement — ce sont des observations, à ajuster à la
//     chaleur et au ressenti.
//
// AUCUNE donnée de poids/urine ici (choix produit : friction trop élevée). La
// pesée avant/après est seulement SUGGÉRÉE côté UI (encart pédagogique), jamais
// exigée : sans elle on connaît l'INGÉRÉ, pas le taux de sudation réel.

/** Une sortie loggée = durée réelle + ce qui a été bu/mangé (champs facultatifs). */
export interface LoggedFueling {
  /** Durée de la sortie (secondes) — temps en mouvement de préférence. */
  durationS: number
  /** Liquides bus sur la sortie (mL). null/undefined = non renseigné. */
  fluidMl?: number | null
  /** Glucides ingérés sur la sortie (g). null/undefined = non renseigné. */
  carbsG?: number | null
  /** Boisson avec électrolytes. */
  electrolytes?: boolean | null
}

export type HydrationConfidence = 'none' | 'low' | 'medium' | 'high'

export interface HydrationHabits {
  /** Nb de sorties RETENUES (assez longues + au moins un champ renseigné). */
  sampleCount: number
  /** Temps cumulé (h) des sorties retenues avec hydratation renseignée. */
  fluidHours: number
  /** Débit d'hydratation appris (mL/h), pondéré par la durée. null si inconnu. */
  fluidMlPerH: number | null
  /** Débit de glucides appris (g/h), pondéré par la durée. null si inconnu. */
  carbsGPerH: number | null
  /** Part des sorties (avec liquide) où des électrolytes étaient pris [0..1]. */
  electrolyteShare: number | null
  /** Confiance globale (nb de sorties + heures cumulées). */
  confidence: HydrationConfidence
  /** Profil nutrition suggéré (clé CARBS_PROFILES) déduit des g/h réels. null si inconnu. */
  suggestedNutritionLevel: string | null
  /** Explications déterministes (transparence). */
  notes: string[]
}

// Sortie minimale pour qu'un ravito soit représentatif d'un débit soutenu.
const MIN_DURATION_S = 2700 // 45 min

function round(x: number, d = 0): number { const f = 10 ** d; return Math.round(x * f) / f }

/** Débit → profil de tolérance glucidique (aligné sur CARBS_PROFILES.long de nutritionPlan). */
export function nutritionLevelFromCarbsPerH(gPerH: number): string {
  if (gPerH < 35) return 'prudent'
  if (gPerH < 52) return 'standard'
  if (gPerH < 65) return 'trained'
  if (gPerH < 80) return 'gut_trained'
  return 'elite'
}

function confidenceFrom(sampleCount: number, totalHours: number): HydrationConfidence {
  if (sampleCount <= 0) return 'none'
  if (sampleCount >= 6 && totalHours >= 12) return 'high'
  if (sampleCount >= 3 && totalHours >= 4) return 'medium'
  return 'low'
}

/**
 * Agrège les journaux de ravito en habitudes. Pur & déterministe.
 * Ne retient que les sorties ≥ 45 min ayant au moins un champ renseigné.
 */
export function computeHydrationHabits(logs: LoggedFueling[]): HydrationHabits {
  const kept = logs.filter((l) =>
    l.durationS >= MIN_DURATION_S &&
    ((l.fluidMl != null && l.fluidMl >= 0) || (l.carbsG != null && l.carbsG >= 0)))

  // Hydratation : somme des liquides / somme des heures (pondération par durée).
  let fluidMlSum = 0, fluidHoursSum = 0, elytesCount = 0, fluidSessions = 0
  let carbsGSum = 0, carbsHoursSum = 0
  for (const l of kept) {
    const h = l.durationS / 3600
    if (l.fluidMl != null && l.fluidMl >= 0) {
      fluidMlSum += l.fluidMl; fluidHoursSum += h; fluidSessions++
      if (l.electrolytes) elytesCount++
    }
    if (l.carbsG != null && l.carbsG >= 0) { carbsGSum += l.carbsG; carbsHoursSum += h }
  }

  const fluidMlPerH = fluidHoursSum > 0 ? Math.round(fluidMlSum / fluidHoursSum) : null
  const carbsGPerH = carbsHoursSum > 0 ? Math.round(carbsGSum / carbsHoursSum) : null
  const electrolyteShare = fluidSessions > 0 ? round(elytesCount / fluidSessions, 2) : null
  const confidence = confidenceFrom(kept.length, Math.max(fluidHoursSum, carbsHoursSum))
  const suggestedNutritionLevel = carbsGPerH != null ? nutritionLevelFromCarbsPerH(carbsGPerH) : null

  const notes: string[] = []
  if (kept.length === 0) {
    notes.push('Aucune sortie renseignée (≥ 45 min) : la stratégie reste sur des cibles génériques. Renseigne tes ravitos pour la personnaliser.')
  } else {
    if (fluidMlPerH != null) {
      notes.push(`Hydratation moyenne observée : ~${fluidMlPerH} mL/h sur ${round(fluidHoursSum, 1)} h loggées${electrolyteShare != null ? ` (électrolytes ${Math.round(electrolyteShare * 100)} % du temps)` : ''}.`)
      if (fluidMlPerH >= 900) notes.push('Débit élevé (≥ 900 mL/h) : pense au sodium en proportion (une sur-hydratation pauvre en sel favorise l\'hyponatrémie). À tester, non médical.')
    }
    if (carbsGPerH != null) notes.push(`Glucides moyens observés : ~${carbsGPerH} g/h → profil ${suggestedNutritionLevel}.`)
    if (confidence === 'low') notes.push('Confiance faible (peu de sorties loggées) : les débits s\'affineront avec l\'usage.')
  }

  return {
    sampleCount: kept.length,
    fluidHours: round(fluidHoursSum, 1),
    fluidMlPerH,
    carbsGPerH,
    electrolyteShare,
    confidence,
    suggestedNutritionLevel,
    notes,
  }
}
