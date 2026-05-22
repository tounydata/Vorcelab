export interface Activity {
  id: number
  name: string
  type: string
  sport_type: string
  start_date: string
  start_date_local: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  average_speed: number
  max_speed: number
  average_heartrate?: number
  max_heartrate?: number
  kilojoules?: number
  start_latlng?: [number, number]
}

export function mapDbActivity(row: Record<string, unknown>): Activity {
  const raw = (row.raw_data as Record<string, unknown>) ?? {}
  const rawType = (row.type as string) || 'Run'
  const sportType = (row.sport_type as string) || ''
  const normalizedType = /trail/i.test(rawType) || /trail/i.test(sportType) ? 'TrailRun' : rawType
  return {
    id: Number(row.strava_activity_id),
    name: (row.name as string) || '',
    type: normalizedType,
    sport_type: sportType,
    start_date: (row.start_date as string) || '',
    start_date_local: (row.start_date_local as string) || '',
    distance: Number(row.distance ?? 0),
    moving_time: Number(row.moving_time ?? 0),
    elapsed_time: Number(row.elapsed_time ?? 0),
    total_elevation_gain: Number(row.total_elevation_gain ?? 0),
    average_speed: Number(row.average_speed ?? 0),
    max_speed: Number(row.max_speed ?? 0),
    average_heartrate: row.average_heartrate != null ? Number(row.average_heartrate) : undefined,
    max_heartrate: row.max_heartrate != null ? Number(row.max_heartrate) : undefined,
    kilojoules: typeof raw.kilojoules === 'number' ? raw.kilojoules : undefined,
    start_latlng: Array.isArray(raw.start_latlng) ? (raw.start_latlng as [number, number]) : undefined,
  }
}
