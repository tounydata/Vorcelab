import { Text, View } from 'react-native'
import { deriveRunnerPaces } from '@/lib/runnerPaces'
import { formatPace, hrFromMax, type PaceZone } from '@/lib/paceEngine'
import { Card, colors } from '@/components/coach/ui'

const ZONE_COLOR: Record<PaceZone, string> = { E: '#22c55e', M: '#eab308', T: '#f97316', I: '#ef4444', R: '#b91c1c' }
const ZONE_LABEL: Record<PaceZone, string> = { E: 'Facile', M: 'Marathon', T: 'Seuil', I: 'VO2max', R: 'Vitesse' }
const ZONES: PaceZone[] = ['E', 'M', 'T', 'I', 'R']
const FC_ZONES = [
  { label: 'Z1', color: '#3b82f6', from: 0, to: 0.6 },
  { label: 'Z2', color: '#22c55e', from: 0.6, to: 0.7 },
  { label: 'Z3', color: '#eab308', from: 0.7, to: 0.8 },
  { label: 'Z4', color: '#f97316', from: 0.8, to: 0.9 },
  { label: 'Z5', color: '#ef4444', from: 0.9, to: 1 },
]

/** Carte « Mes allures » — allures d'entraînement réelles + zones FC. Null-safe. */
export default function PaceZonesCard({ prs, vo2max, fcMax, showFcZones = true }: {
  prs?: Record<string, unknown> | null
  vo2max?: number | null
  fcMax?: number | null
  showFcZones?: boolean
}) {
  const rp = deriveRunnerPaces(prs, vo2max)

  if (!rp && !fcMax) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.68, fontWeight: '600', marginBottom: 6 }}>MES ALLURES</Text>
        <Text style={{ fontSize: 13, color: colors.text3 }}>Ajoute ta VO2max ou un temps de course récent pour calculer tes allures cibles.</Text>
      </Card>
    )
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.68, fontWeight: '600' }}>MES ALLURES</Text>
        {rp ? <Text style={{ fontSize: 10, color: colors.text3 }}>Niveau {rp.vdot} (VDOT) · {rp.source === 'race_pr' ? "d'après ta course" : 'estimé (VO2max)'}</Text> : null}
      </View>
      {rp ? (
        <View style={{ gap: 6, marginBottom: fcMax ? 14 : 0 }}>
          {ZONES.map((z) => (
            <View key={z} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: ZONE_COLOR[z] }} />
              <Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>{ZONE_LABEL[z]}</Text>
              <Text style={{ fontSize: 12, color: colors.text2, fontWeight: '700' }}>{formatPace(rp.paces[z].fastSecPerKm)}–{formatPace(rp.paces[z].slowSecPerKm)}/km</Text>
            </View>
          ))}
        </View>
      ) : null}
      {fcMax && showFcZones ? (
        <View>
          <Text style={{ fontSize: 9, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.44, fontWeight: '600', marginBottom: 6 }}>ZONES FC · %FCMAX {fcMax}</Text>
          <View style={{ gap: 5 }}>
            {FC_ZONES.map((z) => (
              <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: z.color }} />
                <Text style={{ flex: 1, color: colors.text2, fontSize: 12 }}>{z.label}</Text>
                <Text style={{ fontSize: 11, color: colors.text3 }}>{z.from > 0 ? `${hrFromMax(fcMax, z.from)}–` : '<'}{hrFromMax(fcMax, z.to)} bpm</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  )
}
