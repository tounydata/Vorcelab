import { useMemo, useState } from 'react'
import { CaretDownIcon, CaretUpIcon } from '@/components/coach/CoachIcons'
import { Pressable, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { ProjectionResult } from '@/lib/computeRaceProjection'
import type { RaceConditions, WeatherImpact } from '@/lib/raceWeather'
import type { NutritionRow } from '@/lib/nutritionPlan'
import type { RavitoPoint } from '@/lib/crewPlan'
import ElevationProfile, { type ProfileMarker, type ProfileSection } from './ElevationProfile'
import { HEAT_COLORS, HEAT_NAMES, sectionHeat, profilePoints, elapsedSecAtKm, fmtHM, fmtRaceTimeS, altAtKm } from '@/lib/raceStrategyView'
import { surfaceInfo } from '@/lib/terrain'
import RouteMap3D from './RouteMap3D'
import { colors, radius } from '@/lib/theme'

const GROWTH2 = colors.growth2, OVER = colors.ember2

interface RaceMeta { name: string; date: string; type?: string | null; goal_time?: string | null; start_time?: string | null }
interface Props {
  projection: ProjectionResult
  race: RaceMeta
  athleteName: string
  nutritionRows: NutritionRow[]
  ravitos: RavitoPoint[]
  forecast: RaceConditions | null
  weather: WeatherImpact | null
}

// Composants hoistés (identité stable — react-hooks/static-components).
function Row({ color, label, detail }: { color: string; label: string; detail: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: color, alignSelf: 'center' }} />
      <Text style={{ fontWeight: '600', color: colors.text, fontSize: 12.5 }}>{label}</Text>
      <Text style={{ color: colors.text3, fontSize: 12.5, flex: 1 }}>{detail}</Text>
    </View>
  )
}
function Legend({ c, label }: { c: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c }} />
      <Text style={{ fontSize: 10, color: colors.text2 }}>{label}</Text>
    </View>
  )
}

function Eyebrow({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[{ fontSize: 11, letterSpacing: 2, color: colors.text3, fontWeight: '500' }, style]}>{children}</Text>
}
function Ico({ name, c = colors.text2, s = 14 }: { name: string; c?: string; s?: number }) {
  const sp = { fill: 'none' as const, stroke: c, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {name === 'temp' && <><Path d="M12 3v11" {...sp} /><Circle cx={12} cy={17} r={3.4} {...sp} /></>}
      {name === 'wind' && <><Path d="M3 8h11a3 3 0 1 0-3-3" {...sp} /><Path d="M3 13h15a3 3 0 1 1-3 3" {...sp} /></>}
      {name === 'moon' && <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" {...sp} />}
      {name === 'up' && <Path d="M4 18 L12 6 L20 18" {...sp} />}
      {name === 'down' && <Path d="M4 6 L12 18 L20 6" {...sp} />}
      {name === 'drop' && <Path d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z" {...sp} />}
      {name === 'alert' && <><Path d="M12 4 L21 19 H3 Z" {...sp} /><Path d="M12 10v4" {...sp} /><Path d="M12 17h.01" {...sp} /></>}
      {name === 'check' && <Path d="M4 12.5 L10 18 L20 5" {...sp} />}
    </Svg>
  )
}
function Chip({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf }}>{children}</View>
}
function StatTile({ value, unit, label, accent = colors.text }: { value: React.ReactNode; unit?: string; label: string; accent?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 14, gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ fontSize: 30, color: accent, fontWeight: '700' }}>{value}</Text>
        {unit ? <Text style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>{unit}</Text> : null}
      </View>
    </View>
  )
}
function Confidence({ level }: { level: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={{ width: 7, height: 16, borderRadius: 3, backgroundColor: i < level ? GROWTH2 : colors.surf3 }} />
      ))}
    </View>
  )
}
const cardStyle = { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg } as const

