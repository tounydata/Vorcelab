import { Text, View } from 'react-native'
import { workoutChartBars } from '@/lib/workoutChart'
import { formatPace, type PaceZone } from '@/lib/paceEngine'
import type { Workout, Block } from '@/lib/sessionGenerator'
import { colors } from '@/lib/theme'
import { Card } from './coach/ui'

// Couleurs de zones alignées sur la palette FC de l'app (bleu→vert→jaune→orange→rouge).
const ZONE_COLOR: Record<PaceZone, string> = {
  E: '#22c55e', // facile
  M: '#eab308', // marathon
  T: '#f97316', // seuil
  I: '#ef4444', // VO2max
  R: '#b91c1c', // répétition / vitesse
}
const RECOVERY_COLOR = '#3b82f6' // récup / échauffement / retour au calme

function barColor(kind: Block['kind'], zone?: PaceZone): string {
  if (kind === 'recovery') return RECOVERY_COLOR
  if (zone) return ZONE_COLOR[zone]
  return ZONE_COLOR.T // bloc sans allure (côte, piloté RPE)
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec % 60 === 0) return `${sec / 60} min`
  const m = Math.floor(sec / 60)
  return `${m}:${String(sec % 60).padStart(2, '0')}`
}

function BlockRow({ block, effortMode }: { block: Block; effortMode: 'pace' | 'rpe' }) {
  // Allure cible (±15 s/km) ou RPE. En trail/côte (effortMode='rpe') l'allure est
  // trompeuse (D+, terrain) → on pilote à l'EFFORT : RPE prioritaire.
  const paceStr = block.paceSecPerKm
    ? `${formatPace(block.paceSecPerKm - 15)}–${formatPace(block.paceSecPerKm + 15)}/km`
    : ''
  const rpeStr = typeof block.rpe === 'number' ? `RPE ${block.rpe}` : ''
  const detail = effortMode === 'rpe' ? (rpeStr || paceStr) : (paceStr || rpeStr)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: barColor(block.kind, block.zone) }} />
      <Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>{block.label}</Text>
      {block.durationSec ? (
        <Text style={{ fontSize: 10, color: colors.text3 }}>{fmtDur(block.durationSec)}</Text>
      ) : null}
      {detail ? (
        <Text style={{ fontSize: 11, color: colors.text2, fontWeight: '700' }}>{detail}</Text>
      ) : null}
    </View>
  )
}

/** Écran de séance — profil d'intensité (barres) + liste des blocs. Présentationnel.
 *  `effortMode='rpe'` (trail/côte) : pilote à l'effort plutôt qu'à l'allure. */
export default function SessionProfile({ workout, effortMode = 'pace' }: { workout: Workout; effortMode?: 'pace' | 'rpe' }) {
  const bars = workoutChartBars(workout)
  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.68, fontWeight: '600' }}>
          {workout.type.replace(/_/g, ' ').toUpperCase()}
        </Text>
        <Text style={{ fontSize: 11, color: colors.text2 }}>{workout.totalMin} min</Text>
      </View>
      <Text style={{ marginBottom: 12, fontSize: 13, color: colors.text2, lineHeight: 18 }}>{workout.intent}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 90, marginBottom: 14 }}>
        {bars.map((b, i) => (
          <View
            key={i}
            style={{
              flexGrow: b.widthPct,
              flexBasis: 0,
              height: `${b.heightPct}%`,
              backgroundColor: barColor(b.kind, b.zone),
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              minWidth: 2,
            }}
          />
        ))}
      </View>

      <View style={{ gap: 7 }}>
        {workout.blocks.map((b, i) => (
          <BlockRow key={i} block={b} effortMode={effortMode} />
        ))}
      </View>
    </Card>
  )
}
