export const REQUIRED_STRAVA_ACTIVITY_SCOPE = 'activity:read_all'

export function parseStravaScopes(scope: unknown): Set<string> {
  if (typeof scope !== 'string') return new Set()
  return new Set(
    scope
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

export function hasRequiredStravaActivityScope(scope: unknown): boolean {
  return parseStravaScopes(scope).has(REQUIRED_STRAVA_ACTIVITY_SCOPE)
}
