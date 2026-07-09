// Port exact de session-quality.js — Étape 4
// Classification de séance et dérive cardiaque. Algorithmique, sans IA.

import { FC_MAX_FALLBACK } from './fcMax'

// FCmax = individuelle ; ce repère n'est qu'un dernier recours (cf. fcMax.ts).
const FC_MAX_DEFAULT = FC_MAX_FALLBACK
const TRAIL_TYPES = ['TrailRun', 'Trail Run']

export interface ActivityForClassify {
  moving_time?: number | null
  distance?: number | null
  total_elevation_gain?: number | null
  average_heartrate?: number | null
  sport_type?: string | null
  type?: string | null
}

export interface StreamsForDrift {
  heartrate?: { data: number[] }
}

export function classifySession(activity: ActivityForClassify, fcMax?: number | null, structure?: WorkoutStructure | null): string {
  const maxHR = fcMax || FC_MAX_DEFAULT
  const durMin = (activity.moving_time || 0) / 60
  const distKm = (activity.distance || 0) / 1000
  const dpKm   = distKm > 0 ? (activity.total_elevation_gain || 0) / distKm : 0
  const isTrail = TRAIL_TYPES.includes(activity.sport_type || activity.type || '')
  const hrPct   = activity.average_heartrate && maxHR > 0
    ? activity.average_heartrate / maxHR : null

  // Structure d'intervalles détectée dans le flux FC → prime sur la FC moyenne
  // (un fractionné a une FC moyenne modérée mais N'EST PAS de l'endurance).
  if (structure?.isInterval) return structure.hill ? 'fractionné en côte' : 'fractionné'

  if (durMin < 15) return 'sortie courte'

  if (hrPct !== null) {
    if (hrPct >= 0.90) return 'effort maximal'
    if (hrPct >= 0.82) return 'fractionné probable'
    if (hrPct >= 0.75) return 'tempo / seuil'
    if (hrPct >= 0.68) return durMin >= 90 ? 'sortie longue' : 'endurance active'
    if (hrPct >= 0.60) return durMin >= 90 ? 'sortie longue' : 'endurance facile'
    return durMin >= 60 ? 'sortie longue (récup)' : 'récupération'
  }

  // Fallback sans FC
  if (isTrail && dpKm >= 40) return 'trail vallonné'
  if (isTrail)               return 'trail'
  if (durMin >= 120)         return 'sortie longue'
  const pace = distKm > 0 ? (activity.moving_time ?? 0) / distKm : 0
  if (pace > 0 && pace < 270) return 'effort soutenu'
  if (durMin >= 60)          return 'endurance'
  return 'sortie'
}

// ─── Détection de structure (fractionné / intervalles) ────────────────────────
// La classification par FC MOYENNE est aveugle aux séances structurées : un
// fractionné en côte (FC qui monte à chaque rép, redescend à chaque récup) a une
// FC moyenne modérée → classé « endurance » à tort. On lit ici la FORME du signal
// FC dans le temps pour compter les répétitions effort/récup. 100 % pur, testable.

export interface WorkoutStructure {
  isInterval: boolean
  reps: number
  /** FC moyenne des bouts « effort » (% FCmax, 0..1). */
  workAvgHrPct: number | null
  /** FC moyenne des bouts « récup » (% FCmax, 0..1). */
  restAvgHrPct: number | null
  avgWorkS: number
  avgRestS: number
  /** true = les efforts coïncident avec des montées (fractionné en côte). */
  hill: boolean
  /** Libellé court, ex. « fractionné en côte · 6 × ~1min (récup ~1min10) ». */
  label: string
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[idx]
}

function smooth(data: number[], win: number): number[] {
  if (win <= 1) return data.slice()
  const out = new Array(data.length)
  let sum = 0
  const q: number[] = []
  for (let i = 0; i < data.length; i++) {
    q.push(data[i]); sum += data[i]
    if (q.length > win) sum -= q.shift() as number
    out[i] = sum / q.length
  }
  return out
}

