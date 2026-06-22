// Météo J-10 pour la projection de course.
// On récupère la prévision Open-Meteo (gratuite, sans clé) sur la fenêtre de course
// (heure de départ → arrivée estimée), on en déduit chaleur / froid / nuit / vent,
// puis on applique TES pénalités perso mesurées (runner_profile.conditionPenalties)
// avec garde-fous physiologiques, et un repli générique quand la confiance manque.

import type { ConditionPenalties } from './runnerProfile'

export interface RaceConditions {
  available: boolean
  /** Pourquoi indisponible (course passée / au-delà de J-10 / pas de point GPS). */
  reason?: string
  daysToRace: number
  /** Température représentative de la fenêtre de course (°C). */
  tempC: number | null
  /** Vent max sur la fenêtre (km/h). */
  windKmh: number | null
  /** Précipitations cumulées sur la fenêtre (mm). */
  precipMm: number | null
  /** Au moins une partie significative de la course entre 20h et 5h. */
  isNight: boolean
  startHour: number | null
}

export type ConditionKey = 'heat' | 'cold' | 'night' | 'wind'

export interface WeatherImpactItem {
  key: ConditionKey
  label: string
  /** Impact en % sur le temps (positif = plus lent). */
  pct: number
  source: 'perso' | 'générique'
}

export interface WeatherImpact {
  /** Facteur multiplicatif à appliquer au temps estimé (1.0 = neutre). */
  factor: number
  /** Impact total en % (positif = plus lent). */
  totalPct: number
  items: WeatherImpactItem[]
}

// Garde-fous physiologiques : ces conditions ne peuvent que ralentir (ou neutre).
// On borne aussi l'amplitude pour éviter qu'un échantillon perso bruité ne fausse tout.
const CLAMP: Record<ConditionKey, { min: number; max: number }> = {
  heat:  { min: 0, max: 12 },
  cold:  { min: 0, max: 8 },
  night: { min: 0, max: 8 },
  wind:  { min: 0, max: 8 },
}

const CONDITION_LABEL: Record<ConditionKey, string> = {
  heat: 'Chaleur', cold: 'Froid', night: 'Nuit', wind: 'Vent',
}

function clampPct(key: ConditionKey, pct: number): number {
  return Math.max(CLAMP[key].min, Math.min(CLAMP[key].max, pct))
}

/** Récupère la prévision Open-Meteo sur la fenêtre de course. */
export async function fetchRaceForecast(opts: {
  lat: number
  lon: number
  dateISO: string          // 'YYYY-MM-DD'
  startTime: string | null // 'HH:MM' (défaut 9h si absent)
  estDurationS: number
}): Promise<RaceConditions> {
  const { lat, lon, dateISO, startTime, estDurationS } = opts
  const startHour = startTime ? Math.min(23, parseInt(startTime.split(':')[0] || '9', 10)) : 9

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const raceDay = new Date(dateISO + 'T00:00:00')
  const daysToRace = Math.round((raceDay.getTime() - today.getTime()) / 86400000)

  const base: RaceConditions = {
    available: false, daysToRace, tempC: null, windKmh: null, precipMm: null,
    isNight: false, startHour: startTime ? startHour : null,
  }

  if (daysToRace < 0) return { ...base, reason: 'Course passée' }
  if (daysToRace > 10) return { ...base, reason: 'Météo disponible à partir de J-10' }

  // Fenêtre horaire : départ → arrivée estimée (bornée à 23h le jour J).
  const durH = Math.max(1, Math.ceil(estDurationS / 3600))
  const endHour = Math.min(23, startHour + durH)

  try {
    const forecastDays = Math.min(16, daysToRace + 1)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&hourly=temperature_2m,precipitation,windspeed_10m&timezone=auto&forecast_days=${forecastDays}`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { ...base, reason: 'Prévision indisponible' }
    const d = await r.json()
    const times: string[] = d.hourly?.time ?? []
    const temps: number[] = d.hourly?.temperature_2m ?? []
    const winds: number[] = d.hourly?.windspeed_10m ?? []
    const precips: number[] = d.hourly?.precipitation ?? []
    if (!times.length) return { ...base, reason: 'Prévision indisponible' }

    let maxTemp: number | null = null, maxWind: number | null = null, sumPrecip = 0, night = false
    let any = false
    for (let i = 0; i < times.length; i++) {
      if (!times[i].startsWith(dateISO)) continue
      const h = parseInt(times[i].slice(11, 13), 10)
      if (h < startHour || h > endHour) continue
      any = true
      if (temps[i] != null) maxTemp = maxTemp == null ? temps[i] : Math.max(maxTemp, temps[i])
      if (winds[i] != null) maxWind = maxWind == null ? winds[i] : Math.max(maxWind, winds[i])
      if (precips[i] != null) sumPrecip += precips[i]
      if (h >= 20 || h < 5) night = true
    }
    if (!any) return { ...base, reason: 'Prévision indisponible' }

    return {
      available: true, daysToRace, tempC: maxTemp, windKmh: maxWind,
      precipMm: +sumPrecip.toFixed(1), isNight: night, startHour,
    }
  } catch {
    return { ...base, reason: 'Prévision indisponible' }
  }
}

/**
 * Impact météo sur le temps : pénalités perso (si confiance ≥ medium) sinon génériques.
 * On ne retient une condition que si la prévision la déclenche.
 */
export function computeWeatherImpact(
  cond: RaceConditions,
  penalties: ConditionPenalties | undefined,
): WeatherImpact {
  const items: WeatherImpactItem[] = []
  if (!cond.available) return { factor: 1, totalPct: 0, items }

  const active: ConditionKey[] = []
  if (cond.tempC != null && cond.tempC > 22) active.push('heat')
  if (cond.tempC != null && cond.tempC < 5) active.push('cold')
  if (cond.isNight) active.push('night')
  if (cond.windKmh != null && cond.windKmh * 0.6 > 15) active.push('wind')

  // Repli générique (littérature) quand pas de pénalité perso fiable.
  const generic = (key: ConditionKey): number => {
    switch (key) {
      case 'heat': return clampPct('heat', cond.tempC != null ? (cond.tempC - 22) * 1.2 : 4) // ~Ely 2007
      case 'cold': return 3
      case 'night': return 4
      case 'wind': return clampPct('wind', cond.windKmh != null ? (cond.windKmh * 0.6 - 15) * 0.3 : 4)
    }
  }

  for (const key of active) {
    const p = penalties?.[key]
    let pct: number, source: 'perso' | 'générique'
    if (p && (p.confidence === 'high' || p.confidence === 'medium')) {
      pct = clampPct(key, p.paceImpactPct)
      source = 'perso'
    } else {
      pct = generic(key)
      source = 'générique'
    }
    if (pct > 0) items.push({ key, label: CONDITION_LABEL[key], pct: +pct.toFixed(1), source })
  }

  // Cumul additif, borné à +20 % (les conditions se recoupent partiellement).
  const totalPct = Math.min(20, items.reduce((s, it) => s + it.pct, 0))
  return { factor: 1 + totalPct / 100, totalPct: +totalPct.toFixed(1), items }
}
