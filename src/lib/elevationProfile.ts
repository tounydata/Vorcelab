// Nettoyage / lissage altimétrique ROBUSTE d'un tracé GPS, pour le moteur et le banc.
//
// Problème : les altitudes brutes Strava (baromètre + GPS) oscillent de ±1-3 m à
// chaque point. Accumulées le long d'un parcours, ces micro-oscillations gonflent
// fortement le D+ — surtout sur du plat (ex. 52 m stockés → ~217 m bruts). Le moteur
// classe alors à tort une course plate en « fort D+/km ».
//
// Ce module produit un profil altimétrique PROPRE, en préservant la FORME du parcours
// (vraies montées/descentes) tout en écrasant le bruit cumulé :
//   1. interpolation par distance des altitudes manquantes ;
//   2. filtre médian (anti-spikes / valeurs aberrantes ponctuelles) ;
//   3. lissage par fenêtre de distance (~30 m) ;
//   4. accumulation du D+ à SEUIL vertical minimal (hystérésis) — une oscillation
//      inférieure au seuil ne compte pas ;
//   5. recalage proportionnel OPTIONNEL du D+ lissé sur le total_elevation_gain Strava
//      (variations positives uniquement, borné, distance JAMAIS modifiée).
//
// Logique PURE (aucune IO, aucune dépendance Supabase) → testable et déterministe.
// Ne renvoie que des points + statistiques : aucune coordonnée n'est écrite/commitée.

import { hav } from './gpxCore'
import type { GpxPoint } from './computeRaceProjection'

export interface SmoothElevationInput {
  points: GpxPoint[]
  /** total_elevation_gain Strava (m) pour recalage optionnel. Absent/incohérent → pas de recalage. */
  targetElevationGainM?: number | null
  /** Fenêtre de lissage par distance (m). Défaut 30 (plage recommandée 20-50). */
  smoothingDistanceM?: number
  /** Seuil vertical minimal d'accumulation du D+ (m, hystérésis). Défaut 2. */
  minVerticalM?: number
  /** Taille (impaire) de la fenêtre du filtre médian (points). Défaut 5. */
  medianWindow?: number
}

export interface SmoothElevationResult {
  /** Points (lat/lon INCHANGÉS) avec altitude nettoyée & lissée, éventuellement recalée. */
  points: GpxPoint[]
  /** D+ des altitudes brutes (interpolées seulement, seuil 0) — pour comparaison. */
  rawGainM: number
  /** D+ après lissage + seuil, AVANT recalage. */
  smoothedGainM: number
  /** D+ final (après recalage éventuel). */
  finalGainM: number
  /** D− final (perte cumulée) après lissage/recalage. */
  finalLossM: number
  /** Facteur de recalage appliqué aux variations positives (1 = aucun). */
  calibrationRatio: number
  /** Vrai si un recalage a été appliqué. */
  wasCalibrated: boolean
  /** Distance totale (m) — GARANTIE identique à l'entrée (jamais modifiée). */
  distanceM: number
  /** Part des points d'entrée disposant d'une altitude finie (0..1). */
  altCoverage: number
}

// Bornes de plausibilité pour le recalage Strava (rejette valeurs aberrantes / facteurs absurdes).
const CAL_RATIO_MIN = 0.2
const CAL_RATIO_MAX = 3.0

/**
 * D+ / D− cumulés d'une série d'altitudes avec seuil vertical d'hystérésis.
 * `ref` (dernier extrême confirmé) ne bouge que lorsqu'un mouvement dépasse le seuil :
 * les oscillations < seuil sont donc ignorées, mais une VRAIE montée soutenue (même en
 * petits pas < seuil) finit par franchir le seuil cumulé et est comptée intégralement.
 * Seuil 0 → somme naïve des variations positives/négatives.
 */
function accumulateGain(ele: number[], minVerticalM: number): { gain: number; loss: number } {
  let gain = 0, loss = 0
  if (ele.length === 0) return { gain, loss }
  let ref = ele[0]
  for (let i = 1; i < ele.length; i++) {
    const e = ele[i]
    if (e - ref >= minVerticalM) { gain += e - ref; ref = e }
    else if (ref - e >= minVerticalM) { loss += ref - e; ref = e }
  }
  return { gain, loss }
}

/**
 * Nettoie et lisse le profil altimétrique. Préserve la forme, écrase le bruit cumulé,
 * et — si `targetElevationGainM` est fourni et plausible — recale proportionnellement
 * le D+ lissé vers la valeur Strava. La distance n'est JAMAIS modifiée.
 */
