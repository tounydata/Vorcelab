import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { signInWithStravaMobile } from '@/lib/strava'
import {
  classifyStravaLink, shouldPromptStravaLink,
  type StravaLinkState, type StravaLinkStatus,
} from '@/lib/stravaLinkPrompt'
import { getAssistedSession, subscribeAssistedSession } from '@/lib/assistedSession'
import { SUPA_URL } from '@/lib/supabase'
import { colors, font, radius, space } from '@/lib/theme'

// Invite Strava — NON BLOQUANTE (décision produit du propriétaire), portage de
// `src/components/StravaLinkPrompt.tsx`.
//
// Elle se déclenche à l'ouverture de l'app quand le moteur ne peut rien lire, dans les
// DEUX cas : aucun jeton, ou jeton sans le scope activités. Le second est le plus
// pernicieux — l'athlète a « connecté Strava », l'app le confirme, et pourtant rien
// n'arrive.
//
// Refermable : l'athlète continue, et l'invite revient au prochain lancement tant que le
// lien n'est pas bon. On relance, on ne verrouille pas.
//
// Exception assistance : pendant une session assistée, l'app affiche le compte d'un AUTRE
// utilisateur mais l'OAuth Strava s'appuierait sur le navigateur de l'admin. Proposer de
// connecter là relierait le mauvais athlète, le serveur refuserait, et l'invite
// reviendrait — la boucle constatée en production. On y affiche la marche à suivre, sans
// bouton d'autorisation.

/**
 * Le rejet vaut pour le LANCEMENT en cours (équivalent de `sessionStorage` côté web) :
 * un module natif vit aussi longtemps que le process de l'app.
 */
let dismissedThisLaunch = false

