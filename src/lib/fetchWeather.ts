export interface WeatherData {
  temp: number | null
  precip: number | null
  wind: number | null
}

export async function fetchWeather(lat: number, lon: number, date: string): Promise<WeatherData | null> {
  const d = date.split('T')[0]
  const h = parseInt(date.split('T')[1]?.split(':')[0] || '10')
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${d}&end_date=${d}&hourly=temperature_2m,precipitation,windspeed_10m&timezone=Europe%2FParis`,
      { signal: ctrl.signal },
    )
    clearTimeout(t)
    const data = await r.json()
    return {
      temp: data.hourly?.temperature_2m?.[h] ?? null,
      precip: data.hourly?.precipitation?.[h] ?? null,
      wind: data.hourly?.windspeed_10m?.[h] ?? null,
    }
  } catch {
    return null
  }
}
