import { useState } from 'react'
import { Modal, Pressable, Text, TextInput, View } from 'react-native'
import { vmaFromHalfCooperM, CS_TO_VMA } from '@/lib/criticalSpeed'
import { colors, radius } from '@/lib/theme'
import { Card } from './ui'

// Calibrage VMA (test demi-Cooper) en POP-UP. Proposé tant que l'athlète n'a NI
// fait le test NI cliqué « plus tard ». La décision est persistée CÔTÉ SERVEUR
// (profiles.demi_cooper) — sinon le pop-up réapparaît à chaque visite.
// Toujours refaisable dans Profil › LABO.

export default function CalibrationPopup({ show, saving, onSave, onSkip }: {
  show: boolean
  saving: boolean
  onSave: (m: number) => void
  onSkip: () => void
}) {
  const [closed, setClosed] = useState(false)
  const [dist, setDist] = useState('')
  if (!show || closed) return null

  const m = parseInt(dist, 10)
  const valid = Number.isFinite(m) && m >= 800 && m <= 3000
  const vmaKmh = valid ? +(vmaFromHalfCooperM(m) * 3.6).toFixed(1) : null
  const csKmh = vmaKmh != null ? +(vmaKmh * CS_TO_VMA).toFixed(1) : null

  function skip() { setClosed(true); onSkip() }
  function save() { if (valid) { onSave(m); setClosed(true) } }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={skip}>
      <Pressable
        onPress={skip}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420 }}>
          <Card style={{ padding: 20, borderLeftWidth: 4, borderLeftColor: colors.status.peak }}>
            <Text style={{ fontWeight: '700', fontSize: 18, color: colors.text, marginBottom: 6 }}>Calibrons ton plan</Text>
            <Text style={{ fontSize: 13, color: colors.text2, lineHeight: 20, marginBottom: 12 }}>
              On démarre ta prépa. Pour caler toutes tes allures, fais un <Text style={{ fontWeight: '700', color: colors.text }}>test VMA (demi-Cooper)</Text> :
              6 min à fond après échauffement, puis entre la distance couverte. 5 min qui rendent ton plan plus juste.
              Sinon, on se base sur ton <Text style={{ fontWeight: '700', color: colors.text }}>historique récent</Text>.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TextInput
                value={dist}
                onChangeText={setDist}
                keyboardType="numeric"
                placeholder="Distance en 6 min (m)"
                placeholderTextColor={colors.text3}
                style={{
                  width: 170, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: colors.surf2,
                  color: colors.text, borderWidth: 1, borderColor: colors.line2, borderRadius: 6, fontSize: 13,
                }}
              />
              <Pressable
                onPress={save}
                disabled={!valid || saving}
                style={{
                  paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm,
                  backgroundColor: valid ? colors.ember : colors.surf2, opacity: saving ? 0.6 : 1,
                }}
              >
                <Text style={{ color: valid ? colors.bg : colors.text3, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer le test'}
                </Text>
              </Pressable>
            </View>
            {csKmh != null ? (
              <Text style={{ fontSize: 11.5, color: colors.text3, marginTop: 8 }}>
                ≈ VMA {vmaKmh} km/h · CS (allure ~60 min) {csKmh} km/h
              </Text>
            ) : null}
            <View style={{ marginTop: 14, alignItems: 'flex-end' }}>
              <Pressable
                onPress={skip}
                style={{
                  paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm,
                  borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.surf2,
                }}
              >
                <Text style={{ color: colors.text2, fontSize: 13, fontWeight: '600', letterSpacing: 0.84 }}>
                  Plus tard · utiliser mon historique
                </Text>
              </Pressable>
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
