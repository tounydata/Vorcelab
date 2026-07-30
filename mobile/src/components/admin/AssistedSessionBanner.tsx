import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors, font } from '@/lib/theme'
import {
  endAssistedSession, subscribeAssistedSession, type AssistedSessionMeta,
} from '@/lib/assistedSession'
import { setViewAs, subscribeViewAs, type ViewAsUser } from '@/lib/viewAs'
import { minutesLeft } from './adminUi'

// Bandeaux permanents des modes admin. Ils sont volontairement voyants et non masquables :
// quand l'app n'affiche pas le compte réel de l'admin, il ne doit jamais y avoir de
// doute — c'est la contrepartie de l'usurpation et de la simulation de plan.
//
//   • ASSISTANCE : la session Supabase est celle d'un AUTRE utilisateur (données réelles).
//   • VUE EN TANT QUE : la session reste celle de l'admin, seul le plan est simulé.
//     C'est aussi la seule sortie possible du mode, puisque `isAdmin` y est simulé.

function Banner({ background, label, detail, onQuit, quitLabel }: {
  background: string
  label: string
  detail: string
  onQuit: () => void
  quitLabel: string
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: background,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontFamily: font.monoMedium, fontSize: 10.5, color: colors.bg, letterSpacing: 0.6 }}>
          {label}
        </Text>
        <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: colors.bg, opacity: 0.85 }}>
          {detail}
        </Text>
      </View>
      <Pressable
        onPress={onQuit}
        accessibilityRole="button"
        accessibilityLabel={quitLabel}
        hitSlop={8}
        style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 7, backgroundColor: colors.bg }}
      >
        <Text style={{ fontFamily: font.monoMedium, fontSize: 10, color: colors.text, letterSpacing: 0.6 }}>
          QUITTER
        </Text>
      </Pressable>
    </View>
  )
}

export default function AssistedSessionBanner() {
  const [meta, setMeta] = useState<AssistedSessionMeta | null>(null)
  const [viewAs, setViewAsState] = useState<ViewAsUser | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => subscribeAssistedSession(setMeta), [])
  useEffect(() => subscribeViewAs(setViewAsState), [])

  // Rafraîchit le compte à rebours sans dépendre d'un rendu externe.
  useEffect(() => {
    if (!meta) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [meta])

  if (meta) {
    const left = minutesLeft(meta.expiresAt)
    return (
      <Banner
        background={colors.violet}
        label={`ASSISTANCE — ${meta.targetLabel.toUpperCase()}`}
        detail={
          left == null ? 'session bornée'
            : left > 0 ? `retour admin dans ${left} min`
            : 'expiration imminente'
        }
        onQuit={() => void endAssistedSession()}
        quitLabel="Quitter la session d’assistance et revenir au compte admin"
      />
    )
  }

  if (viewAs) {
    return (
      <Banner
        background={colors.ember}
        label={`VUE EN TANT QUE — ${(viewAs.name ?? viewAs.email).toUpperCase()}`}
        detail={`plan ${viewAs.plan_tier.toUpperCase()}${viewAs.is_admin ? ' (admin)' : ''} · données réelles inchangées`}
        onQuit={() => setViewAs(null)}
        quitLabel="Quitter la vue simulée et revenir à ton propre plan"
      />
    )
  }

  return null
}
