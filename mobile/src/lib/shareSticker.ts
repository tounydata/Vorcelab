// Stickers de partage (stories) — partie PURE (sans canvas/DOM). Le dessin Canvas
// vit dans la WebView de ShareStickers (mobile) ; ici on garde les types + la
// logique de sélection de variante et de format, identiques au web.

export type StickerVariant = 'stats' | 'trace' | 'profile' | 'ribbon3d'

export interface StickerData {
  movingTimeS: number
  distanceM: number
  dplusM: number
  /** Streams alignés (mêmes indices) — optionnels selon la variante. */
  latlng?: [number, number][]
  altitude?: number[]
  /** Distance cumulée (m), alignée sur altitude/latlng. */
  distance?: number[]
}

export const VARIANT_LABELS: Record<StickerVariant, string> = {
  stats: 'Stats', trace: 'Tracé', profile: 'Profil', ribbon3d: '3D',
}

/** Variantes possibles selon les données disponibles. */
export function availableVariants(d: StickerData): StickerVariant[] {
  const out: StickerVariant[] = ['stats']
  if (d.latlng && d.latlng.length > 10) out.push('trace')
  if (d.altitude && d.distance && d.altitude.length > 10) out.push('profile')
  if (d.latlng && d.latlng.length > 10 && d.altitude && d.altitude.length > 10) out.push('ribbon3d')
  return out
}

/** « 2H31 » (H majuscule, accent) ou « 42'17 » sous l'heure. [avant, accent, après] */
export function fmtStickerTime(totalS: number): [string, string, string] {
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return [String(h), 'H', String(m).padStart(2, '0')]
  return [String(m), "'", String(sec).padStart(2, '0')]
}
