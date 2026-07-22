// Écran d'accueil / connexion — refonte audit 21-22/07 (« la promesse avant le
// compte », écran 2a) : fond crête d'élévation, headline produit, puis TOUS les
// chemins d'accès du web : connexion, création de compte, magic link, reset de
// mot de passe, Strava, Apple (natif). Mêmes règles et libellés que le web
// (LoginPage.tsx) — seul le redirect email pointe sur le site (les liens de
// confirmation/réinitialisation s'ouvrent dans le navigateur).
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Polyline } from 'react-native-svg'
import { Logo } from '@/components/Logo'
import { supabase } from '@/lib/supabase'
import { signInWithStravaMobile } from '@/lib/strava'
import { APPLE_ENABLED, signInWithAppleMobile } from '@/lib/socialAuth'
import { LEGAL, openLegal } from '@/lib/legal'
import { colors, font, radius, space } from '@/lib/theme'

// Les emails (confirmation, reset) renvoient vers le site — le compte est le
// même partout, l'utilisateur revient ensuite se connecter dans l'app.
const EMAIL_REDIRECT = 'https://vorcelab.app/'

type Mode = 'login' | 'signup' | 'reset' | 'magic'

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  function goMode(m: Mode) { setMode(m); setStatus(null) }

  async function onSubmit() {
    if (!email.trim()) return
    if ((mode === 'login' || mode === 'signup') && !password) return
    setLoading(true); setStatus(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      setLoading(false)
      if (error) {
        setStatus({
          msg: error.message === 'Invalid login credentials'
            ? 'Email ou mot de passe incorrect.'
            : 'Erreur : ' + error.message,
          ok: false,
        })
      }
      // Succès → onAuthStateChange bascule vers le Dashboard (cf. _layout).
      return
    }

    if (mode === 'signup') {
      // Mêmes règles que le web.
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        setLoading(false)
        setStatus({ msg: 'Mot de passe : 8 caractères minimum, 1 majuscule et 1 chiffre.', ok: false })
        return
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: EMAIL_REDIRECT },
      })
      setLoading(false)
      if (error) { setStatus({ msg: 'Erreur : ' + error.message, ok: false }); return }
      // Funnel mobile (audit 22/07) : 1re marche « signup_completed ». On a
      // l'id du user à la source ; le hook useTrackEvent no-opperait ici (pas
      // encore de session côté contexte), donc insertion directe.
      if (data.user) {
        supabase.from('user_events').insert({ user_id: data.user.id, event: 'signup_completed', meta: { platform: 'mobile' } }).then(() => undefined)
      }
      if (data.session) setStatus({ msg: 'Compte créé — connexion…', ok: true })
      else if (data.user) setStatus({ msg: 'Compte créé ! Confirme ton email (pense aux spams), puis reviens te connecter.', ok: true })
      return
    }

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: EMAIL_REDIRECT },
      })
      setLoading(false)
      if (error) setStatus({ msg: 'Erreur : ' + error.message, ok: false })
      else setStatus({ msg: 'Lien envoyé — vérifie ta boîte mail.', ok: true })
      return
    }

    // reset
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: EMAIL_REDIRECT })
    setLoading(false)
    if (error) setStatus({ msg: 'Erreur : ' + error.message, ok: false })
    else setStatus({ msg: 'Lien de réinitialisation envoyé.', ok: true })
  }

  async function onStrava() {
    setLoading(true); setStatus(null)
    const res = await signInWithStravaMobile()
    setLoading(false)
    if (res === 'error') setStatus({ msg: 'La connexion avec Strava a échoué. Réessaie.', ok: false })
    // 'connected' → onAuthStateChange bascule ; 'denied' → l'utilisateur a annulé.
  }

  async function onApple() {
    setLoading(true); setStatus(null)
    const res = await signInWithAppleMobile()
    setLoading(false)
    if (res === 'error') setStatus({ msg: 'La connexion avec Apple a échoué. Réessaie.', ok: false })
  }

  const providerVerb = mode === 'signup' ? "S'inscrire avec" : 'Continuer avec'
  const submitLabel =
    mode === 'login' ? 'CONNEXION'
    : mode === 'signup' ? 'CRÉER MON COMPTE'
    : mode === 'magic' ? 'RECEVOIR UN LIEN DE CONNEXION'
    : 'RÉINITIALISER LE MOT DE PASSE'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Fond : profil d'élévation — la ligne de crête du logo, en grand. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 }} pointerEvents="none">
        <Svg viewBox="0 0 390 260" preserveAspectRatio="none" width="100%" height="100%">
          <Path d="M0,208 L60,165 L110,187 L170,104 L230,156 L290,121 L390,173 L390,260 L0,260 Z" fill={colors.ember} opacity={0.07} />
          <Path d="M0,234 L80,199 L140,217 L200,147 L260,191 L320,165 L390,208 L390,260 L0,260 Z" fill={colors.ember} opacity={0.12} />
          <Polyline points="0,208 60,165 110,187 170,104 230,156 290,121 390,173" fill="none" stroke={colors.ember} strokeWidth={2} opacity={0.5} />
          <Circle cx={170} cy={104} r={4} fill={colors.ember2} />
        </Svg>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space.xl, paddingVertical: space.xl }} keyboardShouldPersistTaps="handled">
          {/* Logo + marque */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl }}>
            <Logo size={34} />
            <Text style={{ color: colors.text, fontSize: 22, fontFamily: font.display, letterSpacing: 2 }}>VORCELAB</Text>
          </View>

          {/* La promesse AVANT le compte (audit : un login froid convertit mal). */}
          <View style={{ marginBottom: space.xl }}>
            <Text style={{ fontFamily: font.monoSemiBold, fontSize: 10.5, letterSpacing: 3, color: colors.text2, marginBottom: 12 }}>LE LABORATOIRE DU COUREUR</Text>
            <Text style={{ fontFamily: font.displayBlack, fontSize: 44, lineHeight: 42, color: colors.text, textTransform: 'uppercase' }}>
              Ton temps de course.{'\n'}<Text style={{ color: colors.ember }}>Prédit.</Text>
            </Text>
            <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 21, color: colors.text2, maxWidth: 300 }}>
              Projection d'arrivée avec intervalle de confiance, stratégie d'allure pente par pente, coach adaptatif jusqu'au jour J.
            </Text>
          </View>

          {/* Formulaire selon le mode */}
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
          {(mode === 'login' || mode === 'signup') && (
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'signup' ? 'Mot de passe (8+ car., 1 majuscule, 1 chiffre)' : 'Mot de passe'}
              placeholderTextColor={colors.text3}
              secureTextEntry
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onSubmitEditing={onSubmit}
              style={[inputStyle, { marginTop: space.md }]}
            />
          )}

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            style={({ pressed }) => ({
              marginTop: space.lg,
              backgroundColor: colors.ember,
              borderRadius: radius.md,
              minHeight: 50,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || loading ? 0.7 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={{ color: colors.bg, fontFamily: font.display, fontSize: 16, letterSpacing: 1.5 }}>{submitLabel}</Text>
            )}
          </Pressable>

          {status && (
            <Text style={{ color: status.ok ? colors.growth : colors.ember2, marginTop: space.md, textAlign: 'center', fontSize: 13, lineHeight: 19 }}>
              {status.msg}
            </Text>
          )}

          {/* Bascule des modes */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 18, marginTop: space.lg }}>
            {mode !== 'signup' && (
              <Pressable onPress={() => goMode('signup')} hitSlop={10}><Text style={modeLink}>Créer un compte</Text></Pressable>
            )}
            {mode !== 'login' && (
              <Pressable onPress={() => goMode('login')} hitSlop={10}><Text style={modeLink}>Connexion</Text></Pressable>
            )}
            {mode !== 'magic' && (
              <Pressable onPress={() => goMode('magic')} hitSlop={10}><Text style={modeLinkDim}>Lien magique</Text></Pressable>
            )}
            {mode !== 'reset' && (
              <Pressable onPress={() => goMode('reset')} hitSlop={10}><Text style={modeLinkDim}>Mot de passe oublié ?</Text></Pressable>
            )}
          </View>

          {/* Séparateur */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: space.lg }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            <Text style={{ color: colors.text3, fontSize: 10, fontFamily: font.mono, letterSpacing: 1 }}>OU</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          </View>

          {/* Strava */}
          <Pressable
            onPress={onStrava}
            disabled={loading}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              backgroundColor: '#FC4C02', borderRadius: radius.md, minHeight: 50,
              opacity: pressed || loading ? 0.7 : 1,
            })}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><Path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></Svg>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{providerVerb} Strava</Text>
          </Pressable>

          {APPLE_ENABLED && (
            <Pressable
              onPress={onApple}
              disabled={loading}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: '#000', borderRadius: radius.md, minHeight: 50, marginTop: space.md,
                opacity: pressed || loading ? 0.7 : 1,
              })}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="#fff"><Path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09z M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></Svg>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{providerVerb} Apple</Text>
            </Pressable>
          )}

          {/* Mention légale — en continuant, tu acceptes les CGU & la confidentialité. */}
          <View style={{ marginTop: space.xl, alignItems: 'center' }}>
            <Text style={{ color: colors.text3, fontSize: 11, textAlign: 'center', lineHeight: 17 }}>
              En continuant, tu acceptes nos{' '}
              <Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL.terms)}>
                CGU
              </Text>{' '}
              et notre{' '}
              <Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL.privacy)}>
                politique de confidentialité
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
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

const modeLink = { color: colors.text2, fontSize: 13, fontWeight: '600' } as const
const modeLinkDim = { color: colors.text3, fontSize: 13 } as const
