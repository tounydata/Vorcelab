import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { Logo } from '@/components/Logo'
import { supabase } from '@/lib/supabase'
import { signInWithStravaMobile } from '@/lib/strava'
import { APPLE_ENABLED, signInWithSupabaseOAuthMobile } from '@/lib/socialAuth'
import { colors, radius, space } from '@/lib/theme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit() {
    if (!email.trim() || !password) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : 'Erreur : ' + error.message,
      )
    }
    // Succès → onAuthStateChange bascule vers le Dashboard (cf. _layout).
  }

  async function onStrava() {
    setLoading(true); setError(null)
    const res = await signInWithStravaMobile()
    setLoading(false)
    if (res === 'error') setError('La connexion avec Strava a échoué. Réessaie.')
    // 'connected' → onAuthStateChange bascule ; 'denied' → l'utilisateur a annulé.
  }

  async function onApple() {
    setLoading(true); setError(null)
    const res = await signInWithSupabaseOAuthMobile('apple')
    setLoading(false)
    if (res === 'error') setError('La connexion avec Apple a échoué. Réessaie.')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.xl }}
      >
        {/* Logo + marque */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xxl }}>
          <Logo size={44} />
          <View>
            <Text
              style={{
                color: colors.text,
                fontSize: 26,
                fontWeight: '800',
                letterSpacing: 1,
              }}
            >
              VORCELAB
            </Text>
            <Text style={{ color: colors.text3, fontSize: 12, letterSpacing: 0.5 }}>
              Le laboratoire du coureur
            </Text>
          </View>
        </View>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="ton@email.com"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={inputStyle}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Mot de passe"
          placeholderTextColor={colors.text3}
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={onSubmit}
          style={[inputStyle, { marginTop: space.md }]}
        />

        <Pressable
          onPress={onSubmit}
          disabled={loading}
          style={({ pressed }) => ({
            marginTop: space.lg,
            backgroundColor: colors.ember,
            borderRadius: radius.md,
            paddingVertical: 15,
            alignItems: 'center',
            opacity: pressed || loading ? 0.7 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={{ color: colors.bg, fontWeight: '800', letterSpacing: 1 }}>CONNEXION</Text>
          )}
        </Pressable>

        {error && (
          <Text style={{ color: colors.ember2, marginTop: space.md, textAlign: 'center', fontSize: 13 }}>
            {error}
          </Text>
        )}

        {/* Séparateur */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: space.lg }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          <Text style={{ color: colors.text3, fontSize: 10, letterSpacing: 1 }}>OU</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        </View>

        {/* Strava */}
        <Pressable
          onPress={onStrava}
          disabled={loading}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
            backgroundColor: '#FC4C02', borderRadius: radius.md, paddingVertical: 14,
            opacity: pressed || loading ? 0.7 : 1,
          })}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><Path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></Svg>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Continuer avec Strava</Text>
        </Pressable>

        {APPLE_ENABLED && (
          <Pressable
            onPress={onApple}
            disabled={loading}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              backgroundColor: '#000', borderRadius: radius.md, paddingVertical: 14, marginTop: space.md,
              opacity: pressed || loading ? 0.7 : 1,
            })}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="#fff"><Path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09z M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></Svg>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Continuer avec Apple</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const inputStyle = {
  backgroundColor: colors.surf2,
  borderWidth: 1,
  borderColor: colors.line2,
  borderRadius: radius.md,
  paddingHorizontal: space.lg,
  paddingVertical: 14,
  color: colors.text,
  fontSize: 16,
} as const