export default function StrategyView({ projection: p, race, athleteName, nutritionRows, ravitos, forecast, weather }: Props) {
  const [hoverKm, setHoverKm] = useState<number | null>(null)
  const totalKm = p.totalDistM / 1000
  const pts = useMemo(() => profilePoints(p), [p])
  const heatSections: ProfileSection[] = useMemo(() => {
    const segs = p.microSegments?.length
      ? p.microSegments.map((m) => ({ startKm: m.startKm, endKm: m.endKm, heat: (m.type === 'down' && m.turnDegPerKm >= 250 ? Math.max(sectionHeat(m), 3) : sectionHeat(m)) as ProfileSection['heat'] }))
      : p.sections.map((s) => ({ startKm: s.startKm, endKm: s.endKm, heat: sectionHeat(s) as ProfileSection['heat'] }))
    const merged: ProfileSection[] = []
    for (const seg of segs) { const last = merged[merged.length - 1]; if (last && last.heat === seg.heat) last.endKm = seg.endKm; else merged.push({ ...seg }) }
    return merged
  }, [p])
  const passageHM = (km: number) => fmtHM(elapsedSecAtKm(km, p) / 60)
  const ups = p.sections.filter((s) => s.type === 'up')
  const downs = p.sections.filter((s) => s.type === 'down')
  const wallSec = ups.length ? ups.reduce((a, b) => (b.grade > a.grade ? b : a)) : null
  const recovSec = downs.length ? downs.reduce((a, b) => (b.dminus > a.dminus ? b : a)) : null
  const markers: ProfileMarker[] = useMemo(() => {
    const m: ProfileMarker[] = [{ kind: 'start', km: 0, alt: altAtKm(0, pts), t: '0h00', label: 'Départ' }]
    ravitos.filter((r) => r.km > 0.5 && r.km < totalKm - 0.5).forEach((r) => m.push({ kind: 'ravito', km: r.km, alt: altAtKm(r.km, pts), t: passageHM(r.km), label: r.label }))
    if (wallSec) { const km = (wallSec.startKm + wallSec.endKm) / 2; m.push({ kind: 'wall', km, alt: altAtKm(km, pts), t: passageHM(km), label: 'Pente raide', sub: `${Math.round(wallSec.grade)}% · km ${wallSec.startKm.toFixed(1)}` }) }
    m.push({ kind: 'finish', km: totalKm, alt: altAtKm(totalKm, pts), t: fmtHM(p.estTimeS / 60), label: 'Arrivée' })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, ravitos, totalKm, wallSec, p])

  const hasRoute = p.points && p.points.length >= 2
  const confLevel = p.confidence === 'good' ? 5 : p.confidence === 'medium' ? 3 : 2
  const dplus = Math.round(p.dplus), dminus = Math.round(p.dminus)
  const mPerKm = Math.round(dplus / Math.max(1, totalKm))
  const profileLabel = mPerKm > 40 ? 'Montagneux' : mPerKm > 20 ? 'Vallonné' : 'Roulant'

  return (
    <View style={{ gap: 18 }}>
      {/* HERO */}
      <View style={[cardStyle, { overflow: 'hidden' }]}>
        <View style={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: 6 }}>
          <Eyebrow>PLAN DE COURSE · {athleteName.toUpperCase()}</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 64, color: GROWTH2, fontWeight: '700' }}>{fmtRaceTimeS(p.estTimeS)}</Text>
            <View>
              <Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 1.8 }}>TEMPS CIBLE</Text>
              <View style={{ marginTop: 9 }}><Confidence level={confLevel} /></View>
              <Text style={{ fontSize: 9.5, color: colors.text3, marginTop: 7 }}>CONFIANCE {p.confidence === 'good' ? 'BONNE' : p.confidence === 'medium' ? 'MOYENNE' : 'À CONFIRMER'}</Text>
            </View>
          </View>
          <View style={{ marginTop: 14 }}><ScenarioBand p={p} weather={weather} forecast={forecast} /></View>
        </View>

        <WhyThisTime p={p} weather={weather} forecast={forecast} />

        <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12 }}>
          <ElevationProfile heightPx={300} pts={pts} sections={heatSections} markers={markers} totalKm={totalKm} passageHM={passageHM} interactive onHover={setHoverKm} cursorKm={hoverKm} />
        </View>

        {hasRoute ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
            <RouteMap3D points={p.points} markers={markers} heatSegments={heatSections} cursorKm={hoverKm} totalKm={totalKm} heightPx={440} />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 10, color: colors.text3, letterSpacing: 1.6 }}>EFFORT</Text>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 6, borderRadius: 2, backgroundColor: HEAT_COLORS[i] }} />
              <Text style={{ fontSize: 10, color: colors.text2 }}>{HEAT_NAMES[i].toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* STATS */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatTile value={totalKm.toFixed(1)} unit="KM" label="DISTANCE" />
        <StatTile value={'+' + dplus} label="DÉNIVELÉ +" accent={colors.growth} />
        <StatTile value={'−' + dminus} label="DÉNIVELÉ −" accent={colors.text2} />
        <StatTile value={Math.round(p.altMax)} unit="M" label="ALT. MAX" />
        <StatTile value={mPerKm} unit="M/KM" label={'RAIDEUR · ' + profileLabel.toUpperCase()} accent={colors.ember} />
      </View>

      {/* KEY CARDS */}
      <View style={{ gap: 16 }}>
        {wallSec ? <KeyCard variant="risk" sec={wallSec} passageHM={passageHM} /> : null}
        {recovSec ? <KeyCard variant={recovSec.technical ? 'technical' : 'recovery'} sec={recovSec} passageHM={passageHM} /> : null}
      </View>

      {forecast?.available ? <ConditionsBlock p={p} race={race} forecast={forecast} weather={weather} /> : null}

      <KeySections p={p} ravitos={ravitos} />

      <Accordion label="PLAN DE COURSE — TOUTES LES SECTIONS" meta={`${p.sections.length} SECTIONS`}>
        <AllSectionsTable p={p} passageHM={passageHM} />
      </Accordion>
      <Accordion label="PLAN NUTRITION" meta={`${nutritionRows.length} PRISES`}>
        <NutritionTable rows={nutritionRows} />
      </Accordion>
    </View>
  )
}

