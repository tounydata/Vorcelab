// Gate PRO — portage de src/components/ProGate.tsx, adapté aux règles App Store :
// AUCUN prix, AUCUN bouton ou lien d'achat dans l'app (Guideline 3.1.3(b) —
// l'abonnement se souscrit hors app ; on ne fait qu'expliquer ce que PRO couvre).
// Icônes SVG au lieu des emojis du web (règle produit mobile).
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { useTrackEvent } from '@/lib/useTrackEvent'
import { colors, font, radius } from '@/lib/theme'

const stroke = (color: string) => ({
  fill: 'none' as const, stroke: color, strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

function PerkIcon({ kind }: { kind: 'map' | 'plan' | 'chart' | 'flash' }) {
  const c = colors.ember
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      {kind === 'map' && <Path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14" {...stroke(c)} />}
      {kind === 'plan' && <><Rect x={3} y={5} width={18} height={16} rx={2} {...stroke(c)} /><Path d="M3 10h18M8 3v4M16 3v4" {...stroke(c)} /></>}
      {kind === 'chart' && <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...stroke(c)} />}
      {kind === 'flash' && <Path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" {...stroke(c)} />}
    </Svg>
  )
}

const PRO_PERKS: { icon: 'map' | 'plan' | 'chart' | 'flash'; label: string; sub: string }[] = [
  { icon: 'map', label: 'Stratégies GPX illimitées', sub: 'Toutes tes courses, chaque édition' },
  { icon: 'plan', label: 'Plan coach complet', sub: 'Toutes les semaines, pas seulement les deux premières' },
  { icon: 'chart', label: 'Analyse avancée', sub: 'Comparaison prévu/réel, VDOT auto-calibré' },
  { icon: 'flash', label: 'Accès prioritaire', sub: 'Nouvelles fonctionnalités en avant-première' },
]

interface ProGateProps {
  feature?: string
}

export default function ProGate({ feature = 'cette fonctionnalité' }: ProGateProps) {
  const track = useTrackEvent()

  useEffect(() => {
    track('progate_view', { feature, platform: 'mobile' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={{ paddingVertical: 32, alignItems: 'center' }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(214,128,62,0.12)', borderWidth: 1, borderColor: colors.ember,
        borderRadius: 20, paddingVertical: 4, paddingHorizontal: 14, marginBottom: 20,
      }}>
        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={4} fill={colors.ember} /><Path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...stroke(colors.ember)} /></Svg>
        <Text style={{ fontFamily: font.monoSemiBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ember }}>PRO</Text>
      </View>

      <Text style={{ fontFamily: font.display, fontSize: 27, lineHeight: 30, color: colors.text, textAlign: 'center', marginBottom: 10 }}>
        {feature.toUpperCase()} : RÉSERVÉ À VORCELAB PRO
      </Text>
      <Text style={{ fontFamily: font.mono, fontSize: 12, color: colors.text2, textAlign: 'center', marginBottom: 28, maxWidth: 340, lineHeight: 18 }}>
        Tu as utilisé ta stratégie GPX gratuite. Vorcelab PRO couvre l’analyse de toutes tes courses.
      </Text>

      <View style={{ width: '100%', gap: 10, marginBottom: 24 }}>
        {PRO_PERKS.map((p) => (
          <View key={p.label} style={{
            flexDirection: 'row', gap: 10, alignItems: 'flex-start',
            backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line,
            borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14,
          }}>
            <PerkIcon kind={p.icon} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 2 }}>{p.label}</Text>
              <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text2 }}>{p.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3, textAlign: 'center' }}>
        Ta stratégie GPX existante reste toujours accessible.
      </Text>
    </View>
  )
}
