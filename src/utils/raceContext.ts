import type { Activity } from '../types/activity'
import type { WeatherData } from '../lib/fetchWeather'

export interface RaceFactor {
  label: string
  value: string
  adj: string
  color: string
}

export interface RaceContext {
  factors: RaceFactor[]
  totalAdj: number
  paceNorm: string
}

export function computeRaceContext(act: Activity, weather: WeatherData | null): RaceContext {
  const factors: RaceFactor[] = []
  let totalAdj = 0

  if (weather?.temp != null) {
    const a = Math.max(0, (weather.temp - 15) * 0.005)
    totalAdj += a
    factors.push({ label: 'Température', value: `${weather.temp.toFixed(1)}°C`, adj: a > 0.005 ? `+${(a * 100).toFixed(1)}%` : '~0%', color: a > 0.04 ? 'var(--vl-ember)' : a > 0.02 ? 'var(--vl-amber)' : 'var(--vl-growth)' })
  }
  if (weather?.precip != null) {
    const a = Math.min(0.035, Math.log1p(weather.precip) * 0.018)
    totalAdj += a
    factors.push({ label: 'Pluie', value: `${weather.precip.toFixed(1)}mm`, adj: a > 0.005 ? `+${(a * 100).toFixed(1)}%` : '~0%', color: a > 0.02 ? 'var(--vl-amber)' : 'var(--vl-growth)' })
  }
  if (weather?.wind != null) {
    const a = Math.min(0.045, Math.pow(weather.wind / 30, 2) * 0.04)
    totalAdj += a
    factors.push({ label: 'Vent', value: `${weather.wind.toFixed(0)} km/h`, adj: `+${(a * 100).toFixed(1)}%`, color: a > 0.02 ? 'var(--vl-amber)' : 'var(--vl-growth)' })
  }

  const dp = act.total_elevation_gain || 0
  const dk = (act.distance || 1) / 1000
  const ga = Math.min(0.45, dp / (dk * 1000) * 5.5)
  totalAdj += ga
  factors.push({ label: 'Dénivelé', value: `+${dp}m`, adj: `+${(ga * 100).toFixed(1)}%`, color: ga > 0.15 ? 'var(--vl-amber)' : 'var(--vl-amber)' })

  const h = parseInt(act.start_date_local?.split('T')[1]?.split(':')[0] || '12')
  if (h < 5 || h >= 21) {
    totalAdj += 0.02
    factors.push({ label: 'Nuit', value: `${h}h`, adj: '+2%', color: 'var(--vl-violet,#8b5cf6)' })
  }
  if (act.type === 'TrailRun') {
    totalAdj += 0.04
    factors.push({ label: 'Trail', value: 'Terrain', adj: '+4%', color: 'var(--vl-amber)' })
  }

  const raw = act.average_speed > 0 ? 1000 / act.average_speed : 0
  const norm = raw / (1 + totalAdj)
  const nm = Math.floor(norm / 60)
  const ns = Math.round(norm % 60)
  return { factors, totalAdj, paceNorm: `${nm}:${String(ns).padStart(2, '0')}` }
}

export function computeHRZones(hrData: number[], fcMax: number): [number, number, number, number, number] {
  if (!hrData.length) return [0, 0, 0, 0, 0]
  const z: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  hrData.forEach(h => {
    const p = h / fcMax
    if (p < 0.6) z[0]++
    else if (p < 0.7) z[1]++
    else if (p < 0.8) z[2]++
    else if (p < 0.9) z[3]++
    else z[4]++
  })
  const tot = hrData.length
  return z.map(v => Math.round(v / tot * 100)) as [number, number, number, number, number]
}
