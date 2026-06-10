// Stickers de partage (stories) : PNG TRANSPARENTS générés côté client (Canvas),
// du plus sobre au plus riche — stats seules · + tracé GPX · + profil alti ·
// + tracé « ruban 3D » (perspective + parois d'altitude). Tous colorés par effort
// (même palette que le profil de course) et brandés Vorcelab. Aucune dépendance
// serveur : les données viennent de l'activité et de ses streams déjà chargés.

import { HEAT_COLORS, sectionHeat } from './raceStrategyView'

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

function fmtKm(m: number): string {
  return `${(m / 1000).toFixed(1).replace('.', ',')} KM`
}

// ── Helpers dessin ─────────────────────────────────────────────────────────────
const EMBER = '#E5562A'
const INK = '#0c0c0e'
const SANS = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
const MONO = 'ui-monospace, Menlo, Consolas, monospace'

function shadowOn(ctx: CanvasRenderingContext2D, blur = 18) {
  ctx.shadowColor = 'rgba(0,0,0,.55)'
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = 4
}
function shadowOff(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

/** Texte avec interlettrage manuel (letterSpacing canvas pas partout). Centré sur cx. */
function drawSpaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const widths = [...text].map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1)
  let x = cx - total / 2
  ;[...text].forEach((c, i) => {
    ctx.fillText(c, x, y)
    x += widths[i] + spacing
  })
}

/** « 2H31 » centré : chiffres blancs, accent (H ou ') ember. Retourne la hauteur. */
function drawTime(ctx: CanvasRenderingContext2D, parts: [string, string, string], cx: number, y: number, size: number) {
  ctx.font = `900 ${size}px ${SANS}`
  ctx.textBaseline = 'alphabetic'
  const w = parts.map((p) => ctx.measureText(p).width)
  let x = cx - (w[0] + w[1] + w[2]) / 2
  shadowOn(ctx)
  ctx.fillStyle = '#fff'
  ctx.fillText(parts[0], x, y); x += w[0]
  ctx.fillStyle = EMBER
  ctx.fillText(parts[1], x, y); x += w[1]
  ctx.fillStyle = '#fff'
  ctx.fillText(parts[2], x, y)
  shadowOff(ctx)
}

function drawStats(ctx: CanvasRenderingContext2D, d: StickerData, cx: number, y: number, size: number) {
  ctx.font = `700 ${size}px ${MONO}`
  ctx.fillStyle = '#fff'
  shadowOn(ctx, 12)
  drawSpaced(ctx, `${fmtKm(d.distanceM)}   +${Math.round(d.dplusM)} M`, cx, y, size * 0.06)
  shadowOff(ctx)
}

function drawBrand(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number) {
  // pic ember + wordmark
  const t = size * 0.9
  ctx.font = `800 ${size}px ${SANS}`
  const word = 'VORCELAB'
  const spacing = size * 0.34
  const wordW = [...word].reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * (word.length - 1)
  const peakW = t * 1.2
  const startX = cx - (peakW + size * 0.5 + wordW) / 2
  shadowOn(ctx, 8)
  ctx.fillStyle = EMBER
  ctx.beginPath()
  ctx.moveTo(startX, y)
  ctx.lineTo(startX + peakW / 2, y - t)
  ctx.lineTo(startX + peakW, y)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff'
  drawSpaced(ctx, word, startX + peakW + size * 0.5 + wordW / 2, y - size * 0.08, spacing)
  shadowOff(ctx)
}

// ── Données géo : resample + pente locale → couleur effort ─────────────────────
interface Pt { x: number; y: number; alt: number }

/** Lissage (moyenne glissante, 2 passes) — tue le bruit GPS/baro de l'altitude. */
function smooth(arr: number[], r = 3, passes = 2): number[] {
  let out = arr.slice()
  for (let p = 0; p < passes; p++) {
    const next = out.slice()
    for (let i = 0; i < out.length; i++) {
      const a = Math.max(0, i - r), b = Math.min(out.length - 1, i + r)
      let s = 0
      for (let j = a; j <= b; j++) s += out[j]
      next[i] = s / (b - a + 1)
    }
    out = next
  }
  return out
}

/** Hauteur de dessin HONNÊTE pour un dénivelé donné : un parcours plat reste
 *  visuellement plat (12 m de D+ ≠ l'UTMB). ~1.4 px/m, bornée. */
