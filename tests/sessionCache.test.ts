import { describe, it, expect, vi } from 'vitest'
import { purgeDangerousCaches } from '../src/lib/session'

// Mock minimal de l'API CacheStorage du navigateur.
function makeCacheStorage(names: string[]) {
  const deleted: string[] = []
  const storage = {
    keys: vi.fn(async () => names),
    delete: vi.fn(async (name: string) => {
      deleted.push(name)
      return names.includes(name)
    }),
  } as unknown as CacheStorage
  return { storage, deleted }
}

describe('purgeDangerousCaches', () => {
  it('supprime le cache authentifié dangereux (supabase-api) laissé par un ancien SW', async () => {
    const { storage, deleted } = makeCacheStorage(['maplibre-lib', 'supabase-api', 'maptiler-tiles'])
    await purgeDangerousCaches(storage)
    expect(deleted).toEqual(['supabase-api'])
  })

  it('ne touche pas aux caches non sensibles (tuiles cartographiques)', async () => {
    const { storage, deleted } = makeCacheStorage(['maplibre-lib', 'maptiler-tiles', 'map-tiles'])
    await purgeDangerousCaches(storage)
    expect(deleted).toEqual([])
  })

  it("ne plante pas quand l'API Cache est absente (SSR / environnement Node)", async () => {
    await expect(purgeDangerousCaches(undefined)).resolves.toBeUndefined()
  })
})
