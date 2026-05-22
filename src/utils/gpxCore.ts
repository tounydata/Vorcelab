export interface KmSeg {
  km?: number
  endKm?: number
  startKm: number
  dist: number
  dplus: number
  dminus: number
  grade: number
  altEnd: number | null
}

export interface Section {
  type: 'up' | 'down' | 'flat'
  startKm: number
  endKm: number
  dplus: number
  dminus: number
  dist: number
  grade: number
}

export interface GpxSample {
  d: number
  alt: number | null
}

export function hav(p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number {
  const R = 6371000, r = Math.PI / 180
  const dLat = (p2.lat - p1.lat) * r
  const dLon = (p2.lon - p1.lon) * r
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * r) * Math.cos(p2.lat * r) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export function minettiGradePenalty(grade: number): number {
  if (grade >= 0) {
    const i = Math.min(grade, 0.50)
    const c = 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5
    return c / 2.5 - 1
  } else {
    const g = Math.min(Math.abs(grade), 0.60)
    if (g <= 0.10) return -g * 2.5
    if (g <= 0.20) return -0.25 + (g - 0.10) * 2.0
    if (g <= 0.30) return -0.05 + (g - 0.20) * 1.5
    return 0.10 + (g - 0.30) * 3.0
  }
}

export function buildDetailedSections(kmSecs: KmSeg[]): Section[] {
  if (!kmSecs.length) return []
  const endOf = (s: KmSeg) => s.km ?? s.endKm ?? s.startKm
  const cumAlt = [0]
  for (const s of kmSecs) cumAlt.push(cumAlt[cumAlt.length - 1] + s.dplus - (s.dminus || 0))
  const MIN_CHANGE = 12
  const extrema: { idx: number; alt: number }[] = [{ idx: 0, alt: cumAlt[0] }]
  for (let i = 1; i < cumAlt.length - 1; i++) {
    const prev = cumAlt[i - 1], cur = cumAlt[i], next = cumAlt[i + 1]
    const isPeak = cur >= prev && cur >= next
    const isVall = cur <= prev && cur <= next
    if (isPeak || isVall) {
      const last = extrema[extrema.length - 1]
      if (Math.abs(cur - last.alt) >= MIN_CHANGE) {
        extrema.push({ idx: i, alt: cur })
      } else {
        const isGoingUp = cur > last.alt
        if (isGoingUp && cur > last.alt) extrema[extrema.length - 1] = { idx: i, alt: cur }
        else if (!isGoingUp && cur < last.alt) extrema[extrema.length - 1] = { idx: i, alt: cur }
      }
    }
  }
  extrema.push({ idx: cumAlt.length - 1, alt: cumAlt[cumAlt.length - 1] })
  const filtered: { idx: number; alt: number }[] = [extrema[0]]
  for (let i = 1; i < extrema.length; i++) {
    const last = filtered[filtered.length - 1]
    const diff = extrema[i].alt - last.alt
    if (Math.abs(diff) >= MIN_CHANGE) {
      filtered.push(extrema[i])
    } else {
      const prev2 = filtered.length >= 2 ? filtered[filtered.length - 2] : null
      if (!prev2) { filtered[filtered.length - 1] = extrema[i] }
      else if (extrema[i].alt > last.alt) filtered[filtered.length - 1] = { idx: extrema[i].idx, alt: Math.max(last.alt, extrema[i].alt) }
      else filtered[filtered.length - 1] = { idx: extrema[i].idx, alt: Math.min(last.alt, extrema[i].alt) }
    }
  }
  const out: Section[] = []
  for (let i = 0; i < filtered.length - 1; i++) {
    const from = filtered[i], to = filtered[i + 1]
    const fromIdx = Math.max(0, Math.min(from.idx, kmSecs.length - 1))
    const toIdx = Math.max(0, Math.min(to.idx, kmSecs.length))
    const segs = kmSecs.slice(fromIdx, toIdx)
    if (!segs.length) continue
    const dp = segs.reduce((a, s) => a + s.dplus, 0)
    const dm = segs.reduce((a, s) => a + (s.dminus || 0), 0)
    const dist = segs.reduce((a, s) => a + s.dist, 0)
    const netAlt = to.alt - from.alt
    const avgGrade = dist > 0 ? netAlt / dist * 100 : 0
    const type: 'up' | 'down' | 'flat' = netAlt >= MIN_CHANGE ? 'up' : netAlt <= -MIN_CHANGE ? 'down' : 'flat'
    const startKm = segs[0].startKm
    const endKm = endOf(segs[segs.length - 1])
    out.push({ type, startKm, endKm, dplus: Math.round(dp), dminus: Math.round(dm), dist, grade: +avgGrade.toFixed(1) })
  }
  const merged: Section[] = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && last.type === 'flat' && s.type === 'flat') {
      last.endKm = s.endKm; last.dplus += s.dplus; last.dminus += s.dminus
      last.dist += s.dist; last.grade = last.dist > 0 ? (last.dplus - last.dminus) / last.dist * 100 : 0
    } else merged.push({ ...s })
  }
  if (!merged.length) {
    const dp = kmSecs.reduce((a, s) => a + s.dplus, 0)
    const dm = kmSecs.reduce((a, s) => a + (s.dminus || 0), 0)
    const dist = kmSecs.reduce((a, s) => a + s.dist, 0)
    return [{ type: 'flat', startKm: kmSecs[0].startKm, endKm: endOf(kmSecs[kmSecs.length - 1]), dplus: Math.round(dp), dminus: Math.round(dm), dist, grade: 0 }]
  }
  return merged
}