function honestAltHeight(rangeM: number, maxPx: number): number {
  return Math.min(maxPx, Math.max(14, rangeM * 1.4))
}

/** Resample uniforme (indices) + projection équirectangulaire locale, alt brute. */
function resampleRoute(latlng: [number, number][], altitude: number[] | undefined, n: number): Pt[] {
  const len = latlng.length
  const midLat = latlng[Math.floor(len / 2)][0] * Math.PI / 180
  const kx = Math.cos(midLat)
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const idx = Math.min(len - 1, Math.round((i / (n - 1)) * (len - 1)))
    const [lat, lon] = latlng[idx]
    out.push({ x: lon * kx, y: -lat, alt: altitude?.[idx] ?? 0 })
  }
  const alts = smooth(out.map((p) => p.alt))
  return out.map((p, i) => ({ ...p, alt: alts[i] }))
}

/** Couleur effort du segment i (pente lissée sur ±w autour, en % via dist horizontale). */
function segColor(pts: Pt[], distPerStep: number, i: number, w = 4): string {
  const a = Math.max(0, i - w), b = Math.min(pts.length - 1, i + w)
  const dAlt = pts[b].alt - pts[a].alt
  const dDist = Math.max(1, (b - a) * distPerStep)
  const grade = (dAlt / dDist) * 100
  const type = grade > 1.5 ? 'up' : grade < -1.5 ? 'down' : 'flat'
  return HEAT_COLORS[sectionHeat({ type, grade: Math.abs(grade) * (type === 'down' ? -1 : 1) })] || EMBER
}

/** Normalise des points dans une boîte (w×h), centré. Ratio préservé sauf
 *  `stretch` (profil alti : km vs m → axes étirés indépendamment sinon tout est plat). */
function fitBox(pts: Pt[], w: number, h: number, stretch = false): { x: number; y: number }[] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const sx = w / Math.max(1e-9, maxX - minX), sy = h / Math.max(1e-9, maxY - minY)
  const kx = stretch ? sx : Math.min(sx, sy)
  const ky = stretch ? sy : Math.min(sx, sy)
  const ox = (w - (maxX - minX) * kx) / 2, oy = (h - (maxY - minY) * ky) / 2
  return pts.map((p) => ({ x: ox + (p.x - minX) * kx, y: oy + (p.y - minY) * ky }))
}

/** Trace une polyligne colorée par effort : liseré sombre puis segments. */
function strokeHeatPath(
  ctx: CanvasRenderingContext2D, xy: { x: number; y: number }[], pts: Pt[],
  distPerStep: number, width: number,
) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // liseré
  ctx.strokeStyle = INK
  ctx.globalAlpha = 0.5
  ctx.lineWidth = width * 1.9
  ctx.beginPath()
  xy.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.stroke()
  ctx.globalAlpha = 1
  // segments colorés
  ctx.lineWidth = width
  for (let i = 1; i < xy.length; i++) {
    ctx.strokeStyle = segColor(pts, distPerStep, i)
    ctx.beginPath()
    ctx.moveTo(xy[i - 1].x, xy[i - 1].y)
    ctx.lineTo(xy[i].x, xy[i].y)
    ctx.stroke()
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
  ctx.lineWidth = r * 0.45; ctx.strokeStyle = INK; ctx.stroke()
}

// ── Rendu des variantes ────────────────────────────────────────────────────────
const W = 1080
const N = 160 // points resamplés

function footer(ctx: CanvasRenderingContext2D, d: StickerData, timeSize: number, y: number): number {
  drawTime(ctx, fmtStickerTime(d.movingTimeS), W / 2, y, timeSize)
  drawStats(ctx, d, W / 2, y + timeSize * 0.52, timeSize * 0.24)
  drawBrand(ctx, W / 2, y + timeSize * 0.98, timeSize * 0.22)
  return y + timeSize * 1.1
}

function renderOn(h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W; c.height = h
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, W, h) // fond TRANSPARENT
  draw(ctx)
  return c
}

function distPerStepOf(d: StickerData): number {
  const total = d.distance?.[d.distance.length - 1] ?? d.distanceM
  return Math.max(1, total / N)
}