export function smoothElevationProfile(input: SmoothElevationInput): SmoothElevationResult {
  const { points } = input
  const smoothingDistanceM = input.smoothingDistanceM ?? 30
  const minVerticalM = input.minVerticalM ?? 2
  const medianWindow = Math.max(1, (input.medianWindow ?? 5) | 1) // force impaire ≥ 1
  const n = points.length

  // Distances cumulées (jamais modifiées).
  const cumDist = new Array(n).fill(0)
  for (let i = 1; i < n; i++) cumDist[i] = cumDist[i - 1] + hav(points[i - 1], points[i])
  const distanceM = n > 0 ? cumDist[n - 1] : 0

  const finiteCount = points.reduce((s, p) => s + (p.ele != null && Number.isFinite(p.ele) ? 1 : 0), 0)
  const altCoverage = n > 0 ? finiteCount / n : 0

  // Aucun signal altimétrique exploitable → profil plat, D+ nul.
  if (n < 2 || finiteCount === 0) {
    return {
      points: points.map((p) => ({ ...p, ele: p.ele != null && Number.isFinite(p.ele) ? p.ele : null })),
      rawGainM: 0, smoothedGainM: 0, finalGainM: 0, finalLossM: 0,
      calibrationRatio: 1, wasCalibrated: false, distanceM, altCoverage,
    }
  }

  // ── 1. Interpolation par distance des altitudes manquantes/non finies. ─────────
  const known: number[] = []
  const interp: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const e = points[i].ele
    if (e != null && Number.isFinite(e)) known.push(i)
  }
  for (let i = 0; i < n; i++) {
    const e = points[i].ele
    if (e != null && Number.isFinite(e)) { interp[i] = e; continue }
    // Cherche voisins connus encadrants.
    let lo = -1, hi = -1
    for (const k of known) { if (k < i) lo = k; else { hi = k; break } }
    if (lo >= 0 && hi >= 0) {
      const span = cumDist[hi] - cumDist[lo]
      const t = span > 0 ? (cumDist[i] - cumDist[lo]) / span : 0
      interp[i] = (points[lo].ele as number) + t * ((points[hi].ele as number) - (points[lo].ele as number))
    } else if (lo >= 0) {
      interp[i] = points[lo].ele as number // report avant (préfixe/suffixe)
    } else if (hi >= 0) {
      interp[i] = points[hi].ele as number
    } else {
      interp[i] = 0
    }
  }

  // D+ « brut » = interpolé, seuil 0 (reflète les oscillations non filtrées).
  const rawGainM = accumulateGain(interp, 0).gain

  // ── 2. Filtre médian (anti-spikes). ───────────────────────────────────────────
  const half = (medianWindow - 1) / 2
  const median: number[] = new Array(n)
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
  const smoothed: number[] = new Array(n)
  if (smoothingDistanceM <= 0) {
    for (let i = 0; i < n; i++) smoothed[i] = median[i]
  } else {
    const halfWin = smoothingDistanceM / 2
    let lo = 0, hi = 0
    for (let i = 0; i < n; i++) {
      while (lo < i && cumDist[i] - cumDist[lo] > halfWin) lo++
      while (hi < n - 1 && cumDist[hi + 1] - cumDist[i] <= halfWin) hi++
      let sum = 0
      for (let j = lo; j <= hi; j++) sum += median[j]
      smoothed[i] = sum / (hi - lo + 1)
    }
  }

  // ── 4. Accumulation du D+ à seuil (hystérésis). ────────────────────────────────
  const acc = accumulateGain(smoothed, minVerticalM)
  const smoothedGainM = acc.gain

  // ── 5. Recalage proportionnel optionnel vers le D+ Strava. ─────────────────────
  const target = input.targetElevationGainM
  let calibrationRatio = 1
  let wasCalibrated = false
  let finalEle = smoothed
  let finalGainM = smoothedGainM
  let finalLossM = acc.loss

  const targetPlausible =
    typeof target === 'number' && Number.isFinite(target) && target >= 0 &&
    // recalage inutile/absurde si D+ Strava minuscule sur longue distance sans montée détectée
    !(target === 0)

  if (targetPlausible && smoothedGainM > 1) {
    const ratio = (target as number) / smoothedGainM
    const clamped = Math.min(CAL_RATIO_MAX, Math.max(CAL_RATIO_MIN, ratio))
    // On ne recale que si l'écart est significatif (> 5 %) et le facteur reste borné.
    if (Math.abs(clamped - 1) > 0.05 && clamped === ratio) {
      // Reconstruit la série en mettant à l'échelle les seules variations POSITIVES.
      const rescaled: number[] = new Array(n)
      rescaled[0] = smoothed[0]
      for (let i = 1; i < n; i++) {
        const d = smoothed[i] - smoothed[i - 1]
        rescaled[i] = rescaled[i - 1] + (d > 0 ? d * clamped : d)
      }
      finalEle = rescaled
      calibrationRatio = clamped
      wasCalibrated = true
      const acc2 = accumulateGain(rescaled, minVerticalM)
      finalGainM = acc2.gain
      finalLossM = acc2.loss
    }
  }

  const outPoints: GpxPoint[] = points.map((p, i) => ({ lat: p.lat, lon: p.lon, ele: +finalEle[i].toFixed(2) }))

  return {
    points: outPoints,
    rawGainM: Math.round(rawGainM),
    smoothedGainM: Math.round(smoothedGainM),
    finalGainM: Math.round(finalGainM),
    finalLossM: Math.round(finalLossM),
    calibrationRatio: +calibrationRatio.toFixed(3),
    wasCalibrated,
    distanceM,
    altCoverage: +altCoverage.toFixed(3),
  }
}
