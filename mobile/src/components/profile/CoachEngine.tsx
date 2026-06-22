import { Text, View } from 'react-native'
import { useCoachPlan } from '@/lib/coach/useCoachPlan'
import { colors, radius } from '@/lib/theme'

// « Ton moteur » : ce que l'algo lit du coureur (VDOT, VMA/seuil, CTL, fraîcheur,
// durabilité, côtes). Profil › LABO. Autonome : relit le plan partagé (useCoachPlan).

const LEVEL_LABELS: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Confirmé' }
function fmtPaceMMSS(secPerKm: number): string { const s = Math.max(0, Math.round(secPerKm)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const ANCHOR_SOURCE_LABEL: Record<string, string> = { test: 'test', history: 'historique', vdot: 'VDOT' }

export default function CoachEngine() {
  const { profile, vdot, level, weaknesses, fitnessAnchor, pmcToday, currentCTL } = useCoachPlan()
  const rp = profile?.runner_profile ?? null
  const driftVal = rp?.hrDriftPct
  const durability = driftVal != null
    ? { v: `${driftVal > 0 ? '+' : ''}${driftVal.toFixed(0)}%`, sub: rp!.hrDriftStatus === 'marked' ? 'Faiblit en fin' : rp!.hrDriftStatus === 'moderate' ? 'Correcte' : 'Solide', color: rp!.hrDriftStatus === 'marked' ? colors.status.watch : colors.status.prod }
    : { v: '—', sub: 'Données à venir', color: colors.text3 }
  const climbWeak = weaknesses.includes('climbing')
  const climb = rp
    ? { v: climbWeak ? 'À renforcer' : 'OK', sub: climbWeak ? 'Point faible' : 'Point fort', color: climbWeak ? colors.status.watch : colors.status.prod }
    : { v: '—', sub: 'Données à venir', color: colors.text3 }

  const engine: { cl: string; v: string; sub: string; color: string }[] = [
    { cl: 'Niveau · VDOT', v: String(Math.round(vdot)), sub: LEVEL_LABELS[level] ?? level, color: colors.text },
    ...(fitnessAnchor ? [{ cl: 'VMA · seuil', v: `${(fitnessAnchor.vmaMetersPerSec * 3.6).toFixed(1)}`, sub: `km/h · CS ${fmtPaceMMSS(fitnessAnchor.csPaceSecPerKm)}/km · via ${ANCHOR_SOURCE_LABEL[fitnessAnchor.source]}`, color: colors.growth }] : []),
    { cl: 'Fond · CTL', v: currentCTL != null ? String(currentCTL) : '—', sub: 'Charge chronique', color: colors.ember },
    { cl: 'Fraîcheur · TSB', v: pmcToday ? (pmcToday.tsb > 0 ? `+${pmcToday.tsb}` : String(pmcToday.tsb)) : '—', sub: pmcToday ? (pmcToday.tsb > 5 ? 'Frais' : pmcToday.tsb < -10 ? 'Chargé' : 'Stable') : '—', color: colors.status.peak },
    { cl: 'Durabilité', v: durability.v, sub: durability.sub, color: durability.color },
    { cl: 'Côtes · VAM', v: climb.v, sub: climb.sub, color: climb.color },
  ]

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 19, fontWeight: '800', letterSpacing: 0.38, textTransform: 'uppercase', color: colors.text }}>Ton moteur</Text>
        <Text style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.text3 }}>Ce que l'algo lit de toi</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.line, gap: 1 }}>
        {engine.map((c) => (
          <View key={c.cl} style={{ width: '49.7%', backgroundColor: colors.surf, paddingHorizontal: 15, paddingTop: 15, paddingBottom: 13 }}>
            <Text style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.text3, fontWeight: '600' }}>{c.cl}</Text>
            <Text style={{ fontSize: 30, fontWeight: '800', lineHeight: 30, marginTop: 6, marginBottom: 2, color: c.color }}>{c.v}</Text>
            <Text style={{ fontSize: 10, color: colors.text2 }}>{c.sub}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
