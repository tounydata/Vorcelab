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

/** Repère de population — DERNIER RECOURS uniquement. N'est la vraie FCmax de personne. */
export const FC_MAX_FALLBACK = 185

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

/**
 * Résout la FCmax à utiliser pour un athlète, par ordre de fiabilité :
 * profil saisi → estimation depuis ses données → repère de population.
 */
export function resolveFcMax(
  profileFcMax: unknown,
  activities: readonly Record<string, unknown>[] = [],
): number {
  if (typeof profileFcMax === 'number' && isPlausibleFcMax(profileFcMax)) {
    return Math.round(profileFcMax)
  }
  return estimateFcMaxFromActivities(activities) ?? FC_MAX_FALLBACK
}
