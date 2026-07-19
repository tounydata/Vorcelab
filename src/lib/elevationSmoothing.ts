// Primitive COMMUNE de lissage altimétrique (§9) — pure, sans dépendance.
//
// Unifie le nettoyage d'altitude entre le pipeline GPX principal (elevationProfile.ts) et
// le calcul GAP des records (bestEfforts.ts), qui utilisaient auparavant deux lissages
// différents. Trois étapes robustes, dans cet ordre :
//   1. interpolation PAR DISTANCE des altitudes manquantes / non finies ;
//   2. filtre médian (anti-spikes baro/GPS ponctuels) ;
//   3. lissage par fenêtre de DISTANCE (moyenne glissante ±smoothingDistanceM/2),
//      qui prévient les oscillations artificielles indépendamment de la cadence.
//
// La distance cumulée est fournie par l'appelant et JAMAIS recalculée (§9).

export interface AltitudeSmoothingOptions {
  /** Fenêtre du filtre médian (forcée impaire ≥ 1). Défaut 5. */
  medianWindow?: number
  /** Fenêtre de lissage par distance (m). Défaut 50. `<= 0` désactive l'étape 3. */
  smoothingDistanceM?: number
}

/**
 * Lisse un tableau d'altitudes le long d'une distance cumulée donnée. Retourne un tableau
 * de même longueur, toujours fini. Si aucune altitude n'est exploitable, renvoie des zéros.
 */
export function smoothAltitudeByDistance(
  altitude: ReadonlyArray<number | null | undefined>,
  cumDistanceM: ReadonlyArray<number>,
  opts?: AltitudeSmoothingOptions,
): number[] {
  const n = Math.min(altitude.length, cumDistanceM.length)
  const medianWindow = Math.max(1, (opts?.medianWindow ?? 5) | 1) // impaire ≥ 1
  const smoothingDistanceM = opts?.smoothingDistanceM ?? 50
  if (n === 0) return []

  const isFinite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)

  // ── 1. Interpolation par distance des altitudes manquantes / non finies. ───────
  const known: number[] = []
  for (let i = 0; i < n; i++) if (isFinite(altitude[i])) known.push(i)
  if (known.length === 0) return new Array<number>(n).fill(0)

  const interp = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    if (isFinite(altitude[i])) { interp[i] = altitude[i] as number; continue }
    let lo = -1, hi = -1
    for (const k of known) { if (k < i) lo = k; else { hi = k; break } }
    if (lo >= 0 && hi >= 0) {
      const span = cumDistanceM[hi] - cumDistanceM[lo]
      const t = span > 0 ? (cumDistanceM[i] - cumDistanceM[lo]) / span : 0
      interp[i] = (altitude[lo] as number) + t * ((altitude[hi] as number) - (altitude[lo] as number))
    } else if (lo >= 0) {
      interp[i] = altitude[lo] as number
    } else if (hi >= 0) {
      interp[i] = altitude[hi] as number
    } else {
      interp[i] = 0
    }
  }

  // ── 2. Filtre médian (anti-spikes). ───────────────────────────────────────────
  const half = (medianWindow - 1) / 2
  const median = new Array<number>(n)
  if (medianWindow <= 1) {
    for (let i = 0; i < n; i++) median[i] = interp[i]
  } else {
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half)
      const win = interp.slice(lo, hi + 1).sort((a, b) => a - b)
      median[i] = win[(win.length - 1) >> 1]
    }
  }

  // ── 3. Lissage par fenêtre de distance (moyenne glissante ±smoothingDistanceM/2). ─
  if (smoothingDistanceM <= 0) return median
  const smoothed = new Array<number>(n)
  const halfWin = smoothingDistanceM / 2
  let lo = 0, hi = 0
  for (let i = 0; i < n; i++) {
    while (lo < i && cumDistanceM[i] - cumDistanceM[lo] > halfWin) lo++
    while (hi < n - 1 && cumDistanceM[hi + 1] - cumDistanceM[i] <= halfWin) hi++
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += median[j]
    smoothed[i] = sum / (hi - lo + 1)
  }
  return smoothed
}