function fmtDur(s: number): string {
  const t = Math.round(s)
  if (t < 60) return `${t}s`
  const m = Math.floor(t / 60), sec = t % 60
  return sec >= 20 && sec <= 40 ? `${m}min30` : sec < 20 ? `${m}min` : `${m + 1}min`
}

/**
 * Détecte une structure d'intervalles depuis le flux FC (et l'altitude si dispo).
 * Renvoie null si données insuffisantes ; isInterval=false si effort continu.
 * @param hr       FC échantillonnée (bpm)
 * @param fcMax    FC max individuelle
 * @param opts.timeS  temps (s) par échantillon — sinon on suppose ~1 Hz
 * @param opts.altitude altitude (m) par échantillon — pour distinguer la côte
 */
export function detectWorkoutStructure(
  hr: number[] | undefined | null,
  fcMax: number,
  opts?: { timeS?: number[]; altitude?: number[] },
): WorkoutStructure | null {
  if (!hr || hr.length < 60 || !(fcMax > 0)) return null
  const time = opts?.timeS && opts.timeS.length === hr.length ? opts.timeS : null
  const alt = opts?.altitude && opts.altitude.length === hr.length ? opts.altitude : null
  const dt = (i: number): number => (time && i > 0 ? Math.max(0, time[i] - time[i - 1]) : 1)

  const sm = smooth(hr, 5)
  const sorted = [...sm].sort((a, b) => a - b)
  const lo = percentile(sorted, 20)
  const hi = percentile(sorted, 90)
  // Amplitude d'oscillation trop faible → effort continu, pas d'intervalles.
  if (hi - lo < fcMax * 0.07) return { isInterval: false, reps: 0, workAvgHrPct: null, restAvgHrPct: null, avgWorkS: 0, avgRestS: 0, hill: false, label: '' }
  const thr = lo + 0.6 * (hi - lo) // seuil effort adaptatif (propre à la séance)

  const MIN_WORK_S = 20, MIN_REST_S = 15
  // Segmentation avec durée minimale (on ignore les blips).
  type Seg = { work: boolean; startI: number; endI: number; durS: number }
  const raw: Seg[] = []
  let curWork = sm[0] >= thr, startI = 0, acc = 0
  for (let i = 1; i < sm.length; i++) {
    const w = sm[i] >= thr
    acc += dt(i)
    if (w !== curWork) { raw.push({ work: curWork, startI, endI: i - 1, durS: acc }); curWork = w; startI = i; acc = 0 }
  }
  raw.push({ work: curWork, startI, endI: sm.length - 1, durS: acc })
  // Fusionne un segment trop court dans le précédent (bruit).
  const segs: Seg[] = []
  for (const s of raw) {
    const min = s.work ? MIN_WORK_S : MIN_REST_S
    if (s.durS < min && segs.length) { const p = segs[segs.length - 1]; p.endI = s.endI; p.durS += s.durS }
    else segs.push({ ...s })
  }

  const workSegs = segs.filter((s) => s.work)
  const reps = workSegs.length
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
  const avgWorkS = mean(workSegs.map((s) => s.durS))
  const restSegs = segs.filter((s) => !s.work && s.startI > workSegs[0]?.startI && s.startI < workSegs[workSegs.length - 1]?.startI)
  const avgRestS = mean(restSegs.map((s) => s.durS))

  const segHr = (s: Seg) => mean(sm.slice(s.startI, s.endI + 1))
  const workAvgHrPct = reps ? mean(workSegs.map(segHr)) / fcMax : null
  const restAvgHrPct = restSegs.length ? mean(restSegs.map(segHr)) / fcMax : null

  // Côte : la majorité des efforts gagnent de l'altitude.
  let hill = false
  if (alt && reps) {
    const climbs = workSegs.filter((s) => alt[s.endI] - alt[s.startI] > 5).length
    hill = climbs >= Math.ceil(reps / 2)
  }

  // Intervalles = ≥ 3 bouts d'effort alternés, avec un vrai contraste effort/récup.
  const contrast = workAvgHrPct != null && restAvgHrPct != null && (workAvgHrPct - restAvgHrPct) >= 0.08
  const isInterval = reps >= 3 && contrast
  const label = isInterval
    ? `${hill ? 'fractionné en côte' : 'fractionné'} · ${reps} × ~${fmtDur(avgWorkS)}${avgRestS > 0 ? ` (récup ~${fmtDur(avgRestS)})` : ''}`
    : ''
  return { isInterval, reps, workAvgHrPct, restAvgHrPct, avgWorkS, avgRestS, hill, label }
}

