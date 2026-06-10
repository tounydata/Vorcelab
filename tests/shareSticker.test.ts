import { describe, it, expect } from 'vitest'
import { fmtStickerTime, availableVariants } from '../src/lib/shareSticker'

describe('fmtStickerTime', () => {
  it('heure pleine : H MAJUSCULE en accent', () => {
    expect(fmtStickerTime(2 * 3600 + 31 * 60)).toEqual(['2', 'H', '31'])
    expect(fmtStickerTime(3600)).toEqual(['1', 'H', '00'])
  })
  it("sous l'heure : minutes'secondes", () => {
    expect(fmtStickerTime(42 * 60 + 17)).toEqual(['42', "'", '17'])
  })
})

describe('availableVariants', () => {
  const base = { movingTimeS: 3600, distanceM: 10000, dplusM: 200 }
  it('stats seules sans streams', () => {
    expect(availableVariants(base)).toEqual(['stats'])
  })
  it('tout avec latlng + altitude + distance', () => {
    const latlng = Array.from({ length: 50 }, (_, i) => [45 + i / 1000, 6] as [number, number])
    const altitude = Array.from({ length: 50 }, (_, i) => 400 + i)
    const distance = Array.from({ length: 50 }, (_, i) => i * 200)
    expect(availableVariants({ ...base, latlng, altitude, distance }))
      .toEqual(['stats', 'trace', 'profile', 'ribbon3d'])
  })
})
