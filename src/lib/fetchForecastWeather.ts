export interface WeatherForecast {
  temp: number
  precip_prob: number
  precip: number
  precip_recent: number
  wind: number
}

export interface ForecastResult {
  weather: WeatherForecast | null
  weatherNote: string | null
}

export async function fetchForecastWeather(
  startPoint: { lat: number; lon: number },
  raceDate?: string
): Promise<ForecastResult> {
  const raceTs = raceDate ? new Date(raceDate).getTime() : null
  const daysToRace = raceTs ? Math.ceil((raceTs - Date.now()) / 86400000) : null
  const weatherReliable = daysToRace === null || daysToRace <= 10
  if (!weatherReliable) return { weather: null, weatherNote: `Météo disponible à partir de J-10` }
  try {
    const forecastDays = daysToRace === null ? 2 : Math.min(10, Math.max(2, daysToRace + 1))
    const raceDtm = raceDate ? new Date(raceDate) : null
    const raceHour = raceDtm && raceDtm.getHours() > 0 ? raceDtm.getHours() : 9
    const h = (daysToRace !== null && daysToRace > 0 ? daysToRace : 0) * 24 + raceHour
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${startPoint.lat}&longitude=${startPoint.lon}&hourly=temperature_2m,precipitation_probability,precipitation,windspeed_10m&timezone=Europe%2FParis&forecast_days=${forecastDays}`,
      { signal: ctrl.signal }
    )
    clearTimeout(t)
    const d = await r.json()
    const precip6h = ((d.hourly?.precipitation || []) as number[]).slice(Math.max(0, h - 6), h + 1).reduce((a: number, v: number) => a + (v || 0), 0)
    if (d.hourly?.temperature_2m?.[h] != null) {
      const weather: WeatherForecast = {
        temp: d.hourly.temperature_2m[h],
        precip_prob: d.hourly?.precipitation_probability?.[h] ?? 0,
        precip: d.hourly?.precipitation?.[h] ?? 0,
        precip_recent: precip6h,
        wind: d.hourly?.windspeed_10m?.[h] ?? 0,
      }
      const weatherNote = (daysToRace && daysToRace > 0 && !(raceDtm && raceDtm.getHours() > 0)) ? `Météo J+${daysToRace}` : null
      return { weather, weatherNote }
    }
    return { weather: null, weatherNote: 'Météo non disponible' }
  } catch {
    return { weather: null, weatherNote: 'Météo indisponible' }
  }
}
