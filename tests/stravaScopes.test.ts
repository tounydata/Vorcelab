import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasRequiredStravaActivityScope as webHasScope } from '../src/lib/stravaScopes'
import { hasRequiredStravaActivityScope as mobileHasScope } from '../mobile/src/lib/stravaScopes'
import { hasRequiredStravaActivityScope as edgeHasScope } from '../supabase/functions/_shared/stravaScopes'

const implementations = [
  ['web', webHasScope],
  ['mobile', mobileHasScope],
  ['edge', edgeHasScope],
] as const

describe('scope Strava requis pour synchroniser les activités', () => {
  it.each(implementations)('%s accepte activity:read_all', (_name, hasScope) => {
    expect(hasScope('read,activity:read_all')).toBe(true)
    expect(hasScope('read activity:read_all')).toBe(true)
    expect(hasScope(' activity:read_all ')).toBe(true)
  })

  it.each(implementations)('%s refuse les autorisations insuffisantes', (_name, hasScope) => {
    expect(hasScope('read')).toBe(false)
    expect(hasScope('read,activity:read')).toBe(false)
    expect(hasScope('')).toBe(false)
    expect(hasScope(null)).toBe(false)
    expect(hasScope(undefined)).toBe(false)
    expect(hasScope(['read', 'activity:read_all'])).toBe(false)
  })

  it('garde les implémentations web, mobile et Edge strictement identiques', () => {
    const web = readFileSync(resolve('src/lib/stravaScopes.ts'), 'utf8')
    const mobile = readFileSync(resolve('mobile/src/lib/stravaScopes.ts'), 'utf8')
    const edge = readFileSync(resolve('supabase/functions/_shared/stravaScopes.ts'), 'utf8')
    expect(mobile).toBe(web)
    expect(edge).toBe(web)
  })
})
