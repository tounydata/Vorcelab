import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import type { RacePromptResult } from '@/lib/racePrompt'
import { colors, radius } from '@/lib/theme'

/**
 * Pop-up « Comment s'est passée ta course ? » — proposé le jour J (ou à la première
 * ouverture suivante) pour une course récente non encore liée. Porté à l'identique du web.
 */
export default function PostRaceModal({
  prompt, onLink, onOpenRace, onDismiss,
}: {
  prompt: RacePromptResult
  onLink: (activityId: string) => Promise<void> | void
  onOpenRace: () => void
  onDismiss: () => void
}) {
  const [busy, setBusy] = useState(false)
  const { race, suggestion } = prompt
  const km = race.distance != null ? `${race.distance} km` : ''
  const sugKm = suggestion?.distance != null ? (suggestion.distance / 1000).toFixed(1) : null

  const handleLink = async () => {
    if (!suggestion?.id) { onOpenRace(); return }
    setBusy(true)
    try { await onLink(suggestion.id) } finally { setBusy(false) }
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <Pressable onPress={onDismiss} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, backgroundColor: colors.surf, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 22 }}>
          <Text style={{ fontSize: 26, marginBottom: 6 }}>🏁</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 }}>Comment s'est passée ta course ?</Text>
          <Text style={{ fontSize: 14, color: colors.text2, lineHeight: 20, marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{race.name || 'Ta course'}</Text>{km ? ` · ${km}` : ''}. Lie ton activité Strava pour ton débrief complet — allure prévue vs réelle, cardiaque, terrain, enseignements.
          </Text>

          {suggestion ? (
            <View style={{ backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 11, marginBottom: 14 }}>
              <Text style={{ fontSize: 11, color: colors.text3, marginBottom: 2 }}>ON A TROUVÉ CETTE ACTIVITÉ</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text numberOfLines={1} style={{ fontWeight: '600', color: colors.text, flex: 1 }}>{suggestion.name || 'Sortie'}</Text>
                {sugKm ? <Text style={{ fontSize: 12, color: colors.text2 }}>{sugKm} km</Text> : null}
              </View>
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Pressable onPress={handleLink} disabled={busy} style={{ backgroundColor: colors.ember, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center', opacity: busy ? 0.7 : 1 }}>
              <Text style={{ color: colors.bg, fontWeight: '700' }}>{busy ? 'Liaison…' : suggestion ? 'Oui — lier et voir mon débrief' : 'Lier mon activité'}</Text>
            </Pressable>
            {suggestion ? (
              <Pressable onPress={onOpenRace} disabled={busy} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ color: colors.text2, fontSize: 13 }}>Choisir une autre activité</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onDismiss} disabled={busy} style={{ paddingVertical: 9, alignItems: 'center' }}>
              <Text style={{ color: colors.text2, fontSize: 13 }}>Plus tard</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
