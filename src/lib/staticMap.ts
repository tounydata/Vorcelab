// Fond de carte statique (relief ombré) derrière le tracé GPS, aligné au pixel.
// Projection Web Mercator partagée entre l'image (carte) et le SVG du tracé → ils se
// superposent exactement. Clé via env : VITE_MAPTILER_KEY ou VITE_MAPBOX_TOKEN.
// Sans clé → pas de fond (repli sur l'ancien rendu sombre uni).

const TILE = 256

export interface LngLat { lon: number; lat: number }
export interface Center { lon: number; lat: number; zoom: number }

function worldXY(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const s = TILE * 2 ** zoom
  const x = ((lon + 180) / 360) * s
  const sin = Math.max(-0.9999, Math.min(0.9999, Math.sin((lat * Math.PI) / 180)))
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s
  return { x, y }
}

/** Centre + zoom (fractionnaire) pour faire tenir la bbox dans un cadre w×h (px). */
export function fitBounds(minLon: number, minLat: number, maxLon: number, maxLat: number, w: number, h: number, pad = 0.14): Center {
  const a = worldXY(minLon, maxLat, 0), b = worldXY(maxLon, minLat, 0)
  const dx0 = Math.max(1e-6, Math.abs(b.x - a.x))
  const dy0 = Math.max(1e-6, Math.abs(b.y - a.y))
  const zx = Math.log2((w * (1 - pad)) / dx0)
  const zy = Math.log2((h * (1 - pad)) / dy0)
  const zoom = Math.max(1, Math.min(16.5, Math.min(zx, zy)))
  return { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2, zoom }
}

/** Projette lon/lat → pixel (origine haut-gauche) dans le cadre w×h pour ce centre/zoom. */
export function toPixel(lon: number, lat: number, center: Center, w: number, h: number): { x: number; y: number } {
  const c = worldXY(center.lon, center.lat, center.zoom)
  const p = worldXY(lon, lat, center.zoom)
  return { x: p.x - c.x + w / 2, y: p.y - c.y + h / 2 }
}

/** URL d'image statique relief/sombre selon la clé dispo (MapTiler prioritaire). null sinon. */
// Clé MapTiler frontend par défaut (de toute façon publique dans le bundle navigateur).
// Sa protection = restriction d'origine HTTP côté MapTiler (à faire sur tounydata.github.io).
// Surchargeable via VITE_MAPTILER_KEY.
const DEFAULT_MAPTILER_KEY = 'z1rdNuaZU26r1yGwRKAD'

export function staticMapUrl(center: Center, w: number, h: number): string | null {
  let env: Record<string, string | undefined> = {}
  try { env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {} } catch { env = {} }
  const maptiler = env.VITE_MAPTILER_KEY || DEFAULT_MAPTILER_KEY
  if (maptiler) {
    const style = env.VITE_MAPTILER_STYLE || 'hillshade'
    return `https://api.maptiler.com/maps/${style}/static/${center.lon.toFixed(5)},${center.lat.toFixed(5)},${center.zoom.toFixed(2)}/${Math.round(w)}x${Math.round(h)}@2x.png?key=${maptiler}`
  }
  const mapbox = env.VITE_MAPBOX_TOKEN
  if (mapbox) {
    const style = env.VITE_MAPBOX_STYLE || 'dark-v11'
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${center.lon.toFixed(5)},${center.lat.toFixed(5)},${center.zoom.toFixed(2)},0/${Math.round(w)}x${Math.round(h)}@2x?access_token=${mapbox}`
  }
  return null
}
