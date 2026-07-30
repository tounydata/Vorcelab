import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Share, Text, View } from 'react-native'
import { colors, font, radius } from '@/lib/theme'
import { Card, CLabel, HButton, PrimaryButton } from '@/components/coach/ui'
import {
  endSupportSession, getActiveSupportSession, getSupportContext, listSupportHistory,
  runSupportAction, startSupportSession, updateSupportProfile,
  type ActiveSupportSession, type AdminSupportAction, type AdminUser,
  type StravaSupportStatus, type SupportHistorySession,
} from '@/lib/adminApi'
import { startAssistedSession } from '@/lib/assistedSession'
import {
  CheckRow, Collapsible, Field, Hero, Hint, LogLine, Message, SelectField,
  fmtDateTime, minutesLeft, useAsync,
} from './adminUi'

// Onglet Assistance — portage de `src/components/admin/AdminSupportTab.tsx`. Mêmes RPC,
// mêmes 9 actions serveur, mêmes validations, même journal.
//
// Deux points de fond conservés du web :
//   • le CONTEXTE est rafraîchi périodiquement : le statut Strava change sur l'appareil de
//     l'athlète après son retour d'OAuth, l'admin doit le voir sans manipuler sa session ;
//   • la déconnexion Strava exige la confirmation explicite `DISCONNECT_STRAVA` du
//     contrat serveur — sans elle le serveur refuse (400 `confirmation_required`).
//
// Divergence assumée : le web ouvre une FENÊTRE isolée pour voir l'app « comme »
// l'utilisateur ; une app native n'a pas de seconde fenêtre, donc la session courante est
// basculée puis restaurée (cf. `assistedSession.ts`), avec bannière non masquable.

const CONSENT_MODES = [
  ['verbal', 'Verbal'],
  ['written', 'Écrit'],
  ['verbal_written', 'Verbal + écrit'],
  ['in_person', 'En présence physique'],
] as const

const ACTION_MESSAGES: Record<AdminSupportAction, string> = {
  strava_status: 'Statut Strava relu.',
  strava_refresh_token: 'Jeton Strava rafraîchi sans être exposé.',
  strava_sync_incremental: 'Synchronisation récente terminée.',
  strava_sync_full: 'Synchronisation complète terminée.',
  create_strava_reauth_link: 'Lien Strava prêt.',
  strava_disconnect: 'Compte Strava déconnecté.',
  start_vorcelab_impersonation: 'Session assistée prête.',
  send_password_reset: 'Email de réinitialisation envoyé.',
  send_magic_link: 'Lien de connexion envoyé.',
}

interface ProfileForm {
  name: string
  birthdate: string
  sex: string
  weight: string
  height: string
  vo2max: string
  fc_max: string
  lactate_threshold: string
  lactate_pace: string
  nutrition_level: string
  nutrition_no_caffeine: boolean
  coach_days_per_week: string
  coach_motivation: string
  renfo_weekly_target: string
}