export default function StravaLinkPrompt({
  accessToken, previewMode = false, onPreviewClose,
}: {
  accessToken?: string
  /** Labo admin : affiche l'invite telle quelle, sans appel réseau ni OAuth. */
  previewMode?: boolean
  onPreviewClose?: () => void
}) {
  const [state, setState] = useState<StravaLinkState | null>(previewMode ? 'missing_scope' : null)
  const [dismissed, setDismissed] = useState(() => !previewMode && dismissedThisLaunch)
  const [assisted, setAssisted] = useState(() => getAssistedSession() !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeAssistedSession((meta) => setAssisted(meta !== null)), [])

  const getState = useCallback(async (): Promise<StravaLinkState | null> => {
    if (previewMode || !accessToken) return null
    try {
      const response = await fetch(`${SUPA_URL}/functions/v1/strava-status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error('Strava status unavailable')
      return classifyStravaLink((await response.json()) as StravaLinkStatus)
    } catch {
      // Une panne de statut ne doit jamais faire apparaître une invite injustifiée.
      return null
    }
  }, [accessToken, previewMode])

  useEffect(() => {
    if (previewMode) return
    let active = true
    getState().then((next) => { if (active && next) setState(next) })
    return () => { active = false }
  }, [getState, previewMode])

  // Retour de l'app au premier plan : l'athlète revient peut-être d'avoir autorisé.
  useEffect(() => {
    if (previewMode) return
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') getState().then((s) => { if (s) setState(s) })
    })
    return () => sub.remove()
  }, [getState, previewMode])

  const supportMode = assisted && !previewMode

  async function connect() {
    if (previewMode) {
      setError('Simulation réussie : en production, ce bouton ouvre l’autorisation Strava forcée.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await signInWithStravaMobile({ forceApproval: true })
      if (result === 'connected') {
        const next = await getState()
        if (next) setState(next)
      } else if (result === 'missing_scope') {
        setError('La case d’accès aux activités n’a pas été cochée. Réessaie et autorise-la pour continuer.')
      } else if (result === 'denied') {
        setError('Autorisation annulée sur Strava.')
      } else {
        setError('Connexion Strava impossible. Vérifie ta connexion puis réessaie.')
      }
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    if (previewMode) { onPreviewClose?.(); return }
    dismissedThisLaunch = true
    setDismissed(true)
  }

  if (state === null || !shouldPromptStravaLink(state)) return null
  if (dismissed) return null

  const missingScope = state === 'missing_scope'
  const badge = supportMode
    ? 'AUTORISATION NON DÉLÉGABLE'
    : missingScope ? 'ACCÈS AUX ACTIVITÉS MANQUANT' : 'STRAVA NON CONNECTÉ'

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable
        onPress={dismiss}
        style={{ flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(5,5,7,0.8)' }}
      >
        <Pressable onPress={() => {}} style={{ maxHeight: '90%' }}>
          <View style={{
            overflow: 'hidden', borderRadius: radius.xl,
            borderWidth: 1, borderColor: 'rgba(252,76,2,0.45)',
            backgroundColor: colors.surf,
          }}>
            <ScrollView contentContainerStyle={{ padding: space.xl }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <View style={{
                  flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 999, borderWidth: 1, borderColor: 'rgba(252,76,2,0.55)',
                  backgroundColor: 'rgba(252,76,2,0.12)',
                }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FC4C02' }} />
                  <Text style={{ color: '#ff6b2c', fontFamily: font.monoSemiBold, fontSize: 9, letterSpacing: 1.2 }}>
                    {badge}
                  </Text>
                </View>
                <Pressable
                  onPress={dismiss}
                  accessibilityRole="button"
                  accessibilityLabel="Fermer"
                  hitSlop={10}
                  style={{
                    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: colors.line2,
                  }}
                >
                  <Text style={{ color: colors.text2, fontFamily: font.mono, fontSize: 12 }}>✕</Text>
                </Pressable>
              </View>

              <Text style={{
                marginTop: 18, color: colors.text, fontFamily: font.displayBlack,
                fontSize: 36, lineHeight: 35, textTransform: 'uppercase',
              }}>
                {supportMode ? (
                  <>Envoie le lien{'\n'}<Text style={{ color: '#FC4C02' }}>à l’athlète</Text></>
                ) : missingScope ? (
                  <>Autorise tes{'\n'}<Text style={{ color: '#FC4C02' }}>activités Strava</Text></>
                ) : (
                  <>Connecte ton{'\n'}<Text style={{ color: '#FC4C02' }}>compte Strava</Text></>
                )}
              </Text>

              <Text style={{
                marginTop: 16, color: colors.text2, fontFamily: font.body, fontSize: 13.5, lineHeight: 20,
              }}>
                {supportMode
                  ? 'Cette autorisation ne peut pas être donnée depuis ici : Strava s’appuie sur le compte connecté sur CET appareil — le tien — et non sur le compte Vorcelab que tu assistes. Seul l’athlète peut valider, sur son appareil.'
                  : missingScope
                  ? 'Ton compte Strava est bien lié, mais Vorcelab n’a pas le droit de lire tes sorties. C’est pour ça que ton historique reste vide : sans tes activités, le moteur ne peut ni calculer ton profil, ni adapter ton entraînement, ni projeter tes courses.'
                  : 'Vorcelab fonctionne à partir de tes sorties Strava. Tant que ton compte n’est pas relié, l’app reste vide : pas de profil, pas de plan adapté, pas de projection de course.'}
              </Text>

              <View style={{
                marginTop: 16, padding: 13, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.surf2,
              }}>
                <Text style={{ color: colors.text, fontFamily: font.mono, fontSize: 10.5, lineHeight: 16 }}>
                  {supportMode
                    ? 'Onglet Assistance → « Générer le lien Strava », puis envoie-le à l’athlète. Les permissions y sont déjà cochées ; le statut se met à jour tout seul ici dès qu’il a validé.'
                    : 'Sur l’écran Strava, coche impérativement la case concernant l’accès à tes activités. Sans elle, le compte est relié mais Vorcelab ne voit aucune sortie.'}
                </Text>
              </View>

              {error ? (
                <Text style={{ marginTop: 14, color: colors.ember2, fontFamily: font.bodyMedium, fontSize: 12, lineHeight: 18 }}>
                  {error}
                </Text>
              ) : null}

              {/* En assistance, connecter depuis ici est structurellement voué à l'échec :
                  aucun bouton d'autorisation n'est rendu. */}
              {!supportMode ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={missingScope ? 'Autoriser mes activités' : 'Connecter mon Strava'}
                  disabled={busy}
                  onPress={() => void connect()}
                  style={({ pressed }) => ({
                    minHeight: 56, marginTop: 20, borderRadius: radius.md,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#FC4C02',
                    opacity: busy ? 0.65 : pressed ? 0.82 : 1,
                  })}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : (
                      <Text style={{ color: '#fff', fontFamily: font.displayBlack, fontSize: 17, letterSpacing: 1.1 }}>
                        {missingScope ? 'AUTORISER MES ACTIVITÉS' : 'CONNECTER MON STRAVA'}
                      </Text>
                    )}
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={dismiss}
                style={{
                  minHeight: 42, marginTop: 10, borderRadius: radius.md,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: colors.line2,
                }}
              >
                <Text style={{ color: colors.text2, fontFamily: font.monoSemiBold, fontSize: 10, letterSpacing: 1 }}>
                  {supportMode ? 'CONTINUER L’ASSISTANCE' : 'PLUS TARD'}
                </Text>
              </Pressable>

              <Text style={{
                marginTop: 12, textAlign: 'center', color: colors.text3,
                fontFamily: font.mono, fontSize: 8, letterSpacing: 0.8,
              }}>
                {previewMode
                  ? 'APERÇU ADMIN · AUCUNE ACTION RÉELLE'
                  : supportMode
                  ? 'L’ATHLÈTE VALIDE SUR SON APPAREIL · POWERED BY STRAVA'
                  : 'TU PEUX CONTINUER SANS · POWERED BY STRAVA'}
              </Text>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
