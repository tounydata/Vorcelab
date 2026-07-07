export interface WeatherData {
  temp: number | null
  wind: number | null
  precip: number | null
}

// Prefer Strava average_temp (already in DB) over Open-Meteo for temp.
// Wind/precip always come from Open-Meteo (Strava doesn't expose them).
export function mergeStravaTemp(stravaTemp: number | null | undefined, apiWeather: WeatherData | null): WeatherData | null {
  if (stravaTemp == null) return apiWeather
  return {
    temp: stravaTemp,
    wind: apiWeather?.wind ?? null,
    precip: apiWeather?.precip ?? null,
  }
}

// ── Chaleur ressentie EN COURSE (pour corréler à la dérive cardiaque) ───────────
// Contrairement à average_temp (une seule moyenne), on récupère la température
// ressentie (apparent_temperature Open-Meteo : intègre humidité + vent + soleil)
// HEURE PAR HEURE sur la durée réelle de la course, et on isole la 2ᵉ MOITIÉ —
// là où la dérive cardiaque se joue. average_temp Strava sert de garde-fou : si
// l'API diverge fortement, on s'en méfie et on retombe sur la donnée montre.
export interface RaceHeat {
  /** Température de l'air moyenne sur la course (°C). */
  avgTempC: number | null
  /** Ressenti moyen sur la course (°C, apparent_temperature). */
  avgApparentC: number | null
  /** Ressenti moyen sur la 2ᵉ moitié de la course (°C) — pertinent pour la dérive. */
  secondHalfApparentC: number | null
  /** 'api' = Open-Meteo ; 'strava' = repli garde-fou sur average_temp. */
  source: 'api' | 'strava'
}

function mean(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x))
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

export async function fetchRaceHeat(
  lat: number, lon: number, startIso: string, durationS: number, stravaAvgTemp: number | null,
): Promise<RaceHeat | null> {
  const stravaFallback = (): RaceHeat | null => stravaAvgTemp != null
    ? { avgTempC: stravaAvgTemp, avgApparentC: stravaAvgTemp, secondHalfApparentC: stravaAvgTemp, source: 'strava' }
    : null
  const date = startIso.slice(0, 10)
  const startHour = Math.min(23, Math.max(0, parseInt(startIso.split('T')[1]?.split(':')[0] ?? '12', 10)))
  if (!Number.isFinite(new Date(date).getTime())) return stravaFallback()
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${date}&end_date=${date}&hourly=temperature_2m,apparent_temperature&timezone=auto`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return stravaFallback()
    const d = await r.json()
    const temps: number[] = d.hourly?.temperature_2m ?? []
    const app: number[] = d.hourly?.apparent_temperature ?? []
    if (!temps.length) return stravaFallback()
    const h0 = Math.min(startHour, temps.length - 1)
    const h1 = Math.min(temps.length - 1, h0 + Math.max(0, Math.round(durationS / 3600)))
    const idx = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
    const mid = Math.floor((h0 + h1) / 2)
    const secondIdx = idx.filter((h) => h >= mid)
    const avgTempC = mean(idx.map((h) => temps[h]))
    const avgApparentC = mean(idx.map((h) => app[h]))
    const secondHalfApparentC = mean(secondIdx.map((h) => app[h])) ?? avgApparentC
    // Garde-fou : capteur montre vs API air. Écart > 6 °C ⇒ on se méfie de l'API.
    if (stravaAvgTemp != null && avgTempC != null && Math.abs(avgTempC - stravaAvgTemp) > 6) {
      return { avgTempC: stravaAvgTemp, avgApparentC: stravaAvgTemp, secondHalfApparentC: stravaAvgTemp, source: 'strava' }
    }
    if (avgApparentC == null && avgTempC == null) return stravaFallback()
    return { avgTempC, avgApparentC, secondHalfApparentC, source: 'api' }
  } catch {
    return stravaFallback()
  }
}

// Open-Meteo historical archive — free, no API key
export async function fetchActivityWeather(lat: number, lon: number, dateTimeIso: string): Promise<WeatherData | null> {
  const date = dateTimeIso.slice(0, 10)
  const hour = Math.min(23, parseInt(dateTimeIso.split('T')[1]?.split(':')[0] ?? '12', 10))
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${date}&end_date=${date}&hourly=temperature_2m,windspeed_10m,precipitation&timezone=auto`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json()
    const temps: number[] = d.hourly?.temperature_2m ?? []
    const winds: number[] = d.hourly?.windspeed_10m ?? []
    const precips: number[] = d.hourly?.precipitation ?? []
    if (!temps.length) return null
    const h = Math.min(hour, temps.length - 1)
    return {
      temp: temps[h] ?? null,
      wind: winds[h] ?? null,
      precip: precips[h] ?? null,
    }
  } catch {
    return null
  }
}