const EMPTY_PROFILE_FORM: ProfileForm = {
  name: '',
  birthdate: '',
  sex: '',
  weight: '',
  height: '',
  vo2max: '',
  fc_max: '',
  lactate_threshold: '',
  lactate_pace: '',
  nutrition_level: 'standard',
  nutrition_no_caffeine: false,
  coach_days_per_week: '5',
  coach_motivation: 'mix',
  renfo_weekly_target: '3',
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function profileFormFrom(profile: Record<string, unknown>): ProfileForm {
  return {
    name: displayValue(profile.name),
    birthdate: displayValue(profile.birthdate),
    sex: displayValue(profile.sex),
    weight: displayValue(profile.weight),
    height: displayValue(profile.height),
    vo2max: displayValue(profile.vo2max),
    fc_max: displayValue(profile.fc_max),
    lactate_threshold: displayValue(profile.lactate_threshold),
    lactate_pace: displayValue(profile.lactate_pace),
    nutrition_level: displayValue(profile.nutrition_level) || 'standard',
    nutrition_no_caffeine: profile.nutrition_no_caffeine === true,
    coach_days_per_week: displayValue(profile.coach_days_per_week) || '5',
    coach_motivation: displayValue(profile.coach_motivation) || 'mix',
    renfo_weekly_target: displayValue(profile.renfo_weekly_target) || '3',
  }
}

function nullableNumber(value: string, label: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error(`${label} doit être un nombre valide.`)
  return parsed
}

// ── Historique admin des assistances ─────────────────────────────────────────────

function SupportHistorySection({ sessions, loading, error }: {
  sessions: SupportHistorySession[]
  loading: boolean
  error: boolean
}) {
  return (
    <Card>
      <CLabel>HISTORIQUE ADMIN DES ASSISTANCES</CLabel>
      <Hint>
        Une ligne verte confirme une écriture effectuée par la base ou une opération validée
        par le serveur. Une ligne rouge confirme un échec. Les simples consultations et
        changements de page ne sont pas journalisés.
      </Hint>

      {loading ? (
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.text3 }}>Chargement…</Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ fontFamily: font.mono, fontSize: 11, color: colors.ember2 }}>
          Impossible de charger l’historique d’assistance.
        </Text>
      ) : null}
      {!loading && !error && sessions.length === 0 ? (
        <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
          Aucune session enregistrée.
        </Text>
      ) : null}

      <View style={{ gap: 8 }}>
        {sessions.map((session, index) => {
          const successCount = session.actions.filter((a) => a.outcome === 'success').length
          const errorCount = session.actions.filter((a) => a.outcome === 'error').length
          const stateLabel = session.state === 'active'
            ? 'ACTIVE'
            : session.state === 'expired' ? 'EXPIRÉE' : 'TERMINÉE'

          return (
            <Collapsible
              key={session.id}
              defaultOpen={index === 0 && session.state === 'active'}
              header={
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={{
                      fontFamily: font.monoSemiBold, fontSize: 9,
                      color: session.state === 'active' ? colors.growth : colors.text3,
                    }}>
                      {stateLabel}
                    </Text>
                    <Text style={{ fontFamily: font.monoMedium, fontSize: 10.5, color: colors.text, flexShrink: 1 }} numberOfLines={1}>
                      {session.target_name || session.target_email || session.target_user_id}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }}>
                      {fmtDateTime(session.started_at)}
                    </Text>
                    <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.growth }}>
                      ✓ {successCount}
                    </Text>
                    {errorCount > 0 ? (
                      <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.ember2 }}>
                        ✕ {errorCount}
                      </Text>
                    ) : null}
                  </View>
                </View>
              }
            >
              <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: colors.text3, paddingVertical: 6 }}>
                {session.reason}
              </Text>
              {session.actions.map((log) => (
                <LogLine
                  key={log.id}
                  at={log.created_at}
                  ok={log.outcome === 'success'}
                  action={log.action}
                  summary={log.summary}
                />
              ))}
              {session.actions.length === 0 ? (
                <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: colors.text3 }}>
                  Aucune action enregistrée.
                </Text>
              ) : null}
            </Collapsible>
          )
        })}
      </View>
    </Card>
  )
}