function WhyThisTime({ p, weather, forecast }: { p: ProjectionResult; weather: WeatherImpact | null; forecast: RaceConditions | null }) {
  const rows = p.personalAdjustments ?? []
  const hasWeather = !!weather && weather.totalPct !== 0
  const weatherFirm = !!forecast?.available && forecast.daysToRace <= 3
  if (!rows.length && !hasWeather) return null
  return (
    <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
      <Eyebrow style={{ marginBottom: 8 }}>POURQUOI CE TEMPS</Eyebrow>
      <View style={{ gap: 6 }}>
        {rows.map((a, i) => <Row key={i} color={a.color} label={a.label} detail={a.detail} />)}
        {hasWeather ? (
          <Row color={weatherFirm ? colors.ember : colors.text3} label={weatherFirm ? 'Météo (jour J)' : 'Météo (indicative)'}
            detail={`+${weather!.totalPct}% — ${weather!.items.map((it) => it.label.toLowerCase()).join(', ') || 'conditions'}${weatherFirm ? ' · appliqué au temps « prudent »' : ` · prévision à J−${forecast!.daysToRace}, se précise vers J-3`}`} />
        ) : null}
      </View>
    </View>
  )
}

function ScenarioBand({ p, weather, forecast }: { p: ProjectionResult; weather: WeatherImpact | null; forecast: RaceConditions | null }) {
  const weatherFirm = !!forecast?.available && forecast.daysToRace <= 3
  const lo = p.timeMin, hi = p.timeMax
  const span = Math.max(1, hi - lo)
  const pos = (s: number) => Math.max(0, Math.min(100, ((s - lo) / span) * 100))
  const pTarget = pos(p.estTimeS)
  const weatherS = weather ? p.estTimeS * weather.factor : null
  const pW = weatherS != null ? pos(weatherS) : null
  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View><Text style={{ fontSize: 18, color: GROWTH2, fontWeight: '700' }}>{fmtRaceTimeS(lo)}</Text><Text style={{ fontSize: 9, color: colors.text3, marginTop: 2 }}>OPTIMISTE</Text></View>
        <View style={{ alignItems: 'flex-end' }}><Text style={{ fontSize: 18, color: OVER, fontWeight: '700' }}>{fmtRaceTimeS(hi)}</Text><Text style={{ fontSize: 9, color: colors.text3, marginTop: 2 }}>PRUDENT</Text></View>
      </View>
      <View style={{ height: 10, borderRadius: 999, backgroundColor: colors.amber, position: 'relative', overflow: 'visible' }}>
        <View style={{ position: 'absolute', left: `${pTarget}%`, top: 5, width: 18, height: 18, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 3, borderColor: GROWTH2, transform: [{ translateX: -9 }, { translateY: -9 }] }} />
        {pW != null ? <View style={{ position: 'absolute', left: `${pW}%`, top: 5, width: 11, height: 11, borderRadius: 999, backgroundColor: colors.ember, borderWidth: 2, borderColor: colors.bg, transform: [{ translateX: -5.5 }, { translateY: -5.5 }] }} /> : null}
      </View>
      <View style={{ height: 30, marginTop: 6, position: 'relative' }}>
        <View style={{ position: 'absolute', left: `${pTarget}%`, alignItems: 'center', transform: [{ translateX: -30 }], width: 60 }}>
          <Text style={{ fontSize: 15, color: GROWTH2, fontWeight: '700' }}>{fmtRaceTimeS(p.estTimeS)}</Text>
          <Text style={{ fontSize: 8.5, color: colors.text3, marginTop: 2 }}>CIBLE</Text>
        </View>
        {pW != null && weatherS != null ? (
          <View style={{ position: 'absolute', left: `${pW}%`, alignItems: 'center', transform: [{ translateX: -35 }], width: 70 }}>
            <Text style={{ fontSize: 15, color: colors.ember, fontWeight: '700' }}>{fmtHM(weatherS / 60)}</Text>
            <Text style={{ fontSize: 8.5, color: colors.text3, marginTop: 2 }}>MÉTÉO +{weather!.totalPct}%{weatherFirm ? '' : ' · INDIC.'}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function KeyCard({ variant, sec, passageHM }: { variant: 'risk' | 'recovery' | 'technical'; sec: { startKm: number; endKm: number; dplus: number; dminus: number; grade: number; technicalKm?: number }; passageHM: (km: number) => string }) {
  const isRisk = variant === 'risk', isTech = variant === 'technical'
  const accent = isRisk ? OVER : isTech ? colors.amber : colors.growth
  const dist = (sec.endKm - sec.startKm).toFixed(1)
  const lacetsKm = sec.technicalKm != null ? sec.technicalKm.toFixed(1) : dist
  const title = isRisk ? `Montée la plus raide — ${Math.round(sec.grade)}% sur ${dist} km` : isTech ? `Descente — ${lacetsKm} km en lacets sur ${dist} km` : `Descente principale — ${dist} km favorables`
  const advice = isRisk ? 'Marche active recommandée. Ne brûle pas tes réserves ici.' : isTech ? "Lacets serrés : freinage constant, pas d'accélération franche. Anticipe les trajectoires, économise les quadriceps." : "Relâche les épaules, récupère le souffle. Gère l'impact quadriceps."
  const eyebrow = isRisk ? 'RISQUE · PENTE RAIDE' : isTech ? 'DESCENTE TECHNIQUE · LACETS' : 'RÉCUP · DESCENTE CLÉ'
  return (
    <View style={{ backgroundColor: colors.surf, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, borderTopWidth: 2, borderTopColor: accent, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ico name={isRisk || isTech ? 'alert' : 'check'} c={accent} s={15} />
        <Text style={{ fontSize: 10.5, color: accent, fontWeight: '700', letterSpacing: 1.4 }}>{eyebrow}</Text>
      </View>
      <Text style={{ fontSize: 21, color: colors.text, lineHeight: 23 }}>{title}</Text>
      <Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.4 }}>KM {sec.startKm.toFixed(1)} → {sec.endKm.toFixed(1)}  ·  {isRisk ? '+' + Math.round(sec.dplus) + ' D+' : '−' + Math.round(sec.dminus) + ' D−'}  ·  passage {passageHM((sec.startKm + sec.endKm) / 2)}</Text>
      <Text style={{ fontSize: 13, color: colors.text2, lineHeight: 19 }}>{advice}</Text>
    </View>
  )
}

function ConditionsBlock({ p, race, forecast, weather }: { p: ProjectionResult; race: RaceMeta; forecast: RaceConditions; weather: WeatherImpact | null }) {
  const adj = weather ? p.estTimeS * weather.factor : p.estTimeS
  const pct = weather?.totalPct ?? 0
  return (
    <View style={[cardStyle, { padding: 20, gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <View>
          <Eyebrow>CONDITIONS LE JOUR J · J−{forecast.daysToRace}</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 38, color: colors.ember, fontWeight: '700' }}>{fmtHM(adj / 60)}</Text>
            <Text style={{ fontSize: 13, color: colors.text2 }}>cible ajustée météo</Text>
            {pct > 0 ? <Text style={{ fontSize: 12, color: colors.ember, fontWeight: '600' }}>+{pct}%</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {forecast.tempC != null ? <Chip><Ico name="temp" c={colors.ember} s={13} /><Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.66 }}>{Math.round(forecast.tempC)}°C{forecast.feelsLikeC != null && Math.abs(forecast.feelsLikeC - forecast.tempC) >= 2 ? ` · RESSENTI ${Math.round(forecast.feelsLikeC)}°C` : ''}</Text></Chip> : null}
          {forecast.humidityPct != null && forecast.humidityPct >= 70 ? <Chip><View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#8aa0c8' }} /><Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.66 }}>HUMIDITÉ {Math.round(forecast.humidityPct)}%</Text></Chip> : null}
          {forecast.windKmh != null ? <Chip><Ico name="wind" c={colors.text2} s={13} /><Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.66 }}>VENT {Math.round(forecast.windKmh)} KM/H</Text></Chip> : null}
          {forecast.isNight ? <Chip><Ico name="moon" c="#8aa0c8" s={13} /><Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.66 }}>NUIT</Text></Chip> : null}
          {forecast.precipMm != null ? <Chip><View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: forecast.precipMm > 0.5 ? '#8aa0c8' : colors.growth }} /><Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.66 }}>{forecast.precipMm > 0.5 ? 'PLUIE' : 'SEC'}</Text></Chip> : null}
        </View>
      </View>
      {race.goal_time && p.goalLabel ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 11, color: colors.text2, letterSpacing: 0.88 }}>OBJECTIF {race.goal_time.toUpperCase()}</Text>
            <Text style={{ paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(52,211,153,0.16)', color: GROWTH2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.63, overflow: 'hidden' }}>{p.goalLabel.toUpperCase()}</Text>
            {p.goalCompareStr ? <Text style={{ fontSize: 13.5, color: colors.text }}>{p.goalCompareStr}</Text> : null}
          </View>
        </>
      ) : null}
    </View>
  )
}

