// Helpers de formatage — distances Strava en mètres, vitesses en m/s.

export function km(meters: number, digits = 1) {
  return (meters / 1000).toFixed(digits)
}

/** Allure en min/km à partir d'une vitesse moyenne (m/s). */
export function pace(speedMs: number | null | undefined) {
  if (!speedMs || speedMs <= 0) return '—'
  const secPerKm = 1000 / speedMs
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}/km`
}

/** Durée hh'mm ou mm'ss à partir de secondes. */
export function duration(sec: number | null | undefined) {
  if (!sec || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  const s = Math.round(sec % 60)
  return `${m}'${String(s).padStart(2, '0')}`
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export function shortDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'Trail Run', 'Running'])
export const isRunning = (type?: string | null) => !!type && RUN_TYPES.has(type)