function StravaStatusLines({ strava }: { strava: StravaSupportStatus }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          width: 9, height: 9, borderRadius: 5,
          backgroundColor: strava.connected ? colors.growth : colors.ember2,
        }} />
        <Text style={{ fontFamily: font.bodySemiBold, fontSize: 12, color: colors.text }}>
          {strava.connected ? 'Compte connecté' : 'Compte non connecté'}
        </Text>
      </View>
      {strava.connected ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.text2 }}>
            {[strava.athlete_firstname, strava.athlete_lastname].filter(Boolean).join(' ') || 'Athlète Strava'}
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.text2 }}>
            Accès activités :{' '}
            <Text style={{
              fontFamily: font.bodySemiBold,
              color: strava.activity_access_granted ? colors.growth : colors.ember2,
            }}>
              {strava.activity_access_granted ? 'complet' : 'à revalider'}
            </Text>
          </Text>
          <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.text2 }}>
            Jeton : {strava.token_state} · dernière sync {fmtDateTime(strava.last_sync_at)}
          </Text>
          <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 2 }}>
            Scopes reçus : {strava.scope || 'aucun'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

// ── Onglet ───────────────────────────────────────────────────────────────────────

export default function AdminSupportTab({ users }: { users: AdminUser[] }) {
  const athletes = useMemo(() => users.filter((u) => !u.is_admin), [users])
  const [targetUserId, setTargetUserId] = useState('')
  const [reason, setReason] = useState('Assistance demandée par l’utilisateur')
  const [consentMode, setConsentMode] = useState('verbal')
  const [userPresent, setUserPresent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [oauthUrl, setOauthUrl] = useState('')
  const [profileForm, setProfileForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM)
  const loadedProfileSession = useRef('')

  // Session active : le serveur en est la source de vérité (relue toutes les 15 s, comme
  // le web), mais ouvrir ou fermer une session doit se voir immédiatement.
  //
  // `override` est donc OPTIMISTE et ÉPHÉMÈRE : il mémorise l'état serveur observé au
  // moment de la décision locale (`seen`) et cesse de s'appliquer dès que le serveur
  // répond autre chose. Une session expirée côté serveur ne peut ainsi pas rester
  // affichée comme active.
  const initial = useAsync(() => getActiveSupportSession(), [], { pollMs: 15_000 })
  const serverSession = initial.data ?? null
  const serverId = serverSession?.id ?? null
  const [override, setOverride] = useState<
    { seen: string | null; value: ActiveSupportSession | null } | null
  >(null)
  const activeSession = override && override.seen === serverId ? override.value : serverSession
  const activeId = activeSession?.id ?? ''

  const setOptimisticSession = (value: ActiveSupportSession | null) =>
    setOverride({ seen: serverId, value })

  const history = useAsync(
    () => listSupportHistory(25),
    [activeId || 'none'],
    { pollMs: activeId ? 4_000 : 15_000 },
  )

  // Contexte de la cible : identité, profil, état Strava, volumétrie. `useAsync` est
  // clé-conscient : dès que `activeId` change, `data` redevient null — le dossier d'une
  // session précédente ne peut donc jamais s'afficher sous une autre.
  const context = useAsync(
    () => (activeId ? getSupportContext(activeId) : Promise.resolve(null)),
    [activeId],
    { pollMs: activeId ? 4_000 : 0 },
  )
  const supportContext = context.data

  // Pré-remplit le formulaire une seule fois par session, pour ne pas écraser une saisie
  // en cours à chaque rafraîchissement du contexte.
  useEffect(() => {
    if (!activeId || !supportContext?.profile) return
    if (loadedProfileSession.current === activeId) return
    loadedProfileSession.current = activeId
    setProfileForm(profileFormFrom(supportContext.profile))
  }, [activeId, supportContext?.profile])

  async function guarded(run: () => Promise<string>) {
    setBusy(true); setMessage('')
    try { setMessage(await run()) }
    catch (err) { setMessage(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`) }
    finally { setBusy(false) }
  }

  function doAction(action: AdminSupportAction, confirmation?: string) {
    void guarded(async () => {
      if (!activeId) throw new Error('Aucune session d’assistance active.')
      const result = await runSupportAction(activeId, action, confirmation)
      if (action === 'create_strava_reauth_link' && typeof result.oauth_url === 'string') {
        setOauthUrl(result.oauth_url)
      }
      context.reload()
      history.reload()
      return ACTION_MESSAGES[action]
    })
  }

  function saveProfile(patch?: Record<string, unknown>) {
    void guarded(async () => {
      if (!activeId) throw new Error('Aucune session d’assistance active.')
      const body = patch ?? {
        name: profileForm.name.trim() || null,
        birthdate: profileForm.birthdate || null,
        sex: profileForm.sex || null,
        weight: nullableNumber(profileForm.weight, 'Le poids'),
        height: nullableNumber(profileForm.height, 'La taille'),
        vo2max: nullableNumber(profileForm.vo2max, 'La VO₂max'),
        fc_max: nullableNumber(profileForm.fc_max, 'La FC max'),
        lactate_threshold: nullableNumber(profileForm.lactate_threshold, 'Le seuil lactique'),
        lactate_pace: profileForm.lactate_pace.trim() || null,
        nutrition_level: profileForm.nutrition_level || null,
        nutrition_no_caffeine: profileForm.nutrition_no_caffeine,
        coach_days_per_week: nullableNumber(profileForm.coach_days_per_week, 'Le nombre de jours'),
        coach_motivation: profileForm.coach_motivation,
        renfo_weekly_target: nullableNumber(profileForm.renfo_weekly_target, 'L’objectif renfo'),
      }
      const saved = await updateSupportProfile(activeId, body)
      setProfileForm(profileFormFrom(saved))
      context.reload()
      history.reload()
      return 'Profil et réglages enregistrés.'
    })
  }

  function setField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setProfileForm((current) => ({ ...current, [key]: value }))
  }

  async function shareLink() {
    if (!oauthUrl) return
    try {
      await Share.share({
        message:
          'Bonjour, voici le lien pour autoriser Vorcelab à lire tes activités Strava. ' +
          `Ouvre-le sur ton téléphone et valide le bouton « Autoriser » :\n\n${oauthUrl}`,
      })
    } catch {
      setMessage('Partage indisponible — le lien reste affiché ci-dessus.')
    }
  }

  const targetLabel = activeSession?.target_name ?? activeSession?.target_email
    ?? activeSession?.target_user_id ?? 'utilisateur'
  const strava = supportContext?.strava
  const syntheticEmail = supportContext?.identity.email.endsWith('@strava.users.vorcelab.app') ?? false
  const left = minutesLeft(activeSession?.expires_at)

  // ── Aucune session : ouverture ────────────────────────────────────────────────
  if (!activeSession) {
    return (
      <View style={{ gap: 14 }}>
        <Hero title="Assistance administrateur">
          Tu agis depuis ton portail pendant que l’utilisateur est présent. Vorcelab
          enregistre ta déclaration de consentement sans pouvoir la vérifier. Aucun contrôle
          de son appareil, aucun mot de passe et aucun jeton affiché.
        </Hero>

        <Card>
          <CLabel>OUVRIR UNE SESSION LIMITÉE À 45 MINUTES</CLabel>
          <SelectField
            label="Utilisateur assisté"
            value={targetUserId}
            onChange={setTargetUserId}
            options={athletes.map((u) => [u.id, u.name ?? u.email] as const)}
          />
          <SelectField
            label="Consentement déclaré par l’admin"
            value={consentMode}
            onChange={setConsentMode}
            options={CONSENT_MODES}
          />
          <Field
            label="Motif journalisé"
            value={reason}
            onChange={setReason}
            maxLength={240}
            placeholder="Au moins 8 caractères"
          />
          <CheckRow
            checked={userPresent}
            onChange={setUserPresent}
            label="L’utilisateur est présent pendant l’assistance (à distance ou sur place)"
          />
          <View style={{ marginTop: 8 }}>
            <PrimaryButton
              label={busy ? 'OUVERTURE…' : 'OUVRIR L’ASSISTANCE'}
              disabled={busy}
              onPress={() => void guarded(async () => {
                if (!targetUserId) throw new Error('Choisis un utilisateur.')
                if (reason.trim().length < 8) throw new Error('Le motif doit contenir au moins 8 caractères.')
                if (!userPresent) throw new Error('L’utilisateur doit être présent pendant l’assistance.')

                const session = await startSupportSession({
                  targetUserId, reason, consentMode, userPresent: true,
                })
                loadedProfileSession.current = ''
                setOauthUrl('')
                setOptimisticSession(session)
                history.reload()
                return 'Session d’assistance ouverte pour 45 minutes.'
              })}
            />
          </View>
          {initial.error ? (
            <Text accessibilityRole="alert" style={{ marginTop: 10, fontFamily: font.mono, fontSize: 11, color: colors.ember2 }}>
              Le backend du mode assistance n’est pas encore disponible.
            </Text>
          ) : null}
          {message ? <View style={{ marginTop: 10 }}><Message text={message} /></View> : null}
        </Card>

        <SupportHistorySection
          sessions={history.data ?? []}
          loading={history.loading}
          error={Boolean(history.error)}
        />
      </View>
    )
  }

  // ── Session active ────────────────────────────────────────────────────────────
  return (
    <View style={{ gap: 14 }}>
      <Card style={{ borderColor: colors.ember, borderWidth: 2, backgroundColor: 'rgba(214,128,62,0.1)' }}>
        <Text style={{ fontFamily: font.monoSemiBold, fontSize: 10, letterSpacing: 0.9, color: colors.ember }}>
          ● ASSISTANCE ACTIVE · UTILISATEUR PRÉSENT
        </Text>
        <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.text, marginTop: 5 }}>
          {targetLabel}
        </Text>
        <Text style={{ fontFamily: font.body, fontSize: 10.5, lineHeight: 15, color: colors.text2, marginTop: 3 }}>
          Fin automatique {fmtDateTime(activeSession.expires_at)}
          {left != null ? ` (${left > 0 ? `dans ${left} min` : 'expirée'})` : ''} · {activeSession.reason}
        </Text>
        <View style={{ marginTop: 10 }}>
          <HButton
            label="TERMINER L’ASSISTANCE"
            disabled={busy}
            onPress={() => void guarded(async () => {
              await endSupportSession(activeSession.id)
              loadedProfileSession.current = ''
              setOauthUrl('')
              // Passer la session à null masque aussi le contexte (dérivé de son id).
              setOptimisticSession(null)
              history.reload()
              return 'Session d’assistance terminée.'
            })}
            style={{ borderColor: colors.ember }}
            textStyle={{ color: colors.ember }}
          />
        </View>
      </Card>

      {message ? <Message text={message} /> : null}

      {context.loading ? (
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.text3 }}>Chargement…</Text>
      ) : null}
      {context.error && !supportContext ? (
        <Card>
          <Text accessibilityRole="alert" style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 16, color: colors.ember2 }}>
            Impossible de charger le dossier d’assistance. Termine la session puis recommence.
          </Text>
        </Card>
      ) : null}

      {supportContext ? (
        <>
          <Card>
            <CLabel>STRAVA · JETON MASQUÉ CÔTÉ SERVEUR</CLabel>
            {strava ? <StravaStatusLines strava={strava} /> : null}

            <View style={{
              marginTop: 12, padding: 12, borderRadius: radius.sm, borderWidth: 1,
              borderColor: colors.ember, backgroundColor: 'rgba(214,128,62,0.08)',
            }}>
              <Text style={{ fontFamily: font.bodySemiBold, fontSize: 12, color: colors.text }}>
                Redemander l’autorisation complète
              </Text>
              <Text style={{ fontFamily: font.body, fontSize: 10.5, lineHeight: 16, color: colors.text2, marginTop: 6, marginBottom: 10 }}>
                Vorcelab demande <Text style={{ fontFamily: font.mono }}>read</Text> et{' '}
                <Text style={{ fontFamily: font.mono }}>activity:read_all</Text> avec l’écran forcé.
                Strava affiche ces autorisations cochées ; l’athlète valide le bouton final sur
                son appareil.
              </Text>
              <PrimaryButton
                label="GÉNÉRER LE LIEN STRAVA"
                disabled={busy}
                onPress={() => doAction('create_strava_reauth_link')}
              />
              {oauthUrl ? (
                <View style={{ marginTop: 9, gap: 8 }}>
                  <Text
                    selectable
                    style={{
                      fontFamily: font.mono, fontSize: 9.5, lineHeight: 14, color: colors.text2,
                      backgroundColor: colors.surf2, borderRadius: radius.sm, padding: 8,
                    }}
                  >
                    {oauthUrl}
                  </Text>
                  <HButton label="ENVOYER LE LIEN" onPress={() => void shareLink()} />
                  <Text style={{ fontFamily: font.mono, fontSize: 9, lineHeight: 13, color: colors.text3 }}>
                    Envoie ce lien à l’athlète. Ne l’ouvre pas dans ta propre session Strava.
                    L’état ci-dessus se met à jour automatiquement après validation.
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              <HButton
                label="RELIRE LE STATUT"
                disabled={busy}
                onPress={() => doAction('strava_status')}
              />
              <HButton
                label="RAFRAÎCHIR JETON"
                disabled={busy || !strava?.connected}
                onPress={() => doAction('strava_refresh_token')}
              />
              <HButton
                label="SYNC RÉCENTE"
                disabled={busy || !strava?.activity_access_granted}
                onPress={() => doAction('strava_sync_incremental')}
              />
              <HButton
                label="SYNC COMPLÈTE"
                disabled={busy || !strava?.activity_access_granted}
                onPress={() => doAction('strava_sync_full')}
              />
              <HButton
                label="DÉCONNECTER"
                disabled={busy || !strava?.connected}
                onPress={() => Alert.alert(
                  'Déconnecter Strava ?',
                  'Déconnecter Strava supprimera le jeton Vorcelab de cet utilisateur. Continuer ?',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Déconnecter',
                      style: 'destructive',
                      // Confirmation exigée par le contrat serveur.
                      onPress: () => doAction('strava_disconnect', 'DISCONNECT_STRAVA'),
                    },
                  ],
                )}
                style={{ borderColor: colors.ember }}
                textStyle={{ color: colors.ember }}
              />
            </View>
          </Card>

          <Card>
            <CLabel>CONNEXION VORCELAB</CLabel>
            <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.text2 }}>
              {supportContext.identity.email}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.text2 }}>
              Dernière connexion : {fmtDateTime(supportContext.identity.last_sign_in_at)}
            </Text>
            <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.text2 }}>
              Données : {supportContext.counts.activities} activité
              {supportContext.counts.activities > 1 ? 's' : ''} · {supportContext.counts.races} course
              {supportContext.counts.races > 1 ? 's' : ''}
            </Text>

            {syntheticEmail ? (
              <Text style={{ marginTop: 12, fontFamily: font.body, fontSize: 10.5, lineHeight: 16, color: colors.text3 }}>
                Compte créé avec Strava : il se reconnecte avec le bouton Strava. Aucun email de
                mot de passe n’est envoyé à l’adresse technique.
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                <HButton
                  label="ENVOYER LIEN DE CONNEXION"
                  disabled={busy}
                  onPress={() => doAction('send_magic_link')}
                />
                <HButton
                  label="RESET MOT DE PASSE"
                  disabled={busy}
                  onPress={() => doAction('send_password_reset')}
                />
              </View>
            )}

            <View style={{ marginTop: 12 }}>
              <HButton
                label="VOIR L’APP COMME CET UTILISATEUR"
                disabled={busy}
                onPress={() => Alert.alert(
                  'Basculer sur son compte ?',
                  'L’app affichera tout comme cet utilisateur. Ta session admin est conservée et ' +
                  'restaurée en quittant.',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Basculer',
                      onPress: () => void guarded(async () => {
                        await startAssistedSession(activeSession.id, targetLabel)
                        history.reload()
                        return 'Session assistée active.'
                      }),
                    },
                  ],
                )}
                style={{ borderColor: colors.violet }}
                textStyle={{ color: colors.violet }}
              />
            </View>
          </Card>

          <Card>
            <CLabel>PROFIL ET RÉGLAGES VORCELAB</CLabel>
            <Hint>Modifications limitées aux champs fonctionnels ci-dessous et journalisées.</Hint>

            <Field label="Nom affiché" value={profileForm.name} onChange={(v) => setField('name', v)} />
            <Field
              label="Date de naissance"
              value={profileForm.birthdate}
              onChange={(v) => setField('birthdate', v)}
              placeholder="AAAA-MM-JJ"
            />
            <SelectField
              label="Sexe physiologique"
              value={profileForm.sex}
              onChange={(v) => setField('sex', v)}
              options={[['', 'Non renseigné'], ['M', 'Homme'], ['F', 'Femme']]}
            />
            <Field label="Poids (kg)" numeric value={profileForm.weight} onChange={(v) => setField('weight', v)} />
            <Field label="Taille (cm)" numeric value={profileForm.height} onChange={(v) => setField('height', v)} />
            <Field label="VO₂max" numeric value={profileForm.vo2max} onChange={(v) => setField('vo2max', v)} />
            <Field label="FC max (bpm)" numeric value={profileForm.fc_max} onChange={(v) => setField('fc_max', v)} />
            <Field
              label="Seuil lactique (bpm)"
              numeric
              value={profileForm.lactate_threshold}
              onChange={(v) => setField('lactate_threshold', v)}
            />
            <Field
              label="Allure seuil"
              value={profileForm.lactate_pace}
              onChange={(v) => setField('lactate_pace', v)}
              placeholder="ex. 4:35/km"
            />
            <SelectField
              label="Niveau nutrition"
              value={profileForm.nutrition_level}
              onChange={(v) => setField('nutrition_level', v)}
              options={[
                ['prudent', 'Prudent'],
                ['standard', 'Standard'],
                ['trained', 'Entraîné'],
                ['gut_trained', 'Gut trained'],
                ['elite', 'Élite'],
              ]}
            />
            <SelectField
              label="Jours course / semaine"
              value={profileForm.coach_days_per_week}
              onChange={(v) => setField('coach_days_per_week', v)}
              options={['3', '4', '5', '6'].map((v) => [v, v] as const)}
            />
            <SelectField
              label="Objectif coach"
              value={profileForm.coach_motivation}
              onChange={(v) => setField('coach_motivation', v)}
              options={[['plaisir', 'Plaisir'], ['mix', 'Mix'], ['performance', 'Performance']]}
            />
            <SelectField
              label="Renforcement / semaine"
              value={profileForm.renfo_weekly_target}
              onChange={(v) => setField('renfo_weekly_target', v)}
              options={['2', '3', '4', '5'].map((v) => [v, v] as const)}
            />
            <CheckRow
              checked={profileForm.nutrition_no_caffeine}
              onChange={(v) => setField('nutrition_no_caffeine', v)}
              label="Sans caféine"
            />

            <View style={{ marginTop: 12, gap: 8 }}>
              <PrimaryButton
                label="ENREGISTRER LE PROFIL"
                disabled={busy}
                onPress={() => saveProfile()}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <HButton
                  label="ANNULER LES MODIFICATIONS"
                  onPress={() => setProfileForm(profileFormFrom(supportContext.profile))}
                />
                <HButton
                  label="REJOUER L’ONBOARDING"
                  disabled={busy}
                  onPress={() => saveProfile({ onboarding_done: false })}
                />
                <HButton
                  label="RÉAFFICHER TOUS LES TUTORIELS"
                  disabled={busy}
                  onPress={() => saveProfile({ tours_seen: [], tours_off: false })}
                />
              </View>
            </View>
          </Card>

          <Card>
            <CLabel>JOURNAL LIVE DE LA SESSION</CLabel>
            <Hint>Le succès n’est ajouté qu’après confirmation de la base ou du serveur.</Hint>
            {(supportContext.recent_actions ?? []).map((log) => (
              <LogLine
                key={log.id}
                at={log.created_at}
                ok={log.outcome === 'success'}
                action={log.action}
                summary={log.summary}
              />
            ))}
            {!supportContext.recent_actions?.length ? (
              <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
                Aucune action enregistrée.
              </Text>
            ) : null}
          </Card>

          <SupportHistorySection
            sessions={history.data ?? []}
            loading={history.loading}
            error={Boolean(history.error)}
          />
        </>
      ) : null}
    </View>
  )
}
