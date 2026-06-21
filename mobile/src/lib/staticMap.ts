// Fond de carte (relief ombré) derrière le tracé GPS. Portage mobile de
// ../../src/lib/staticMap.ts — seul `readEnv` change (process.env.EXPO_PUBLIC_*
// au lieu de import.meta.env de Vite). Les URLs de tuiles sont identiques.

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

// Clé MapTiler publique par défaut (idem web). Surchargeable via EXPO_PUBLIC_MAPTILER_KEY.
const DEFAULT_MAPTILER_KEY = 'UIAKCRlncKBkhN0ZLh8q'

function readEnv(): Record<string, string | undefined> {
  return {
    VITE_MAPTILER_KEY: process.env.EXPO_PUBLIC_MAPTILER_KEY,
    VITE_MAPTILER_TILESET: process.env.EXPO_PUBLIC_MAPTILER_TILESET,
    VITE_MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
    VITE_MAPBOX_STYLE: process.env.EXPO_PUBLIC_MAPBOX_STYLE,
    VITE_MAPTILER_3D_STYLE: process.env.EXPO_PUBLIC_MAPTILER_3D_STYLE,
  }
}

export interface ReliefLayer { url: string; attribution: string; maxNativeZoom: number }

/** Modèle d'URL de tuiles relief pour Leaflet ({z}/{x}/{y}), ou null si pas de clé. */
export function reliefTileLayer(): ReliefLayer | null {
  const env = readEnv()
  const key = env.VITE_MAPTILER_KEY || DEFAULT_MAPTILER_KEY
  if (key) {
    const tileset = env.VITE_MAPTILER_TILESET || 'hillshade'
    return { url: `https://api.maptiler.com/tiles/${tileset}/{z}/{x}/{y}.webp?key=${key}`, attribution: '© MapTiler © OpenStreetMap', maxNativeZoom: 12 }
  }
  const mapbox = env.VITE_MAPBOX_TOKEN
  if (mapbox) {
    const style = env.VITE_MAPBOX_STYLE || 'dark-v11'
    return { url: `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/{z}/{x}/{y}?access_token=${mapbox}`, attribution: '© Mapbox © OpenStreetMap', maxNativeZoom: 16 }
  }
  return null
}

export interface Map3DConfig { style: string; terrain: string }

/** Config carte 3D MapLibre (style vectoriel + DEM terrain MapTiler), ou null sans clé. */
export function mapTiler3DConfig(): Map3DConfig | null {
  const env = readEnv()
  const key = env.VITE_MAPTILER_KEY || DEFAULT_MAPTILER_KEY
  if (!key) return null
  const style = env.VITE_MAPTILER_3D_STYLE || 'satellite'
  return {
    style: `https://api.maptiler.com/maps/${style}/style.json?key=${key}`,
    terrain: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
  }
}
