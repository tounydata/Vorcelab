import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { type SessionLog } from '@/lib/renfoUtils'
import { FOCUS_META, RENFO_FOCUS_COLORS } from '@/lib/renfoData'
import { colors, radius } from '@/lib/theme'
import { HButton } from './ui'

// Détail d'une séance RENFO depuis le menu de la semaine : la séance suggérée pour
// ce créneau + toutes les catégories (excentrique, tronc, mobilité…) avec les
// badges « recommandé / à éviter cette semaine » issus de la co-périodisation.
// L'athlète choisit librement, puis LANCE la séance (page renfo dédiée).

const RENFO_COLOR = colors.violet // --color-renfo
const FORCE_FOCUSES = ['force_lourde', 'pliometrie', 'excentrique', 'tronc'] as const
const MOBILITE_FOCUSES = ['haut_corps', 'yoga_coureur', 'stretching'] as const

function fmtLastDate(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return "aujourd'hui"
  if (diff === 1) return 'hier'
  return `il y a ${diff}j`
}

export default function RenfoDetail({ slotFocus, preferred, avoided }: {
  slotFocus: string
  /** Co-périodisation — MÊME source que la séance proposée (pas de contradiction). */
  preferred?: Set<string>
  avoided?: Set<string>
}) {
  const { session } = useAuth()
  const userId = session?.user.id
  const router = useRouter()
  const go = (path: string) => router.push(path as never)
  const preferredSet = preferred ?? new Set<string>()
  const avoidedSet = avoided ?? new Set<string>()

  // Dernières séances renfo (7 j) → « il y a Xj » par focus.
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([])
  useEffect(() => {
    if (!userId) return
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    supabase
      .from('renfo_session_log')
      .select('id,focus,duration_min,session_date,source')
      .eq('user_id', userId)
      .gte('session_date', cutoff)
      .order('session_date', { ascending: false })
      .then(({ data }) => setSessionLogs((data ?? []) as SessionLog[]))
  }, [userId])

  const lastDateByFocus: Record<string, string> = {}
  for (const s of sessionLogs) {
    if (s.focus && s.session_date && !lastDateByFocus[s.focus]) lastDateByFocus[s.focus] = s.session_date
  }

  const suggestMeta = FOCUS_META[slotFocus]

  function renderFocus(focus: string) {
    const meta = FOCUS_META[focus]
    if (!meta) return null
    const color = RENFO_FOCUS_COLORS[focus] ?? RENFO_COLOR
    const lastDate = lastDateByFocus[focus]
    const isPreferred = preferredSet.has(focus)
    const isAvoided = avoidedSet.has(focus)
    return (
      <Pressable
        key={focus}
        onPress={() => go(`/renfo/session/${focus}`)}
        style={{
          width: '48%',
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line,
          borderTopWidth: 3,
          borderTopColor: color,
          borderRadius: radius.md,
          paddingVertical: 13,
          paddingHorizontal: 14,
          minHeight: 84,
          opacity: isAvoided ? 0.45 : 1,
        }}
      >
        <Text style={{ color, fontSize: 16.8, fontWeight: '700', lineHeight: 17.6, letterSpacing: 0.16 }}>{meta.label}</Text>
        <Text style={{ fontSize: 10, letterSpacing: 0.4, color: colors.text3, marginTop: 6 }}>
          {meta.duration_min} min{lastDate ? ` · ${fmtLastDate(lastDate)}` : ' · jamais'}
        </Text>
        {isPreferred ? (
          <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.54, textTransform: 'uppercase', color: colors.status.prod, backgroundColor: 'rgba(93,160,132,0.12)', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, marginTop: 8, alignSelf: 'flex-start', overflow: 'hidden' }}>
            ★ Recommandé
          </Text>
        ) : null}
        {isAvoided ? (
          <Text style={{ fontSize: 9, letterSpacing: 0.54, textTransform: 'uppercase', color: colors.text3, marginTop: 8 }}>
            évité cette semaine
          </Text>
        ) : null}
      </Pressable>
    )
  }

  return (
    <View>
      {/* Séance suggérée pour ce créneau */}
      {suggestMeta ? (
        <View
          style={{
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: colors.line2,
            borderLeftWidth: 4,
            borderLeftColor: RENFO_COLOR,
            borderRadius: radius.md,
            paddingVertical: 16,
            paddingHorizontal: 18,
            marginBottom: 24,
            gap: 12,
          }}
        >
          <View style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: RENFO_COLOR, fontWeight: '700' }}>Suggéré pour ce créneau</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: 0.48, marginTop: 5, marginBottom: 3, textTransform: 'uppercase', color: colors.text }}>{suggestMeta.label}</Text>
            <Text style={{ fontSize: 10.5, color: colors.text2, letterSpacing: 0.2 }}>
              {suggestMeta.duration_min} min{preferredSet.has(slotFocus) ? ' · privilégié par la co-périodisation' : ''}
            </Text>
          </View>
          <Text style={{ fontSize: 12.5, color: colors.text3 }}>…ou choisis une autre catégorie ↓</Text>
          <HButton
            label="Démarrer"
            onPress={() => go(`/renfo/session/${slotFocus}`)}
            style={{ backgroundColor: RENFO_COLOR, borderColor: RENFO_COLOR, alignSelf: 'flex-start' }}
            textStyle={{ color: colors.bg }}
          />
        </View>
      ) : null}

      {/* Catégories — choix libre */}
      <CatHeader label="Force & puissance" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{FORCE_FOCUSES.map(renderFocus)}</View>
      <CatHeader label="Mobilité & prévention" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{MOBILITE_FOCUSES.map(renderFocus)}</View>

      <View style={{ marginTop: 14 }}>
        <HButton label="BIBLIOTHÈQUE COMPLÈTE" onPress={() => go('/renfo/library')} style={{ alignSelf: 'flex-start' }} />
      </View>
    </View>
  )
}

// .rcat-h{font-family:mono;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--vl-text-3);margin:20px 0 12px;} + trait à droite
function CatHeader({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 12 }}>
      <Text style={{ fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.text3, fontWeight: '600' }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  )
}