function KeySections({ p, ravitos }: { p: ProjectionResult; ravitos: RavitoPoint[] }) {
  const top = p.sections.map((s, i) => ({ s, t: p.sectionTimes[i] ?? 0 })).sort((a, b) => b.t - a.t).slice(0, 3).sort((a, b) => a.s.startKm - b.s.startKm)
  return (
    <View style={[cardStyle, { padding: 20 }]}>
      <Eyebrow style={{ marginBottom: 6 }}>SECTIONS CLÉS</Eyebrow>
      {top.map(({ s, t }, i) => {
        const up = s.type === 'up'
        const heat = s.technical ? Math.max(sectionHeat(s), 3) : sectionHeat(s)
        const nearRavito = ravitos.find((r) => Math.abs(r.km - s.startKm) < 2)
        const advice = up ? 'Effort maîtrisé — FC max 85%, cadence courte, bras actifs.' : s.technical ? 'Descente technique en lacets — freinage constant, anticipe les virages, économise les quadris.' : 'Descente roulante — récupération possible, relâche le haut du corps.'
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 16, paddingVertical: 14, borderBottomWidth: i < top.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
            <View style={{ width: 56, alignItems: 'center' }}>
              <Text style={{ fontSize: 26, color: HEAT_COLORS[heat], fontWeight: '700' }}>{(up ? '+' : '−') + Math.round(up ? s.dplus : s.dminus)}</Text>
              <Text style={{ fontSize: 8.5, color: colors.text3, marginTop: 3 }}>{up ? 'D+' : 'D−'}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                <Ico name={up ? 'up' : 'down'} c={HEAT_COLORS[heat]} s={14} />
                <Text style={{ fontSize: 11.5, color: colors.text, fontWeight: '700', letterSpacing: 0.88 }}>{up ? 'MONTÉE' : s.technical ? 'DESCENTE TECHNIQUE' : 'DESCENTE'}</Text>
                <Text style={{ fontSize: 10.5, color: colors.text3 }}>KM {s.startKm.toFixed(1)}→{s.endKm.toFixed(1)} · {(s.endKm - s.startKm).toFixed(1)} KM · {Math.round(t / 60)} MIN</Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.text2, lineHeight: 19 }}>{advice}</Text>
              {(s.surface || s.slip) ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
                  {s.surface ? <Text style={{ fontSize: 10, color: surfaceInfo(s.surface).col }}>{surfaceInfo(s.surface).fr}</Text> : null}
                  {s.slip ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ico name="alert" c={OVER} s={12} /><Text style={{ fontSize: 11, color: OVER }}>{s.slip}</Text></View> : null}
                </View>
              ) : null}
            </View>
            {nearRavito ? (
              <View style={{ alignSelf: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.line }}>
                  <Ico name="drop" c={colors.ember} s={12} /><Text style={{ fontSize: 10, color: colors.ember }}>RAVITO ~{nearRavito.km} KM</Text>
                </View>
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

function Accordion({ label, meta, children }: { label: string; meta?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: colors.surf2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
          <Text style={{ fontSize: 11.5, color: colors.text, letterSpacing: 1.2, fontWeight: '600' }}>{label}</Text>
          {meta ? <Text style={{ fontSize: 10.5, color: colors.text3 }}>{meta}</Text> : null}
        </View>
        {open ? <CaretUpIcon size={13} color={colors.text3} /> : <CaretDownIcon size={13} color={colors.text3} />}
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 }}>{children}</View> : null}
    </View>
  )
}

const ACT_GREEN = colors.growth, ACT_AMBER = colors.amber, ACT_RED = OVER
function sectionAction(s: { type: 'up' | 'down' | 'flat'; grade: number; technical?: boolean }, heat: number): { label: string; color: string; icon: 'alert' | 'check' } {
  const g = Math.abs(s.grade)
  if (s.type === 'up') {
    if (g >= 12 || heat >= 4) return { label: 'Marche active — économise tes jambes', color: ACT_RED, icon: 'alert' }
    if (g >= 6 || heat >= 3) return { label: 'Effort maîtrisé — garde de la marge', color: ACT_AMBER, icon: 'alert' }
    return { label: 'Reste fluide — garde le rythme', color: ACT_GREEN, icon: 'check' }
  }
  if (s.type === 'down') {
    if (s.technical) return { label: 'Prudence — freine et anticipe les virages', color: ACT_RED, icon: 'alert' }
    if (g >= 15) return { label: "Contrôle la descente — gère l'impact", color: ACT_AMBER, icon: 'alert' }
    return { label: 'Relance — laisse rouler et récupère', color: ACT_GREEN, icon: 'check' }
  }
  return { label: 'Allure de croisière — relance possible', color: ACT_GREEN, icon: 'check' }
}

function AllSectionsTable({ p, passageHM }: { p: ProjectionResult; passageHM: (km: number) => string }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <Legend c={ACT_GREEN} label="Relance / pousse" />
        <Legend c={ACT_AMBER} label="Gère l'effort" />
        <Legend c={ACT_RED} label="Prudence" />
      </View>
      {p.sections.map((s, i) => {
        const up = s.type === 'up'
        const heat = s.technical ? Math.max(sectionHeat(s), 3) : sectionHeat(s)
        const dur = Math.max(1, Math.round((p.sectionTimes[i] ?? 0) / 60))
        const act = sectionAction(s, heat)
        const typeLabel = up ? 'Montée' : s.type === 'down' ? 'Descente' : 'Plat'
        const dPlusMinus = up ? '+' + Math.round(s.dplus) : s.type === 'down' ? '−' + Math.round(s.dminus) : '±0'
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 13, borderBottomWidth: i < p.sections.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
            <View style={{ width: 24, alignItems: 'center', gap: 6, paddingTop: 2 }}>
              <Text style={{ fontSize: 10, color: colors.text3 }}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: HEAT_COLORS[heat] }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <Ico name={up ? 'up' : s.type === 'down' ? 'down' : 'check'} c={HEAT_COLORS[heat]} s={13} />
                <Text style={{ fontSize: 13.5, color: colors.text, fontWeight: '600' }}>{typeLabel} {Math.round(s.grade)}%</Text>
                <Text style={{ fontSize: 9.5, color: HEAT_COLORS[heat], letterSpacing: 0.6 }}>{HEAT_NAMES[heat].toUpperCase()}</Text>
                {s.surface ? <Text style={{ fontSize: 9.5, color: surfaceInfo(s.surface).col }}>{surfaceInfo(s.surface).fr.toUpperCase()}</Text> : null}
              </View>
              <Text style={{ fontSize: 10.5, color: colors.text3, marginTop: 4 }}>km {s.startKm.toFixed(1)}→{s.endKm.toFixed(1)} · {dPlusMinus} m · {dur} min</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Ico name={act.icon} c={act.color} s={13} />
                <Text style={{ fontSize: 12.5, color: act.color, fontWeight: '600', flex: 1 }}>{act.label}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', paddingTop: 1 }}>
              <Text style={{ fontSize: 17, color: colors.text }}>{passageHM(s.endKm)}</Text>
              <Text style={{ fontSize: 8.5, color: colors.text3, marginTop: 2 }}>PASSAGE</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function NutritionTable({ rows }: { rows: NutritionRow[] }) {
  return (
    <View>
      {rows.map((n, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 14, paddingVertical: 13, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.line, alignItems: 'center' }}>
          <View style={{ width: 70 }}><Text style={{ fontSize: 18, color: colors.ember, fontWeight: '700' }}>{n.moment}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, color: colors.text }}>{n.action}</Text>
            <Text style={{ fontSize: 12, color: colors.text2, marginTop: 2 }}>{n.note}</Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>{n.glucides}</Text>
        </View>
      ))}
    </View>
  )
}
