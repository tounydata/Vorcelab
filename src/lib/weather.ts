export interface WeatherData {
  temp: number | null
  wind: number | null
  precip: number | null
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
