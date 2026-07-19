import { describe, it, expect } from 'vitest'
import { smoothAltitudeByDistance } from '../src/lib/elevationSmoothing'
import { smoothAltitudeByDistance as mobileSmooth } from '../mobile/src/lib/elevationSmoothing'

// Distance cumulée régulière (pas de recalcul : fournie par l'appelant).
function cumDist(n: number, stepM = 3): number[] {
  return Array.from({ length: n }, (_, i) => i * stepM)
}
function gain(alt: number[]): number {
  let g = 0
  for (let i = 1; i < alt.length; i++) if (alt[i] > alt[i - 1]) g += alt[i] - alt[i - 1]
  return g
}

describe('smoothAltitudeByDistance — primitive commune (§9)', () => {
  it('activité PLATE avec altitude bruitée : le D+ résiduel est fortement réduit', () => {
    const n = 400
    const d = cumDist(n)
    const noisy = Array.from({ length: n }, (_, i) => 100 + (i % 2 === 0 ? 1.5 : -1.5)) // ±1.5 m dents de scie
    const smoothed = smoothAltitudeByDistance(noisy, d)
    expect(gain(smoothed)).toBeLessThan(gain(noisy) * 0.2)
  })

  it('longue DESCENTE : la pente réelle est préservée (monotone décroissante)', () => {
    const n = 300
    const d = cumDist(n)
    const desc = Array.from({ length: n }, (_, i) => 1000 - i * 0.5)
    const smoothed = smoothAltitudeByDistance(desc, d)
    expect(smoothed[0]).toBeGreaterThan(smoothed[n - 1])
    expect(gain(smoothed)).toBeLessThan(1) // aucune fausse montée
    // Effet de bord ~2 m de la moyenne glissante en fin de descente (tolérance).
    expect(Math.abs(smoothed[n - 1] - desc[n - 1])).toBeLessThan(3)
  })

  it('montée RÉGULIÈRE : le dénivelé total est conservé (±quelques m de bord)', () => {
    const n = 300
    const d = cumDist(n)
    const climb = Array.from({ length: n }, (_, i) => 500 + i * 0.4) // +0.4 m/pas
    const smoothed = smoothAltitudeByDistance(climb, d)
    const expected = climb[n - 1] - climb[0]
    expect(gain(smoothed)).toBeGreaterThan(expected * 0.9)
    expect(gain(smoothed)).toBeLessThanOrEqual(expected + 1)
  })

  it('parcours en ESCALIER : capture les marches sans exploser le D+', () => {
    const n = 400
    const d = cumDist(n)
    const stair = Array.from({ length: n }, (_, i) => 100 + Math.floor(i / 40) * 5) // +5 m tous les 40 pts
    const smoothed = smoothAltitudeByDistance(stair, d)
    const expected = stair[n - 1] - stair[0]
    expect(gain(smoothed)).toBeGreaterThan(expected * 0.8)
    expect(gain(smoothed)).toBeLessThan(expected * 1.2)
  })

  it('altitude PARTIELLEMENT absente : interpolée par distance (aucun NaN)', () => {
    const n = 200
    const d = cumDist(n)
    const alt: (number | null)[] = Array.from({ length: n }, (_, i) => 100 + i * 0.3)
    for (let i = 50; i < 90; i++) alt[i] = null // trou d'altitude
    const smoothed = smoothAltitudeByDistance(alt, d)
    expect(smoothed.every((x) => Number.isFinite(x))).toBe(true)
    // La valeur interpolée dans le trou reste dans l'enveloppe des voisins.
    expect(smoothed[70]).toBeGreaterThan(alt[49] as number - 2)
    expect(smoothed[70]).toBeLessThan(alt[90] as number + 2)
  })

  it('SPIKE barométrique isolé : écrasé par le filtre médian', () => {
    const n = 200
    const d = cumDist(n)
    const alt = Array.from({ length: n }, () => 100)
    alt[100] = 100 + 60 // spike +60 m sur un point
    const smoothed = smoothAltitudeByDistance(alt, d)
    expect(smoothed[100]).toBeLessThan(105) // spike absorbé
    expect(gain(smoothed)).toBeLessThan(5)
  })

  it('TROUS temporels (distance qui saute) : le lissage par distance reste borné', () => {
    const n = 100
    // Grand saut de distance au milieu (pause GPS) — la fenêtre distance ne fusionne pas.
    const d: number[] = []
    let x = 0
    for (let i = 0; i < n; i++) { d.push(x); x += i === 50 ? 5000 : 3 }
    const alt = Array.from({ length: n }, (_, i) => 100 + (i < 50 ? i : 50) * 0.4)
    const smoothed = smoothAltitudeByDistance(alt, d)
    expect(smoothed.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('aucune altitude finie → renvoie des zéros', () => {
    const d = cumDist(10)
    const alt = Array.from({ length: 10 }, () => NaN)
    expect(smoothAltitudeByDistance(alt, d)).toEqual(new Array(10).fill(0))
  })

  it('déterministe + parité web/mobile', () => {
    const n = 150
    const d = cumDist(n)
    const alt = Array.from({ length: n }, (_, i) => 200 + Math.sin(i / 5) * 10)
    const a = smoothAltitudeByDistance(alt, d)
    expect(smoothAltitudeByDistance(alt, d)).toEqual(a)
    expect(mobileSmooth(alt, d)).toEqual(a)
  })
})
