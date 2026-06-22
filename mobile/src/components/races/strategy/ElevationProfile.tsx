import { useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, Path, Rect } from 'react-native-svg'
import { HEAT_COLORS, HEAT_NAMES, altAtKm, type ProfilePoint, type HeatLevel } from '@/lib/raceStrategyView'
import { colors } from '@/lib/theme'

export interface ProfileSection { startKm: number; endKm: number; heat: HeatLevel }
export interface ProfileMarker {
  kind: 'start' | 'ravito' | 'finish' | 'wall'
  km: number; alt: number; t: string; label: string; sub?: string
}

interface Props {
  heightPx: number
  pts: ProfilePoint[]
  sections: ProfileSection[]
  markers: ProfileMarker[]
  totalKm: number
  passageHM: (km: number) => string
  markerMode?: 'full' | 'mini' | 'none'
  grid?: boolean
  interactive?: boolean
  onHover?: (km: number | null) => void
  cursorKm?: number | null
}

const VBW = 1000, VBH = 1000, Y_TOP = 90, Y_BASE = 1000

export default function ElevationProfile({
  heightPx, pts, sections, markers, totalKm, passageHM,
  markerMode = 'full', grid = true, interactive = false, onHover, cursorKm = null,
}: Props) {
  const [w, setW] = useState(0)
  if (pts.length < 2) {
    return <View style={{ height: heightPx, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text3, fontSize: 12 }}>Profil indisponible</Text></View>
  }
  let yMin = Infinity, yMax = -Infinity
  for (const p of pts) { yMin = Math.min(yMin, p.alt); yMax = Math.max(yMax, p.alt) }
  yMin = Math.floor((yMin - 18) / 50) * 50
  yMax = Math.ceil((yMax + 28) / 50) * 50
  const xv = (km: number) => (km / totalKm) * VBW
  const yv = (alt: number) => Y_TOP + ((yMax - alt) / Math.max(1, yMax - yMin)) * (Y_BASE - Y_TOP)
  const xPct = (km: number) => (km / totalKm) * 100
  const yPct = (alt: number) => (yv(alt) / VBH) * 100

  const secAlt = (km: number) => altAtKm(km, pts)
  function sectionAreaPath(sec: ProfileSection): string {
    const inner = pts.filter((p) => p.km >= sec.startKm - 1e-6 && p.km <= sec.endKm + 1e-6)
    const all = [{ km: sec.startKm, alt: secAlt(sec.startKm) }, ...inner, { km: sec.endKm, alt: secAlt(sec.endKm) }]
    let d = `M ${xv(all[0].km).toFixed(1)} ${Y_BASE}`
    for (const p of all) d += ` L ${xv(p.km).toFixed(1)} ${yv(p.alt).toFixed(1)}`
    d += ` L ${xv(all[all.length - 1].km).toFixed(1)} ${Y_BASE} Z`
    return d
  }
  function sectionLinePath(sec: ProfileSection): string {
    const inner = pts.filter((p) => p.km >= sec.startKm - 1e-6 && p.km <= sec.endKm + 1e-6)
    const all = [{ km: sec.startKm, alt: secAlt(sec.startKm) }, ...inner, { km: sec.endKm, alt: secAlt(sec.endKm) }]
    return all.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xv(p.km).toFixed(1)} ${yv(p.alt).toFixed(1)}`).join(' ')
  }

  const altLines: number[] = []
  for (let a = yMin; a <= yMax; a += 100) altLines.push(a)
  const distTicks = [0, ...[5, 10, 15, 20].filter((t) => t < totalKm - 1), totalKm]
  const wall = markers.find((m) => m.kind === 'wall')

  function touch(locX: number) {
    if (!w) return
    const x = Math.max(0, Math.min(1, locX / w))
    onHover?.(x * totalKm)
  }

  return (
    <View
      style={{ width: '100%', height: heightPx, position: 'relative' }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !!interactive}
      onMoveShouldSetResponder={() => !!interactive}
      onResponderGrant={(e) => touch(e.nativeEvent.locationX)}
      onResponderMove={(e) => touch(e.nativeEvent.locationX)}
      onResponderRelease={() => onHover?.(null)}
    >
      <Svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
        <Defs>
          <LinearGradient id="vlfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="100%" stopColor={colors.bg} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
        {sections.map((sec, i) => <Path key={i} d={sectionAreaPath(sec)} fill={HEAT_COLORS[sec.heat]} fillOpacity={0.92} />)}
        <Rect x={0} y={0} width={VBW} height={VBH} fill="url(#vlfade)" />
        {sections.map((sec, i) => (
          <Path key={'c' + i} d={sectionLinePath(sec)} fill="none" stroke={HEAT_COLORS[sec.heat]} strokeWidth={2.5} strokeLinejoin="round" />
        ))}
      </Svg>

      {/* overlay net */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        {grid && altLines.map((a) => (
          <View key={a} style={{ position: 'absolute', left: 0, right: 0, top: `${yPct(a)}%`, borderTopWidth: 1, borderTopColor: colors.line }}>
            <Text style={{ position: 'absolute', left: 0, top: -7, fontSize: 9, color: colors.text3, letterSpacing: 0.9 }}>{a}m</Text>
          </View>
        ))}
        {grid && distTicks.map((t, i) => (
          <View key={'d' + i} style={{ position: 'absolute', bottom: 4, left: `${xPct(t)}%` }}>
            <Text style={{ fontSize: 9, color: colors.text3, letterSpacing: 0.9, transform: [{ translateX: -10 }] }}>{(Number.isInteger(t) ? t : t.toFixed(1)) + (i === distTicks.length - 1 ? ' KM' : '')}</Text>
          </View>
        ))}

        {/* callout pente raide */}
        {wall ? (
          <View style={{ position: 'absolute', left: `${xPct(wall.km)}%`, top: `${yPct(wall.alt)}%`, alignItems: 'center', transform: [{ translateX: -50 }, { translateY: -40 }] }}>
            <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 7, backgroundColor: '#d1583a' }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }} numberOfLines={1}>▲ PENTE RAIDE{wall.sub ? ' · ' + wall.sub.split('·')[0].trim() : ''}</Text>
            </View>
            <View style={{ width: 1.5, height: 14, backgroundColor: '#d1583a' }} />
          </View>
        ) : null}

        {/* fanions */}
        {markerMode === 'full' && markers.filter((m) => m.kind !== 'wall').map((m, i) => (
          <MarkerPill key={i} m={m} xPct={xPct} yPct={yPct} heightPx={heightPx} />
        ))}
        {markerMode === 'mini' && markers.filter((m) => m.kind !== 'wall').map((m, i) => {
          const c = m.kind === 'finish' ? colors.growth2 : m.kind === 'start' ? colors.ember : colors.text2
          return <View key={i} style={{ position: 'absolute', left: `${xPct(m.km)}%`, top: `${yPct(m.alt)}%`, width: 7, height: 7, borderRadius: 999, backgroundColor: c, borderWidth: 2, borderColor: colors.bg, transform: [{ translateX: -3.5 }, { translateY: -3.5 }] }} />
        })}
      </View>

      {/* curseur synchronisé */}
      {cursorKm != null ? (() => {
        const alt = secAlt(cursorKm)
        const left = xPct(cursorKm), top = yPct(alt)
        const sec = sections.find((s) => cursorKm >= s.startKm && cursorKm <= s.endKm) ?? sections[sections.length - 1]
        const hc = HEAT_COLORS[sec?.heat ?? 1]
        const flip = left > 68
        return (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
            <View style={{ position: 'absolute', left: `${left}%`, top: 0, bottom: 18, width: 1, backgroundColor: colors.text2, opacity: 0.5 }} />
            <View style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: 12, height: 12, borderRadius: 999, backgroundColor: hc, borderWidth: 2, borderColor: colors.bg, transform: [{ translateX: -6 }, { translateY: -6 }] }} />
            <View style={{ position: 'absolute', left: `${left}%`, top: 6, transform: [{ translateX: flip ? -150 : 10 }], backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line2, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11, minWidth: 140 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ fontSize: 22, color: colors.growth2, fontWeight: '700' }}>{passageHM(cursorKm)}</Text>
                <Text style={{ fontSize: 10, color: colors.text3 }}>PASSAGE</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                <Text style={{ fontSize: 10.5, color: colors.text2 }}>KM {cursorKm.toFixed(1)}</Text>
                <Text style={{ fontSize: 10.5, color: colors.text2 }}>{Math.round(alt)} M</Text>
                <Text style={{ fontSize: 10.5, color: hc, fontWeight: '700' }}>{HEAT_NAMES[sec?.heat ?? 1].toUpperCase()}</Text>
              </View>
            </View>
          </View>
        )
      })() : null}
    </View>
  )
}

function MarkerPill({ m, xPct, yPct, heightPx }: { m: ProfileMarker; xPct: (km: number) => number; yPct: (alt: number) => number; heightPx: number }) {
  const isStart = m.kind === 'start', isFinish = m.kind === 'finish'
  const accent = isFinish ? colors.growth2 : isStart ? colors.ember : colors.text
  const dotBg = isFinish ? colors.growth2 : isStart ? colors.ember : colors.surf
  const dotTopPx = (yPct(m.alt) / 100) * heightPx
  const connectorH = Math.max(0, dotTopPx - 32)
  return (
    <View style={{ position: 'absolute', left: `${xPct(m.km)}%`, top: 0, bottom: 0, alignItems: 'center', transform: [{ translateX: -30 }] }} pointerEvents="none">
      <View style={{ marginTop: 6, paddingVertical: 5, paddingLeft: 7, paddingRight: 9, borderRadius: 999, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: dotBg }} />
        <Text style={{ fontSize: 9.5, color: colors.text2, letterSpacing: 1.2, fontWeight: '600' }}>{isStart ? 'DÉP' : isFinish ? 'ARR' : 'R' + m.km}</Text>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: accent }}>{m.t}</Text>
      </View>
      <View style={{ position: 'absolute', top: 32, width: 1.5, height: connectorH, backgroundColor: colors.line2 }} />
      <View style={{ position: 'absolute', top: dotTopPx, width: 9, height: 9, borderRadius: 999, backgroundColor: dotBg, borderWidth: 2, borderColor: colors.bg, transform: [{ translateY: -4.5 }] }} />
    </View>
  )
}
