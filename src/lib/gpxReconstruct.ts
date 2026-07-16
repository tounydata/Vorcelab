// Reconstruction d'un tracé GPX (points lat/lon/alt) à partir des streams Strava
// bruts (activity_streams.data), pour alimenter `computeRaceProjection`.
//
// Logique PURE (aucune IO, aucune dépendance Supabase) → testable sous Vitest.
// Ne renvoie que des points + des statistiques agrégées : AUCUN fichier n'est écrit,
// et l'appelant ne doit JAMAIS committer les coordonnées (cf. règles de confidentialité).
//
// Robustesse exigée : longueurs de tableaux différentes, points GPS manquants,
// altitude manquante, valeurs invalides (NaN/∞/null), streams vides, GPS partiel,
// et les différentes formes JSON des streams Strava.

import type { GpxPoint } from './computeRaceProjection'

/** Un stream Strava : soit `{ data: [...] }`, soit directement un tableau. */
type RawStream = { data?: unknown } | unknown[] | null | undefined

export interface RawStreams {
  latlng?: RawStream
  altitude?: RawStream
  distance?: RawStream
  time?: RawStream
  heartrate?: RawStream
  velocity_smooth?: RawStream
  [k: string]: RawStream
}

export interface GpxReconstruction {
  points: GpxPoint[]
  /** Nombre de points latlng bruts disponibles. */
  rawLatlngCount: number
  /** Nombre de points retenus (valides). */
  keptCount: number
  /** Part des points retenus disposant d'une altitude finie. */
  altCoverage: number
  /** Couverture GPS = keptCount / rawLatlngCount (0..1). */
  gpsCoverage: number
  /** Vrai si le tracé est exploitable par le moteur (≥ 2 points, distance > 0). */
  usable: boolean
  /** Codes machine (anonymisés) expliquant une reconstruction dégradée/inutilisable. */
  issues: string[]
}

/** Extrait le tableau sous-jacent d'un stream, quelle que soit sa forme JSON. */
function streamArray(s: RawStream): unknown[] {
  if (Array.isArray(s)) return s
  if (s && typeof s === 'object' && Array.isArray((s as { data?: unknown }).data)) {
    return (s as { data: unknown[] }).data
  }
  return []
}

function finiteNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Un point latlng valide = `[lat, lon]` finis, lat∈[-90,90], lon∈[-180,180]. */
function parseLatLng(v: unknown): { lat: number; lon: number } | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const lat = finiteNum(v[0])
  const lon = finiteNum(v[1])
  if (lat == null || lon == null) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  if (lat === 0 && lon === 0) return null // (0,0) = capteur non fixé → écarté
  return { lat, lon }
}

/**
 * Reconstruit les points du tracé depuis les streams. L'altitude est appariée par
 * index au latlng ; si les longueurs diffèrent, on prend l'intersection (min) et on
 * marque `length_mismatch`. Les points latlng invalides sont écartés (trous GPS),
 * l'altitude manquante/aberrante devient `null` (le moteur sait la gérer).
 */
export function reconstructGpx(streams: RawStreams | null | undefined): GpxReconstruction {
  const issues: string[] = []
  const latlng = streamArray(streams?.latlng)
  const altitude = streamArray(streams?.altitude)

  const rawLatlngCount = latlng.length
  if (rawLatlngCount === 0) {
    return { points: [], rawLatlngCount: 0, keptCount: 0, altCoverage: 0, gpsCoverage: 0, usable: false, issues: ['no_latlng'] }
  }
  if (altitude.length === 0) issues.push('no_altitude')
  else if (altitude.length !== rawLatlngCount) issues.push('length_mismatch')

  const points: GpxPoint[] = []
  let altKept = 0
  let lastEle: number | null = null

  for (let i = 0; i < rawLatlngCount; i++) {
    const ll = parseLatLng(latlng[i])
    if (!ll) continue // trou GPS : on saute ce point

    // Altitude appariée par index (si disponible et finie), sinon null.
    let ele: number | null = i < altitude.length ? finiteNum(altitude[i]) : null
    // Rejette les altitudes aberrantes (artefacts baro/GPS hors plage terrestre).
    if (ele != null && (ele < -500 || ele > 9000)) ele = null
    if (ele != null) { altKept++; lastEle = ele }

    points.push({ lat: ll.lat, lon: ll.lon, ele })
  }

  const keptCount = points.length
  // Une altitude ponctuellement manquante au milieu d'un tracé altimétré fausse le D+.
  // On comble par la dernière altitude connue (report avant), neutre pour le D+.
  if (altKept > 0 && altKept < keptCount) {
    let carry: number | null = null
    for (const p of points) {
      if (p.ele != null) carry = p.ele
      else if (carry != null) p.ele = carry
    }
    // Comble aussi un éventuel préfixe sans altitude par la première connue.
    if (points[0].ele == null && lastEle != null) {
      const firstEle = points.find((p) => p.ele != null)?.ele ?? null
      for (const p of points) { if (p.ele == null) p.ele = firstEle; else break }
    }
  }

  const altCoverage = keptCount > 0 ? altKept / keptCount : 0
  const gpsCoverage = rawLatlngCount > 0 ? keptCount / rawLatlngCount : 0
  if (gpsCoverage < 0.8 && keptCount > 0) issues.push('partial_gps')

  const usable = keptCount >= 2
  if (!usable) issues.push('too_few_points')

  return { points, rawLatlngCount, keptCount, altCoverage, gpsCoverage, usable, issues }
}
