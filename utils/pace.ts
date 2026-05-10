export function speedToPace(speedMs: number): string {
  if (speedMs <= 0) return '—'
  const secondsPerKm = 1000 / speedMs
  const minutes = Math.floor(secondsPerKm / 60)
  const seconds = Math.round(secondsPerKm % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function metresToKm(metres: number): string {
  return (metres / 1000).toFixed(1)
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}`
  return `${minutes}min`
}

export function formatDate(value: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(
    new Date(value)
  )
}
