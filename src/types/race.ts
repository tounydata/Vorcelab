export interface GpxPoint { lat: number; lon: number; ele: number | null }

export interface Race {
  id: number
  name: string
  date: string
  type: string       // 'Trail' | 'TrailRun' | 'Run' | 'Route' etc.
  distance: number   // metres, may be 0 if not set
  goal_time?: string // e.g. "4h30"
  gpx_data?: GpxPoint[] | null
  last_projection?: {
    cible: number; prudent: number; agressif: number; confidence: string
  } | null
}

export function mapDbRace(row: Record<string, unknown>): Race {
  return {
    id: Number(row.id),
    name: (row.name as string) || '',
    date: (row.date as string) || '',
    type: (row.type as string) || 'Run',
    distance: Number(row.distance ?? 0),
    goal_time: (row.goal_time as string) ?? undefined,
    gpx_data: Array.isArray(row.gpx_data) ? (row.gpx_data as GpxPoint[]) : null,
    last_projection: (row.last_projection as Race['last_projection']) ?? null,
  }
}