export function computeCardiacDrift(streams: StreamsForDrift) {
  const hr = streams?.heartrate?.data
  if (!hr || hr.length < 40) return null
  const mid    = Math.floor(hr.length / 2)
  const first  = hr.slice(0, mid).reduce((s, v) => s + v, 0) / mid
  const second = hr.slice(mid).reduce((s, v) => s + v, 0) / (hr.length - mid)
  const driftPct = first > 0 ? +((second - first) / first * 100).toFixed(1) : 0
  return { first: Math.round(first), second: Math.round(second), driftPct }
}

export function buildSessionInsights(activity: ActivityForClassify, streams: StreamsForDrift, fcMax?: number | null) {
  const maxHR  = fcMax || FC_MAX_DEFAULT
  const type   = classifySession(activity, maxHR)
  const drift  = computeCardiacDrift(streams)
  const durMin = (activity.moving_time || 0) / 60
  const distKm = (activity.distance   || 0) / 1000
  const dpKm   = distKm > 0 ? (activity.total_elevation_gain || 0) / distKm : 0
  const hrPct  = activity.average_heartrate && maxHR > 0
    ? activity.average_heartrate / maxHR : null
  const hasHR  = !!activity.average_heartrate

  const insights: { key: string; value: string }[] = []

  if (durMin >= 180) insights.push({ key: 'durée', value: `${Math.floor(Math.round(durMin) / 60)}h${String(Math.round(durMin) % 60).padStart(2, '0')}` })
  if (dpKm >= 25)   insights.push({ key: 'D+/km',  value: `${Math.round(dpKm)} m/km` })

  if (hrPct !== null) {
    const zone = hrPct >= 0.90 ? 'Z5' : hrPct >= 0.80 ? 'Z4' : hrPct >= 0.70 ? 'Z3' : hrPct >= 0.60 ? 'Z2' : 'Z1'
    insights.push({ key: 'zone moy', value: zone })
  }

  return { type, drift, insights, hasHR }
}

export function renderSessionQualityBlock(data: ReturnType<typeof buildSessionInsights>): string {
  const { type, drift, insights, hasHR } = data
  if (!hasHR && insights.length === 0) return ''

  const driftHtml = drift && Math.abs(drift.driftPct) >= 3
    ? `<div class="s-stat"><div class="s-sv" style="color:${
        drift.driftPct > 10 ? 'var(--vl-ember)' : drift.driftPct > 5 ? '#f59e0b' : 'var(--vl-growth)'
      }">${drift.driftPct > 0 ? '+' : ''}${drift.driftPct}%</div><div class="s-sl">Dérive FC</div></div>`
    : ''

  const insightHtml = insights.map(ins =>
    `<div class="s-stat"><div class="s-sv">${ins.value}</div><div class="s-sl">${ins.key}</div></div>`
  ).join('')

  const hasContent = driftHtml || insightHtml

  return `
    <div class="card" style="margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${hasContent ? '10px' : '0'}">
        <div class="clabel" style="margin:0">Qualité de séance</div>
        <span style="font-family:var(--vl-mono);font-size:9px;font-weight:700;letter-spacing:.1em;padding:3px 8px;border-radius:3px;background:var(--vl-surf-2);color:var(--vl-text-2)">${type.toUpperCase()}</span>
      </div>
      ${hasContent ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${driftHtml}${insightHtml}</div>` : ''}
    </div>
  `
}
