const RUNNING_TYPES = new Set(['Run', 'TrailRun', 'Trail Run', 'Running', 'VirtualRun'])

export function isRun(type: string): boolean {
  return RUNNING_TYPES.has(type)
}

export function fmtP(speedMs: number): string {
  if (!speedMs) return '--'
  const secPerKm = 1000 / speedMs
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtD(seconds: number): string {
  if (!seconds) return '0min'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

const TYPE_LABELS: Record<string, string> = {
  Run: 'Route',
  TrailRun: 'Trail',
  'Trail Run': 'Trail',
  VirtualRun: 'Virtual',
  Running: 'Route',
}

export function tL(type: string): string {
  return TYPE_LABELS[type] ?? type
}
