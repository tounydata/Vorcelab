import { describe, it, expect, vi } from 'vitest'
import { createSecureStorage, type SecureBackend, type LegacyBackend } from '../mobile/src/lib/secureStorage'
import { splitIntoChunks, joinChunks, CHUNK_SIZE } from '../mobile/src/lib/secureStorageChunks'

// Faux Keychain / Keystore en mémoire (comportement d'expo-secure-store).
function makeSecure(initial: Record<string, string> = {}): SecureBackend & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    store,
    getItemAsync: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    setItemAsync: vi.fn(async (k: string, v: string) => { store.set(k, v) }),
    deleteItemAsync: vi.fn(async (k: string) => { store.delete(k) }),
  }
}

function makeLegacy(initial: Record<string, string> = {}): LegacyBackend & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    store,
    getItem: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    removeItem: vi.fn(async (k: string) => { store.delete(k) }),
  }
}

const KEY = 'sb-wanzrkdgqmcctwvnbmuv-auth-token'
const bigToken = 'x'.repeat(CHUNK_SIZE * 3 + 42) // dépasse largement la limite 2 Ko

describe('secureStorageChunks', () => {
  it('découpe puis réassemble une valeur à l’identique', () => {
    const parts = splitIntoChunks(bigToken, CHUNK_SIZE)
    expect(parts.length).toBe(4)
    expect(parts.every((p) => p.length <= CHUNK_SIZE)).toBe(true)
    expect(joinChunks(parts)).toBe(bigToken)
  })

  it('gère la chaîne vide', () => {
    expect(joinChunks(splitIntoChunks('', CHUNK_SIZE))).toBe('')
  })
})

describe('createSecureStorage', () => {
  it('écrit et relit un gros token via le fragmentage (round-trip)', async () => {
    const secure = makeSecure()
    const s = createSecureStorage({ secure })
    await s.setItem(KEY, bigToken)
    expect(await s.getItem(KEY)).toBe(bigToken)
  })

  it('ne stocke jamais la valeur en un seul fragment > limite', async () => {
    const secure = makeSecure()
    const s = createSecureStorage({ secure })
    await s.setItem(KEY, bigToken)
    for (const [, v] of secure.store) expect(v.length).toBeLessThanOrEqual(CHUNK_SIZE)
  })

  it('supprime tous les fragments à removeItem', async () => {
    const secure = makeSecure()
    const s = createSecureStorage({ secure })
    await s.setItem(KEY, bigToken)
    await s.removeItem(KEY)
    expect(secure.store.size).toBe(0)
    expect(await s.getItem(KEY)).toBeNull()
  })

  it('ne laisse pas de fragments périmés quand on écrase par une valeur plus courte', async () => {
    const secure = makeSecure()
    const s = createSecureStorage({ secure })
    await s.setItem(KEY, bigToken)
    await s.setItem(KEY, 'court')
    expect(await s.getItem(KEY)).toBe('court')
    // 1 fragment + 1 compteur = 2 entrées, pas les anciens fragments.
    expect(secure.store.size).toBe(2)
  })

  it('migre une session depuis AsyncStorage puis vide l’ancien stockage', async () => {
    const secure = makeSecure()
    const legacy = makeLegacy({ [KEY]: bigToken })
    const s = createSecureStorage({ secure, legacy })
    expect(await s.getItem(KEY)).toBe(bigToken) // lit depuis legacy et migre
    expect(legacy.store.has(KEY)).toBe(false)   // ancien stockage vidé
    // Deuxième lecture : vient du stockage sécurisé, plus de legacy.
    legacy.getItem = vi.fn(async () => { throw new Error('ne doit pas être appelé') })
    expect(await s.getItem(KEY)).toBe(bigToken)
  })

  it('renvoie null et signale (sans token) si la lecture sécurisée échoue', async () => {
    const secure = makeSecure()
    secure.getItemAsync = vi.fn(async () => { throw new Error('keychain locked') })
    const onError = vi.fn()
    const s = createSecureStorage({ secure, onError })
    expect(await s.getItem(KEY)).toBeNull()
    expect(onError).toHaveBeenCalledWith('get', expect.any(Error))
  })

  it('relance et signale si l’écriture échoue (perte de session non masquée)', async () => {
    const secure = makeSecure()
    secure.setItemAsync = vi.fn(async () => { throw new Error('disk full') })
    const onError = vi.fn()
    const s = createSecureStorage({ secure, onError })
    await expect(s.setItem(KEY, 'v')).rejects.toThrow('disk full')
    expect(onError).toHaveBeenCalledWith('set', expect.any(Error))
  })

  it('un fragment manquant → session considérée absente (null)', async () => {
    const secure = makeSecure()
    const s = createSecureStorage({ secure })
    await s.setItem(KEY, bigToken)
    // On corrompt : supprime un fragment du milieu.
    await secure.deleteItemAsync(`${KEY}.chunk.1`)
    expect(await s.getItem(KEY)).toBeNull()
  })
})
