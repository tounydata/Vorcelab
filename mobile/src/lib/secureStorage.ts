// Adaptateur de stockage sécurisé pour la session Supabase (mobile).
//
// Les jetons d'auth (access/refresh token) sont stockés dans le Keychain iOS /
// Keystore Android via expo-secure-store — un magasin chiffré au niveau OS —
// au lieu d'AsyncStorage (base SQLite en clair, lisible sur un appareil rooté
// ou via une sauvegarde non chiffrée).
//
// Deux contraintes techniques traitées ici :
//   1. expo-secure-store limite chaque valeur à ~2048 octets ; or une session
//      Supabase (JWT + refresh token + user) dépasse cette taille → on découpe
//      la valeur en fragments (chunks) réassemblés à la lecture.
//   2. Migration transparente depuis l'ancien stockage AsyncStorage : au premier
//      accès, si la valeur existe encore côté AsyncStorage, on la recopie dans le
//      stockage sécurisé puis on l'efface de l'ancien.
//
// Ce module n'importe AUCUNE dépendance native : les back-ends sont injectés,
// ce qui le rend testable en environnement Node (vitest) et découple la logique
// (découpage/migration/erreurs) de l'intégration Expo faite dans supabase.ts.

import { CHUNK_SIZE, chunkCountKey, chunkKey, joinChunks, splitIntoChunks } from './secureStorageChunks'

/** Sous-ensemble d'expo-secure-store utilisé par l'adaptateur. */
export interface SecureBackend {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

/** Sous-ensemble d'AsyncStorage nécessaire à la migration (lecture + purge). */
export interface LegacyBackend {
  getItem(key: string): Promise<string | null>
  removeItem(key: string): Promise<void>
}

/** Interface attendue par supabase-js (option `auth.storage`). */
export interface SupabaseStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface SecureStorageOptions {
  secure: SecureBackend
  /** Ancien stockage à migrer puis vider. Optionnel (ex. installation neuve). */
  legacy?: LegacyBackend
  /**
   * Rapport d'erreur sans fuite de secret : reçoit l'opération et l'erreur, jamais
   * la valeur stockée. Par défaut : console.warn du message seul. Ne JAMAIS y
   * journaliser le token.
   */
  onError?: (op: 'get' | 'set' | 'remove', error: unknown) => void
}

const defaultOnError = (op: 'get' | 'set' | 'remove', error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  // Message uniquement — jamais la clé ni la valeur (token).
  console.warn(`secureStorage: échec ${op} (${message})`)
}

async function readChunks(secure: SecureBackend, key: string): Promise<string | null> {
  const rawCount = await secure.getItemAsync(chunkCountKey(key))
  if (rawCount == null) return null
  const count = Number.parseInt(rawCount, 10)
  if (!Number.isInteger(count) || count < 0) return null
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    const part = await secure.getItemAsync(chunkKey(key, i))
    if (part == null) return null // fragment manquant → session incomplète, on la considère absente
    parts.push(part)
  }
  return joinChunks(parts)
}

async function clearChunks(secure: SecureBackend, key: string): Promise<void> {
  const rawCount = await secure.getItemAsync(chunkCountKey(key))
  if (rawCount == null) return
  const count = Number.parseInt(rawCount, 10)
  if (Number.isInteger(count) && count >= 0) {
    for (let i = 0; i < count; i++) await secure.deleteItemAsync(chunkKey(key, i))
  }
  await secure.deleteItemAsync(chunkCountKey(key))
}

/**
 * Construit l'adaptateur de stockage sécurisé.
 * @throws jamais à la construction ; les erreurs surviennent aux opérations.
 */
export function createSecureStorage(opts: SecureStorageOptions): SupabaseStorage {
  const { secure, legacy } = opts
  const onError = opts.onError ?? defaultOnError

  return {
    async getItem(key: string): Promise<string | null> {
      try {
        const stored = await readChunks(secure, key)
        if (stored != null) return stored

        // Migration one-shot depuis AsyncStorage (ancien stockage en clair).
        if (legacy) {
          const legacyValue = await legacy.getItem(key)
          if (legacyValue != null) {
            await writeChunks(secure, key, legacyValue)
            await legacy.removeItem(key)
            return legacyValue
          }
        }
        return null
      } catch (error) {
        // Lecture impossible (Keychain verrouillé, etc.) : on signale et on
        // renvoie null (l'utilisateur devra se reconnecter) plutôt que de crasher
        // l'initialisation de l'auth. Jamais de token journalisé.
        onError('get', error)
        return null
      }
    },

    async setItem(key: string, value: string): Promise<void> {
      try {
        await writeChunks(secure, key, value)
      } catch (error) {
        // Une écriture ratée doit être visible (session non persistée) : on
        // signale ET on relance pour ne pas masquer la perte de session.
        onError('set', error)
        throw error
      }
    },

    async removeItem(key: string): Promise<void> {
      try {
        await clearChunks(secure, key)
        if (legacy) await legacy.removeItem(key)
      } catch (error) {
        onError('remove', error)
        throw error
      }
    },
  }
}

async function writeChunks(secure: SecureBackend, key: string, value: string): Promise<void> {
  await clearChunks(secure, key) // évite les fragments périmés d'une valeur plus longue
  const parts = splitIntoChunks(value, CHUNK_SIZE)
  for (let i = 0; i < parts.length; i++) await secure.setItemAsync(chunkKey(key, i), parts[i])
  await secure.setItemAsync(chunkCountKey(key), String(parts.length))
}