export function renderSticker(variant: StickerVariant, d: StickerData): HTMLCanvasElement {
  if (variant === 'stats') {
    return renderOn(560, (ctx) => { footer(ctx, d, 230, 250) })
  }

  if (variant === 'trace') {
    return renderOn(1240, (ctx) => {
      const pts = resampleRoute(d.latlng!, d.altitude, N)
      const xy = fitBox(pts, W - 240, 660).map((p) => ({ x: p.x + 120, y: p.y + 70 }))
      strokeHeatPath(ctx, xy, pts, distPerStepOf(d), 16)
      dot(ctx, xy[0].x, xy[0].y, 20, EMBER)
      footer(ctx, d, 170, 920)
    })
  }

  if (variant === 'profile') {
    return renderOn(980, (ctx) => {
      const len = d.altitude!.length
      const rawAlts: number[] = []
      const dists: number[] = []
      for (let i = 0; i < N; i++) {
        const idx = Math.min(len - 1, Math.round((i / (N - 1)) * (len - 1)))
        rawAlts.push(d.altitude![idx])
        dists.push(d.distance![idx])
      }
      const alts = smooth(rawAlts)
      const pts: Pt[] = alts.map((a, i) => ({ x: dists[i], y: -a, alt: a }))
      // Échelle verticale honnête : un parcours plat reste plat.
      const range = Math.max(...alts) - Math.min(...alts)
      const boxW = W - 200, boxH = honestAltHeight(range, 360)
      const offY = 80 + (360 - boxH) / 2
      const xy = fitBox(pts, boxW, boxH, true).map((p) => ({ x: p.x + 100, y: p.y + offY }))
      // remplissage dégradé sous la courbe
      const bottom = 80 + boxH + 40
      const grad = ctx.createLinearGradient(0, 80, 0, bottom)
      grad.addColorStop(0, 'rgba(229,86,42,.5)')
      grad.addColorStop(1, 'rgba(229,86,42,.05)')
      ctx.beginPath()
      xy.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.lineTo(xy[xy.length - 1].x, bottom)
      ctx.lineTo(xy[0].x, bottom)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
      strokeHeatPath(ctx, xy, pts, distPerStepOf(d), 13)
      footer(ctx, d, 170, 690)
    })
  }

  // ── ribbon3d : PROFIL ALTI de gauche à droite en perspective (peu importe la
  // forme du tracé), parois verticales vers une ligne de sol, et le tracé GPS en
  // ombre au sol dessous. Échelle d'altitude HONNÊTE (plat = ruban plat).
  return renderOn(1240, (ctx) => {
    const pts = resampleRoute(d.latlng!, d.altitude, N)
    const alts = pts.map((p) => p.alt)
    const aMin = Math.min(...alts)
    const range = Math.max(...alts) - aMin
    const altH = honestAltHeight(range, 280)

    const left = 150, right = W - 150
    // ligne de sol légèrement incurvée (effet perspective)
    const baseY = (i: number) => 600 + Math.sin((i / (N - 1)) * Math.PI) * 26

    // ombre au sol : la forme réelle du tracé, aplatie sous le ruban
    const ground = fitBox(pts, right - left - 120, 230)
      .map((g) => ({ x: left + 60 + g.x, y: 480 + g.y * 0.7 }))
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000'; ctx.globalAlpha = 0.3; ctx.lineWidth = 12
    ctx.beginPath()
    ground.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.stroke()
    ctx.globalAlpha = 1

    // ruban : profil gauche→droite au-dessus du sol
    const xy = alts.map((a, i) => ({
      x: left + ((right - left) * i) / (N - 1),
      y: baseY(i) - 90 - ((a - aMin) / Math.max(1, range)) * altH,
    }))
    // parois verticales (ruban → sol)
    ctx.strokeStyle = EMBER; ctx.globalAlpha = 0.3; ctx.lineWidth = 7
    for (let i = 8; i < N - 6; i += 12) {
      ctx.beginPath()
      ctx.moveTo(xy[i].x, baseY(i))
      ctx.lineTo(xy[i].x, xy[i].y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    strokeHeatPath(ctx, xy, pts, distPerStepOf(d), 15)
    dot(ctx, xy[0].x, xy[0].y, 18, EMBER)
    dot(ctx, xy[xy.length - 1].x, xy[xy.length - 1].y, 18, '#4ad07a')
    footer(ctx, d, 170, 920)
  })
}

/** Canvas → PNG (Blob). */
export function stickerBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
}
