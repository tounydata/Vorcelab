// Fond de carte (relief ombré) derrière le tracé GPS, aligné au pixel.
// On assemble des TUILES raster (endpoint gratuit MapTiler /tiles) plutôt qu'une image
// statique (l'API Static Maps de MapTiler est payante). Projection Web Mercator partagée
// entre les tuiles et le SVG du tracé → superposition exacte.
// Clé via env VITE_MAPTILER_KEY (sinon clé par défaut). Sans clé → pas de fond (repli sombre).

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

// Clé MapTiler frontend par défaut (publique dans le bundle navigateur, c'est normal).
// Protégée côté MapTiler par restriction d'origine HTTP : tounydata.github.io + localhost.
// Surchargeable via VITE_MAPTILER_KEY.
const DEFAULT_MAPTILER_KEY = 'UIAKCRlncKBkhN0ZLh8q'

function readEnv(): Record<string, string | undefined> {
  try { return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {} } catch { return {} }
}

export interface MapTile { url: string; left: number; top: number; size: number }
export interface TileGrid { tiles: MapTile[]; attribution: string }

/** Construit la grille de tuiles couvrant le cadre w×h, positionnées au pixel (left/top/size). */
function buildGrid(center: Center, w: number, h: number, maxTz: number, urlFor: (z: number, x: number, y: number) => string): TileGrid {
  const Z = center.zoom
  const tz = Math.max(0, Math.min(maxTz, Math.round(Z)))
  const scale = 2 ** (Z - tz)        // px d'affichage par px de tuile
  const disp = TILE * scale          // taille d'une tuile à l'écran
  const c = worldXY(center.lon, center.lat, Z)
  const originX = c.x - w / 2        // coin haut-gauche du cadre, en px-monde au zoom Z
  const originY = c.y - h / 2
  const n = 2 ** tz                  // nombre de tuiles par côté à ce zoom
  const x0 = Math.floor(originX / disp)
  const y0 = Math.floor(originY / disp)
  const nx = Math.ceil(w / disp) + 1
  const ny = Math.ceil(h / disp) + 1
  const tiles: MapTile[] = []
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const tx = x0 + i, ty = y0 + j
      if (ty < 0 || ty >= n) continue
      const wx = ((tx % n) + n) % n  // wrap longitude (les méridiens, pas les pôles)
      tiles.push({ url: urlFor(tz, wx, ty), left: tx * disp - originX, top: ty * disp - originY, size: disp })
    }
  }
  return { tiles, attribution: '' }
}

/** Grille de tuiles relief/sombre selon la clé dispo (MapTiler prioritaire). null sinon. */
export function tileGrid(center: Center, w: number, h: number): TileGrid | null {
  const env = readEnv()
  const key = env.VITE_MAPTILER_KEY || DEFAULT_MAPTILER_KEY
  if (key) {
    const tileset = env.VITE_MAPTILER_TILESET || 'hillshade'  // tileset raster (gratuit), zoom 0–12
    const g = buildGrid(center, w, h, 12, (z, x, y) => `https://api.maptiler.com/tiles/${tileset}/${z}/${x}/${y}.webp?key=${key}`)
    g.attribution = '© MapTiler © OpenStreetMap'
    return g
  }
  const mapbox = env.VITE_MAPBOX_TOKEN
  if (mapbox) {
    const style = env.VITE_MAPBOX_STYLE || 'dark-v11'
    const g = buildGrid(center, w, h, 16, (z, x, y) => `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/${z}/${x}/${y}?access_token=${mapbox}`)
    g.attribution = '© Mapbox © OpenStreetMap'
    return g
  }
  return null
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
  const style = env.VITE_MAPTILER_3D_STYLE || 'satellite'   // ex. outdoor-v2, hybrid, topo-v2, winter-v2
  return {
    style: `https://api.maptiler.com/maps/${style}/style.json?key=${key}`,
    terrain: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
  }
}
