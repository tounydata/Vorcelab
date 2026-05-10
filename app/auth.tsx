import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Redirect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../stores/useAuthStore'
import { colors } from '../lib/colors'

type Tab = 'login' | 'signup'

export default function AuthScreen() {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const { session, signIn, signUp, loading, error, clearError } = useAuthStore()

  if (session) return <Redirect href="/(tabs)" />

  function handleTabChange(t: Tab) {
    setTab(t)
    clearError()
  }

  async function handleSubmit() {
    if (tab === 'login') {
      await signIn(email, password)
    } else {
      await signUp(email, password, name)
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <View style={s.logo}>
              <Text style={s.logoText}>V</Text>
            </View>
            <View>
              <Text style={s.appName}>VORCELAB</Text>
              <Text style={s.subtitle}>
                {tab === 'login' ? 'Connexion' : 'Inscription'}
              </Text>
            </View>
          </View>

          <View style={s.tabRow}>
            {(['login', 'signup'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => handleTabChange(t)}
                style={[s.tabBtn, tab === t && s.tabBtnActive]}
              >
                <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
                  {t === 'login' ? 'Connexion' : 'Créer un compte'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'signup' && (
            <TextInput
              style={s.input}
              placeholder="Prénom"
              placeholderTextColor={colors.text3}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}
          <TextInput
            style={s.input}
            placeholder="ton@email.com"
            placeholderTextColor={colors.text3}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor={colors.text3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.submitBtn, loading && s.submitBtnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={s.submitBtnText}>
              {loading
                ? '…'
                : tab === 'login'
                ? 'Se connecter'
                : 'Créer mon compte'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 36 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 26, fontWeight: '800', color: '#000' },
  appName: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: 3 },
  subtitle: {
    fontSize: 10,
    color: colors.text3,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg4,
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
  },
  tabBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: colors.bg2 },
  tabBtnText: {
    fontSize: 11,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tabBtnTextActive: { color: colors.text },
  input: {
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    fontSize: 15,
    marginBottom: 10,
  },
  error: {
    color: colors.red,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: colors.cyan,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
})
