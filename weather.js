// weather.js — fetching météo centralisé
// Historical: Open Meteo archive (runner-profile.js, activity-analysis.js)
// Forecast: Open Meteo forecast (race-strategy.js)
// Extraction de activity-analysis.js + race-strategy.js → résout le risque circulaire
// runner-profile.js importait fetchWeather depuis activity-analysis.js ; les deux importent weather.js désormais.

export async function fetchWeather(lat, lon, date) {
  const d = date.split('T')[0], h = parseInt(date.split('T')[1]?.split(':')[0] || 10);
  try {
    const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${d}&end_date=${d}&hourly=temperature_2m,precipitation,windspeed_10m&timezone=Europe%2FParis`);
    const data = await r.json();
    return { temp: data.hourly?.temperature_2m?.[h] ?? null, precip: data.hourly?.precipitation?.[h] ?? null, wind: data.hourly?.windspeed_10m?.[h] ?? null };
  } catch { return null; }
}

// Forecast — returns { weather, weatherNote }
// startPoint = { lat, lon } (first GPX point)
// currentRaceContext = VLState.currentRaceContext (may be null)
export async function fetchForecastWeather(startPoint, currentRaceContext) {
  const raceTs = currentRaceContext?.date ? new Date(currentRaceContext.date).getTime() : null;
  const daysToRace = raceTs ? Math.ceil((raceTs - Date.now()) / 86400000) : null;
  const weatherReliable = daysToRace === null || daysToRace <= 10;
  if (!weatherReliable) return { weather: null, weatherNote: `Météo disponible à partir de J-10` };
  try {
    const forecastDays = daysToRace === null ? 2 : Math.min(10, Math.max(2, daysToRace + 1));
    const raceDtm = currentRaceContext?.date ? new Date(currentRaceContext.date) : null;
    const raceHour = raceDtm && raceDtm.getHours() > 0 ? raceDtm.getHours() : 9;
    const h = (daysToRace !== null && daysToRace > 0 ? daysToRace : 0) * 24 + raceHour;
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${startPoint.lat}&longitude=${startPoint.lon}&hourly=temperature_2m,precipitation_probability,precipitation,windspeed_10m&timezone=Europe%2FParis&forecast_days=${forecastDays}`);
    const d = await r.json();
    const precip6h = (d.hourly?.precipitation || []).slice(Math.max(0, h - 6), h + 1).reduce((a, v) => a + (v || 0), 0);
    if (d.hourly?.temperature_2m?.[h] != null) {
      const weather = { temp: d.hourly.temperature_2m[h], precip_prob: d.hourly?.precipitation_probability?.[h] ?? 0, precip: d.hourly?.precipitation?.[h] ?? 0, precip_recent: precip6h, wind: d.hourly?.windspeed_10m?.[h] };
      const weatherNote = (daysToRace && daysToRace > 0 && !(raceDtm && raceDtm.getHours() > 0)) ? `Météo J+${daysToRace}` : null;
      return { weather, weatherNote };
    }
    return { weather: null, weatherNote: 'Météo non disponible' };
  } catch { return { weather: null, weatherNote: 'Météo indisponible' }; }
}
