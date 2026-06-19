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
import { Logo } from '@/components/Logo'
import { supabase } from '@/lib/supabase'
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
