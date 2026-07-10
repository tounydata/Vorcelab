// Fonctions pures de découpage pour le stockage sécurisé (aucune dépendance
// native → testable partout). expo-secure-store limite chaque valeur à ~2048
// octets ; on garde une marge pour les caractères multi-octets.
export const CHUNK_SIZE = 1800

/** Découpe une chaîne en fragments d'au plus `size` caractères. */
export function splitIntoChunks(value: string, size: number = CHUNK_SIZE): string[] {
  if (size <= 0) throw new Error('splitIntoChunks: size doit être > 0')
  if (value.length === 0) return ['']
  const parts: string[] = []
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size))
  return parts
}

/** Réassemble les fragments dans l'ordre. */
export function joinChunks(parts: string[]): string {
  return parts.join('')
}

/** Clé du fragment i d'une valeur. */
export function chunkKey(baseKey: string, index: number): string {
  return `${baseKey}.chunk.${index}`
}

/** Clé stockant le nombre de fragments d'une valeur. */
export function chunkCountKey(baseKey: string): string {
  return `${baseKey}.chunkCount`
}
