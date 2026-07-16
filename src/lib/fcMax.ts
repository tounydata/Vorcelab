// Résolution de la FRÉQUENCE CARDIAQUE MAXIMALE (FCmax).
//
// ⚠️ La FCmax est STRICTEMENT INDIVIDUELLE. Les formules de population (« 220 − âge »)
// et toute constante fixe sont des approximations grossières, fausses pour beaucoup
// de coureurs. On résout donc dans cet ordre de priorité :
//   1. valeur mesurée/saisie dans le profil de l'athlète ;
//   2. estimation depuis SES propres données (FC max observée sur ses activités) ;
//   3. en dernier recours seulement, un repère de population (clairement étiqueté).
//
// ⛔ Ne jamais coder en dur une FCmax personnelle comme défaut partagé.

/** Repère de population — DERNIER RECOURS ABSOLU (ni valeur saisie, ni données, ni âge). */
export const FC_MAX_FALLBACK = 185

/** Âge (années) depuis une date de naissance (ISO), ou null si invalide/aberrant. */
export function ageFromBirthdate(birthdate: unknown): number | null {
  if (typeof birthdate !== 'string' || !birthdate) return null
  const bd = Date.parse(birthdate)
  if (Number.isNaN(bd)) return null
  const years = (Date.now() - bd) / (365.25 * 24 * 3600 * 1000)
  return years > 5 && years < 120 ? Math.floor(years) : null
}

// Bornes de plausibilité physiologique (rejette les valeurs aberrantes/artefacts).
const FC_MAX_MIN = 120
const FC_MAX_MAX = 230

function isPlausibleFcMax(value: number): boolean {
  return Number.isFinite(value) && value >= FC_MAX_MIN && value <= FC_MAX_MAX
}

/**
 * Estime la FCmax depuis les données réelles de l'athlète : la plus haute FC maximale
 * observée sur ses activités (bornée pour la plausibilité). `null` si aucune donnée.
 */
export function estimateFcMaxFromActivities(
  activities: readonly Record<string, unknown>[],
): number | null {
  let observed = 0
  for (const a of activities) {
    const hr = a.max_heartrate
    if (typeof hr === 'number' && isPlausibleFcMax(hr) && hr > observed) {
      observed = hr
    }
  }
  return observed > 0 ? Math.round(observed) : null
}

/** Origine de la FCmax retenue — pour la traçabilité du banc (jamais la valeur exacte). */
export type FcMaxSource = 'user' | 'strava' | 'age_formula' | 'fixed_fallback'

/**
 * Résout la FCmax ET son origine, par ordre de fiabilité :
 *   1. valeur SAISIE dans le profil (`user`) ;
 *   2. estimation depuis SES données (FC max observée sur ses activités Strava — `strava`) ;
 *   3. formule d'âge « 220 − âge » (`age_formula`, si l'âge est connu) ;
 *   4. repère fixe (`fixed_fallback`, dernier recours absolu).
 * La priorité produit reste INCHANGÉE : la valeur utilisateur n'est jamais remplacée.
 */
export function resolveFcMaxWithSource(
  profileFcMax: unknown,
  activities: readonly Record<string, unknown>[] = [],
  ageYears?: number | null,
): { value: number; source: FcMaxSource } {
  if (typeof profileFcMax === 'number' && isPlausibleFcMax(profileFcMax)) {
    return { value: Math.round(profileFcMax), source: 'user' }
  }
  const estimated = estimateFcMaxFromActivities(activities)
  if (estimated != null) return { value: estimated, source: 'strava' }
  if (typeof ageYears === 'number' && ageYears > 0) {
    const byAge = Math.round(220 - ageYears)
    if (isPlausibleFcMax(byAge)) return { value: byAge, source: 'age_formula' }
  }
  return { value: FC_MAX_FALLBACK, source: 'fixed_fallback' }
}

/**
 * Résout la FCmax à utiliser pour un athlète, par ordre de fiabilité (cf.
 * `resolveFcMaxWithSource`). Conserve la signature historique (valeur seule).
 */
export function resolveFcMax(
  profileFcMax: unknown,
  activities: readonly Record<string, unknown>[] = [],
  ageYears?: number | null,
): number {
  return resolveFcMaxWithSource(profileFcMax, activities, ageYears).value
}
