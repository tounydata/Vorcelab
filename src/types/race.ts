export interface GpxPoint { lat: number; lon: number; ele: number | null }

export interface Race {
  id: string         // UUID string (race_calendar.id est uuid en DB)
  name: string
  date: string
  type: string       // 'Trail' | 'TrailRun' | 'Run' | 'Route' etc.
  distance: number   // metres, may be 0 if not set
  goal_time?: string // e.g. "4h30"
  gpx_data?: GpxPoint[] | null
  last_projection?: {
    cible: number; prudent: number; agressif: number; confidence: string
  } | null
  strava_activity_id?: number | null
  share_token?: string | null
}

export function mapDbRace(row: Record<string, unknown>): Race {
  return {
    id: String(row.id),   // UUID → string, pas Number() qui donne NaN
    name: (row.name as string) || '',
    date: (row.date as string) || '',
    type: (row.type as string) || 'Run',
    distance: Number(row.distance ?? 0),
    goal_time: (row.goal_time as string) ?? undefined,
    gpx_data: Array.isArray(row.gpx_data) ? (row.gpx_data as GpxPoint[]) : null,
    last_projection: (row.last_projection as Race['last_projection']) ?? null,
    strava_activity_id: row.strava_activity_id != null ? Number(row.strava_activity_id) : null,
    share_token: (row.share_token as string | null) ?? null,
  }
}
