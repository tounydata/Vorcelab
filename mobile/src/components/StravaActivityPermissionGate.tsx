import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, AppState, Modal, Pressable, Text, View } from 'react-native'
import { signInWithStravaMobile } from '@/lib/strava'
import { needsStravaActivityPermission, type StravaPermissionStatus } from '@/lib/stravaScopes'
import { SUPA_URL } from '@/lib/supabase'
import { colors, font, radius, space } from '@/lib/theme'

type GateState = 'checking' | 'clear' | 'blocked'

export default function StravaActivityPermissionGate({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<GateState>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getStatus = useCallback(async (): Promise<GateState> => {
    try {
      const response = await fetch(`${SUPA_URL}/functions/v1/strava-status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error('Strava status unavailable')
      const status = (await response.json()) as StravaPermissionStatus
      return needsStravaActivityPermission(status) ? 'blocked' : 'clear'
    } catch {
      // Une panne de statut ne doit pas bloquer tous les utilisateurs par erreur.
      return 'clear'
    }
  }, [accessToken])

  useEffect(() => {
    let active = true
    getStatus().then((next) => {
      if (active) setState(next)
    })
    return () => { active = false }
  }, [getStatus])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        getStatus().then(setState)
      }
    })
    return () => sub.remove()
  }, [getStatus])

  async function authorize() {
    setBusy(true)
    setError(null)
    try {
      const result = await signInWithStravaMobile({ forceApproval: true })
      if (result === 'connected') {
        setState(await getStatus())
      } else if (result === 'missing_scope') {
        setError('La case d’accès aux activités n’a pas été cochée. Réessaie et autorise-la pour continuer.')
      } else if (result === 'denied') {
        setError('Autorisation annulée. Elle est obligatoire pour continuer dans Vorcelab.')
      } else {
        setError('Connexion Strava impossible. Vérifie ta connexion puis réessaie.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      transparent
      visible={state === 'blocked'}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={{
        flex: 1, justifyContent: 'center', padding: space.xl,
        backgroundColor: 'rgba(5,5,7,0.96)',
      }}>
        <View style={{
          overflow: 'hidden', borderRadius: radius.xl,
          borderWidth: 1, borderColor: 'rgba(252,76,2,0.5)',
          backgroundColor: colors.surf, padding: space.xxl,
        }}>
          <View style={{
            alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 12, paddingVertical: 6, marginBottom: 20,
            borderRadius: 999, borderWidth: 1, borderColor: 'rgba(252,76,2,0.55)',
            backgroundColor: 'rgba(252,76,2,0.12)',
          }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FC4C02' }} />
            <Text style={{ color: '#ff6b2c', fontFamily: font.monoSemiBold, fontSize: 9, letterSpacing: 1.4 }}>
              ACTION OBLIGATOIRE
            </Text>
          </View>

          <Text style={{
            color: colors.text, fontFamily: font.displayBlack,
            fontSize: 42, lineHeight: 40, textTransform: 'uppercase',
          }}>
            Autorise tes{'\n'}<Text style={{ color: '#FC4C02' }}>activités Strava</Text>
          </Text>

          <Text style={{
            marginTop: 18, color: colors.text2, fontFamily: font.body,
            fontSize: 14, lineHeight: 21,
          }}>
            Ton compte Strava est lié, mais Vorcelab ne peut pas lire tes sorties. Sans elles, le moteur ne peut pas calculer ton profil ni adapter ton entraînement.
          </Text>

          <View style={{
            marginTop: 18, padding: 14, borderRadius: radius.md,
            borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.surf2,
          }}>
            <Text style={{ color: colors.text, fontFamily: font.mono, fontSize: 10.5, lineHeight: 17 }}>
              Sur l’écran Strava, coche impérativement la case concernant l’accès à tes activités.
            </Text>
          </View>

          {error ? (
            <Text style={{ marginTop: 14, color: colors.ember2, fontFamily: font.bodyMedium, fontSize: 12, lineHeight: 18 }}>
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Réautoriser Strava"
            disabled={busy}
            onPress={authorize}
            style={({ pressed }) => ({
              minHeight: 58, marginTop: 22, borderRadius: radius.md,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#FC4C02',
              opacity: busy ? .65 : pressed ? .82 : 1,
            })}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontFamily: font.displayBlack, fontSize: 18, letterSpacing: 1.2 }}>RÉAUTORISER STRAVA</Text>}
          </Pressable>

          <Text style={{
            marginTop: 12, textAlign: 'center', color: colors.text3,
            fontFamily: font.mono, fontSize: 8, letterSpacing: .8,
          }}>
            ÉTAPE REQUISE POUR CONTINUER · POWERED BY STRAVA
          </Text>
        </View>
      </View>
    </Modal>
  )
}
