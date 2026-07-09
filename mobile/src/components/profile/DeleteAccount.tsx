import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { LEGAL } from '@/lib/legal'
import { colors, radius, space } from '@/lib/theme'

// Suppression de compte intégrée — exigée par l'App Store (Guideline 5.1.1(v))
// dès lors qu'on permet la création de compte. Appelle l'Edge Function
// `delete-account` (révoque Strava, efface toutes les données puis le compte
// Auth). Le JWT de session est attaché automatiquement par supabase-js.
export default function DeleteAccount() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runDelete() {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} })
      if (error) throw error
      if (!data?.deleted) throw new Error('unexpected-response')
      // Compte effacé côté serveur → on purge la session locale.
      // onAuthStateChange (_layout → Gate) redirige alors vers /login.
      await supabase.auth.signOut()
    } catch {
      setLoading(false)
      setError(`La suppression a échoué. Réessaie, ou écris-nous à ${LEGAL.supportEmail}.`)
    }
  }

  function confirm() {
    if (loading) return
    Alert.alert(
      'Supprimer ton compte ?',
      'Cette action est définitive. Ton profil, tes activités, tes courses, tes journaux de séance et ta connexion Strava seront effacés immédiatement. Aucune récupération possible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Confirmer la suppression',
              'Dernière étape : confirmes-tu la suppression définitive de ton compte Vorcelab et de toutes tes données ?',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer définitivement', style: 'destructive', onPress: runDelete },
              ],
            ),
        },
      ],
    )
  }

  return (
    <View style={{ marginTop: space.md }}>
      <Pressable
        onPress={confirm}
        disabled={loading}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: colors.ember2,
          borderRadius: radius.md,
          paddingVertical: 13,
          alignItems: 'center',
          opacity: pressed || loading ? 0.6 : 1,
        })}
      >
        {loading ? (
          <ActivityIndicator color={colors.ember2} />
        ) : (
          <Text style={{ color: colors.ember2, fontWeight: '700', letterSpacing: 0.5 }}>
            Supprimer mon compte
          </Text>
        )}
      </Pressable>
      {error ? (
        <Text style={{ color: colors.ember2, marginTop: space.sm, fontSize: 12, textAlign: 'center' }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}
