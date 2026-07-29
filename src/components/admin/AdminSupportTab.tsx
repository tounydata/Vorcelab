import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

interface SupportUser {
  id: string
  email: string
  name: string | null
  is_admin: boolean
}

interface ActiveSupportSession {
  id: string
  target_user_id: string
  target_email?: string
  target_name?: string | null
  reason: string
  consent_mode: string
  started_at: string
  expires_at: string
}

interface StravaSupportStatus {
  connected: boolean
  athlete_id?: number | null
  athlete_firstname?: string | null
  athlete_lastname?: string | null
  scope?: string | null
  activity_access_granted: boolean
  last_sync_at?: string | null
  token_expires_at?: string | null
  token_state: 'missing' | 'unknown' | 'valid' | 'refresh_needed'
}

interface SupportActionLog {
  id: string
  action: string
  outcome: 'success' | 'error'
  summary: string
  before_state?: Record<string, unknown> | null
  after_state?: Record<string, unknown> | null
  created_at: string
}

interface SupportHistorySession {
  id: string
  target_user_id: string
  target_email?: string | null
  target_name?: string | null
  reason: string
  consent_mode: string
  started_at: string
  expires_at: string
  ended_at?: string | null
  state: 'active' | 'ended' | 'expired'
  actions: SupportActionLog[]
}

interface SupportContext {
  session: {
    id: string
    reason: string
    consent_mode: string
    started_at: string
    expires_at: string
  }
  identity: {
    id: string
    email: string
    joined_at?: string | null
    last_sign_in_at?: string | null
  }
  profile: Record<string, unknown>
  strava: StravaSupportStatus
  counts: {
    activities: number
    races: number
  }
  recent_actions: SupportActionLog[]
}

type SupportAction =
  | 'strava_refresh_token'
  | 'strava_sync_incremental'
  | 'strava_sync_full'
  | 'create_strava_reauth_link'
  | 'strava_disconnect'
  | 'send_password_reset'
  | 'send_magic_link'

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

const emptyProfileForm: ProfileForm = {
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

const card: React.CSSProperties = {
  border: '1px solid var(--vl-line)',
  borderRadius: 12,
  background: 'var(--vl-surf)',
  padding: 16,
}

const actionButton: React.CSSProperties = {
  minHeight: 38,
  border: '1px solid var(--vl-line)',
  borderRadius: 8,
  background: 'var(--vl-surf-2)',
  color: 'var(--vl-text)',
  padding: '7px 12px',
  cursor: 'pointer',
  fontFamily: 'var(--vl-mono)',
  fontSize: 10,
  fontWeight: 700,
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function boolValue(value: unknown): boolean {
  return value === true
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
    nutrition_no_caffeine: boolValue(profile.nutrition_no_caffeine),
    coach_days_per_week: displayValue(profile.coach_days_per_week) || '5',
    coach_motivation: displayValue(profile.coach_motivation) || 'mix',
    renfo_weekly_target: displayValue(profile.renfo_weekly_target) || '3',
  }
}

function fmtDateTime(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nullableNumber(value: string, label: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} doit être un nombre valide.`)
  return parsed
}

async function invokeSupportAction(
  sessionId: string,
  action: SupportAction,
  confirmation?: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('admin-support', {
    body: { sessionId, action, confirmation },
  })

  if (error) {
    let message = error.message
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      const payload = await context.clone().json().catch(() => null) as { error?: unknown } | null
      if (typeof payload?.error === 'string') message = payload.error
    }
    throw new Error(message)
  }

  return (data ?? {}) as Record<string, unknown>
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10, color: 'var(--vl-text-3)' }}>
      {label}
      <input
        className="fi"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10, color: 'var(--vl-text-3)' }}>
      {label}
      <select className="fi" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}

function SupportHistorySection({
  sessions,
  loading,
  error,
}: {
  sessions: SupportHistorySession[]
  loading: boolean
  error: boolean
}) {
  return (
    <section style={card}>
      <div className="clabel" style={{ marginBottom: 5 }}>HISTORIQUE ADMIN DES ASSISTANCES</div>
      <div style={{ marginBottom: 12, color: 'var(--vl-text-3)', fontSize: 10, lineHeight: 1.5 }}>
        Une ligne verte confirme une écriture effectuée par la base ou une opération validée par le serveur.
        Une ligne rouge confirme un échec.
        Les simples consultations et changements de page ne sont pas journalisés.
      </div>

      {loading ? <div className="loading"><div className="spinner" /></div> : null}
      {error ? (
        <div role="alert" style={{ color: 'var(--vl-ember)', fontSize: 11 }}>
          Impossible de charger l’historique d’assistance.
        </div>
      ) : null}
      {!loading && !error && sessions.length === 0 ? (
        <div style={{ color: 'var(--vl-text-3)', fontSize: 10 }}>Aucune session enregistrée.</div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sessions.map((session, index) => {
          const successCount = session.actions.filter((action) => action.outcome === 'success').length
          const errorCount = session.actions.filter((action) => action.outcome === 'error').length
          const stateLabel = session.state === 'active'
            ? 'ACTIVE'
            : session.state === 'expired'
            ? 'EXPIRÉE'
            : 'TERMINÉE'

          return (
            <details
              key={session.id}
              open={index === 0 && session.state === 'active'}
              style={{
                border: '1px solid var(--vl-line)',
                borderRadius: 9,
                background: 'var(--vl-surf-2)',
                overflow: 'hidden',
              }}
            >
              <summary style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '10px 12px',
                cursor: 'pointer',
                listStyle: 'none',
                fontFamily: 'var(--vl-mono)',
                fontSize: 9.5,
              }}>
                <span style={{
                  color: session.state === 'active' ? 'var(--vl-growth)' : 'var(--vl-text-3)',
                  fontWeight: 800,
                }}>
                  {stateLabel}
                </span>
                <strong style={{ color: 'var(--vl-text)' }}>
                  {session.target_name || session.target_email || session.target_user_id}
                </strong>
                <span style={{ color: 'var(--vl-text-3)' }}>{fmtDateTime(session.started_at)}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--vl-growth)' }}>✓ {successCount}</span>
                {errorCount > 0 ? <span style={{ color: 'var(--vl-ember)' }}>✕ {errorCount}</span> : null}
              </summary>

              <div style={{ padding: '0 12px 10px' }}>
                <div style={{ padding: '7px 0', color: 'var(--vl-text-3)', fontSize: 9.5 }}>
                  {session.reason}
                </div>
                {session.actions.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '118px minmax(150px, .8fr) minmax(220px, 2fr)',
                      gap: 9,
                      padding: '7px 0',
                      borderTop: '1px solid var(--vl-line)',
                      fontFamily: 'var(--vl-mono)',
                      fontSize: 9,
                    }}
                  >
                    <span style={{ color: 'var(--vl-text-3)' }}>{fmtDateTime(log.created_at)}</span>
                    <span style={{
                      color: log.outcome === 'success' ? 'var(--vl-growth)' : 'var(--vl-ember)',
                      fontWeight: 700,
                    }}>
                      {log.outcome === 'success' ? '✓' : '✕'} {log.action}
                    </span>
                    <span style={{ color: 'var(--vl-text-2)' }}>{log.summary}</span>
                  </div>
                ))}
                {session.actions.length === 0 ? (
                  <div style={{ color: 'var(--vl-text-3)', fontSize: 9.5 }}>Aucune action enregistrée.</div>
                ) : null}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

export default function AdminSupportTab({ users }: { users: SupportUser[] }) {
  const queryClient = useQueryClient()
  const athleteUsers = useMemo(() => users.filter((user) => !user.is_admin), [users])
  const [targetUserId, setTargetUserId] = useState('')
  const [reason, setReason] = useState('Assistance en visio Teams demandée par l’utilisateur')
  const [consentMode, setConsentMode] = useState('verbal')
  const [userPresent, setUserPresent] = useState(true)
  const [message, setMessage] = useState('')
  const [oauthUrl, setOauthUrl] = useState('')
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm)
  const loadedProfileSession = useRef('')

  const activeSessionQuery = useQuery<ActiveSupportSession | null>({
    queryKey: ['admin-support-active-session'],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_active_support_session')
      if (error) throw error
      return (data ?? null) as ActiveSupportSession | null
    },
  })

  const activeSession = activeSessionQuery.data ?? null

  const historyQuery = useQuery<SupportHistorySession[]>({
    queryKey: ['admin-support-history'],
    refetchInterval: activeSession ? 4_000 : 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_support_history', {
        history_limit: 25,
      })
      if (error) throw error
      return (data ?? []) as unknown as SupportHistorySession[]
    },
  })

  const contextQuery = useQuery<SupportContext>({
    queryKey: ['admin-support-context', activeSession?.id],
    enabled: Boolean(activeSession?.id),
    // Le statut change sur l'appareil de l'athlète après le retour OAuth.
    // Ce polling léger permet à l'admin de voir la validation sans manipuler sa session.
    refetchInterval: 4_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_support_context', {
        support_session_id: activeSession?.id,
      })
      if (error) throw error
      return data as unknown as SupportContext
    },
  })

  useEffect(() => {
    if (!activeSession?.id || !contextQuery.data?.profile) return
    if (loadedProfileSession.current === activeSession.id) return
    loadedProfileSession.current = activeSession.id
    setProfileForm(profileFormFrom(contextQuery.data.profile))
  }, [activeSession?.id, contextQuery.data?.profile])

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      if (!targetUserId) throw new Error('Choisis un utilisateur.')
      if (reason.trim().length < 8) throw new Error('Le motif doit contenir au moins 8 caractères.')
      if (!userPresent) throw new Error('L’utilisateur doit être présent pendant la visio.')

      const { data, error } = await supabase.rpc('admin_start_support_session', {
        target_user_id: targetUserId,
        support_reason: reason.trim(),
        consent_mode: consentMode,
        user_present: true,
      })
      if (error) throw error
      return data as unknown as ActiveSupportSession
    },
    onSuccess: (session) => {
      loadedProfileSession.current = ''
      setOauthUrl('')
      setMessage('Session d’assistance ouverte pour 45 minutes.')
      queryClient.setQueryData(['admin-support-active-session'], session)
      queryClient.invalidateQueries({ queryKey: ['admin-support-history'] })
    },
    onError: (error) => setMessage(`Erreur : ${error.message}`),
  })

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (!activeSession) return
      const { error } = await supabase.rpc('admin_end_support_session', {
        support_session_id: activeSession.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      loadedProfileSession.current = ''
      setOauthUrl('')
      setMessage('Session d’assistance terminée.')
      queryClient.setQueryData(['admin-support-active-session'], null)
      queryClient.removeQueries({ queryKey: ['admin-support-context'] })
      queryClient.invalidateQueries({ queryKey: ['admin-support-history'] })
    },
    onError: (error) => setMessage(`Erreur : ${error.message}`),
  })

  const actionMutation = useMutation({
    mutationFn: async ({
      action,
      confirmation,
    }: {
      action: SupportAction
      confirmation?: string
    }) => {
      if (!activeSession) throw new Error('Aucune session d’assistance active.')
      return {
        action,
        result: await invokeSupportAction(activeSession.id, action, confirmation),
      }
    },
    onSuccess: async ({ action, result }) => {
      const messages: Record<SupportAction, string> = {
        strava_refresh_token: 'Jeton Strava rafraîchi sans être exposé.',
        strava_sync_incremental: 'Synchronisation récente terminée.',
        strava_sync_full: 'Synchronisation complète terminée.',
        create_strava_reauth_link: 'Lien Strava prêt.',
        strava_disconnect: 'Compte Strava déconnecté.',
        send_password_reset: 'Email de réinitialisation envoyé.',
        send_magic_link: 'Lien de connexion envoyé.',
      }

      if (action === 'create_strava_reauth_link' && typeof result.oauth_url === 'string') {
        setOauthUrl(result.oauth_url)
        try {
          await navigator.clipboard.writeText(result.oauth_url)
          setMessage('Lien Strava copié. Envoie-le à l’athlète : il n’a plus qu’à valider sur son appareil.')
        } catch {
          setMessage('Lien Strava généré. Utilise le bouton Copier ci-dessous.')
        }
      } else {
        setMessage(messages[action])
      }
      contextQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['admin-support-history'] })
    },
    onError: (error) => setMessage(`Erreur : ${error.message}`),
  })

  const updateProfileMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!activeSession) throw new Error('Aucune session d’assistance active.')
      const { data, error } = await supabase.rpc('admin_update_user_support_profile', {
        support_session_id: activeSession.id,
        profile_patch: patch,
      })
      if (error) throw error
      return data as unknown as Record<string, unknown>
    },
    onSuccess: (profile) => {
      setProfileForm(profileFormFrom(profile))
      setMessage('Profil et réglages enregistrés.')
      contextQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['admin-support-history'] })
    },
    onError: (error) => setMessage(`Erreur : ${error.message}`),
  })

  function setProfileField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setProfileForm((current) => ({ ...current, [key]: value }))
  }

  function saveProfile() {
    try {
      updateProfileMutation.mutate({
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
      })
    } catch (error) {
      setMessage(`Erreur : ${error instanceof Error ? error.message : 'Valeur invalide.'}`)
    }
  }

  async function copyOauthUrl() {
    if (!oauthUrl) return
    try {
      await navigator.clipboard.writeText(oauthUrl)
      setMessage('Lien copié.')
    } catch {
      setMessage('Copie manuelle nécessaire : le navigateur bloque le presse-papiers.')
    }
  }

  function disconnectStrava() {
    const confirmed = window.confirm(
      'Déconnecter Strava supprimera le jeton Vorcelab de cet utilisateur. Continuer ?',
    )
    if (confirmed) {
      actionMutation.mutate({
        action: 'strava_disconnect',
        confirmation: 'DISCONNECT_STRAVA',
      })
    }
  }

  const supportContext = contextQuery.data
  const strava = supportContext?.strava
  const syntheticEmail = supportContext?.identity.email.endsWith('@strava.users.vorcelab.app') ?? false
  const busy = actionMutation.isPending

  if (!activeSession) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section style={{
          ...card,
          borderColor: 'color-mix(in oklab, var(--vl-ember) 55%, var(--vl-line))',
          background: 'linear-gradient(135deg, color-mix(in oklab, var(--vl-ember) 10%, var(--vl-surf)), var(--vl-surf))',
        }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '1.35rem' }}>
            Assistance administrateur
          </div>
          <p style={{ margin: '7px 0 0', maxWidth: 850, color: 'var(--vl-text-2)', fontSize: 12, lineHeight: 1.6 }}>
            Tu agis depuis ton portail pendant que l’utilisateur est présent en visio. Vorcelab enregistre ta
            déclaration de consentement sans vérifier Teams. Aucun contrôle de son ordinateur, aucun mot de passe
            et aucun jeton affiché.
          </p>
        </section>

        <section style={card}>
          <div className="clabel" style={{ marginBottom: 12 }}>OUVRIR UNE SESSION LIMITÉE À 45 MINUTES</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10, color: 'var(--vl-text-3)' }}>
              Utilisateur assisté
              <select className="fi" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
                <option value="">Choisir…</option>
                {athleteUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name ?? user.email} · {user.email}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10, color: 'var(--vl-text-3)' }}>
              Consentement déclaré par l’admin
              <select className="fi" value={consentMode} onChange={(event) => setConsentMode(event.target.value)}>
                <option value="verbal">Verbal</option>
                <option value="written">Écrit</option>
                <option value="verbal_written">Verbal + écrit</option>
                <option value="in_person">En présence physique</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10, fontSize: 10, color: 'var(--vl-text-3)' }}>
            Motif journalisé
            <input className="fi" value={reason} maxLength={240} onChange={(event) => setReason(event.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--vl-text-2)', fontSize: 11 }}>
            <input type="checkbox" checked={userPresent} onChange={(event) => setUserPresent(event.target.checked)} />
            L’utilisateur est présent pendant l’assistance (visio ou sur place)
          </label>
          <button
            onClick={() => startSessionMutation.mutate()}
            disabled={startSessionMutation.isPending}
            style={{
              ...actionButton,
              marginTop: 14,
              borderColor: 'var(--vl-ember)',
              background: 'var(--vl-ember)',
              color: 'var(--vl-ink)',
              opacity: startSessionMutation.isPending ? .55 : 1,
            }}
          >
            {startSessionMutation.isPending ? 'OUVERTURE…' : 'OUVRIR L’ASSISTANCE'}
          </button>
          {activeSessionQuery.isError ? (
            <div role="alert" style={{ marginTop: 10, color: 'var(--vl-ember)', fontSize: 11 }}>
              Le backend du mode assistance n’est pas encore disponible.
            </div>
          ) : null}
          {message ? <div aria-live="polite" style={{ marginTop: 10, color: 'var(--vl-text-2)', fontSize: 11 }}>{message}</div> : null}
        </section>
        <SupportHistorySection
          sessions={historyQuery.data ?? []}
          loading={historyQuery.isLoading}
          error={historyQuery.isError}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{
        ...card,
        position: 'sticky',
        top: 8,
        zIndex: 5,
        borderWidth: 2,
        borderColor: 'var(--vl-ember)',
        background: 'color-mix(in oklab, var(--vl-ember) 12%, var(--vl-surf))',
        boxShadow: '0 12px 36px color-mix(in oklab, var(--vl-ink) 35%, transparent)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className="clabel" style={{ color: 'var(--vl-ember)' }}>● ASSISTANCE ACTIVE · UTILISATEUR PRÉSENT</div>
            <div style={{ marginTop: 5, fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '1.25rem' }}>
              {activeSession.target_name || activeSession.target_email || activeSession.target_user_id}
            </div>
            <div style={{ marginTop: 3, color: 'var(--vl-text-2)', fontSize: 10 }}>
              Fin automatique {fmtDateTime(activeSession.expires_at)} · {activeSession.reason}
            </div>
          </div>
          <button
            onClick={() => endSessionMutation.mutate()}
            disabled={endSessionMutation.isPending}
            style={{ ...actionButton, borderColor: 'var(--vl-ember)', color: 'var(--vl-ember)' }}
          >
            TERMINER L’ASSISTANCE
          </button>
        </div>
      </section>

      {message ? (
        <div
          aria-live="polite"
          role={message.startsWith('Erreur') ? 'alert' : 'status'}
          style={{
            ...card,
            padding: '10px 14px',
            borderColor: message.startsWith('Erreur') ? 'var(--vl-ember)' : 'var(--vl-growth)',
            color: message.startsWith('Erreur') ? 'var(--vl-ember)' : 'var(--vl-growth)',
            fontSize: 11,
          }}
        >
          {message}
        </div>
      ) : null}

      {contextQuery.isLoading ? <div className="loading"><div className="spinner" /></div> : null}
      {contextQuery.isError ? (
        <div role="alert" style={{ ...card, color: 'var(--vl-ember)' }}>
          Impossible de charger le dossier d’assistance. Termine la session puis recommence.
        </div>
      ) : null}

      {supportContext ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <section style={card}>
              <div className="clabel" style={{ marginBottom: 10 }}>STRAVA · JETON MASQUÉ CÔTÉ SERVEUR</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: strava?.connected ? 'var(--vl-growth)' : 'var(--vl-ember)',
                  }}
                />
                <strong>{strava?.connected ? 'Compte connecté' : 'Compte non connecté'}</strong>
              </div>
              {strava?.connected ? (
                <div style={{ marginTop: 8, color: 'var(--vl-text-2)', fontSize: 11, lineHeight: 1.6 }}>
                  {[strava.athlete_firstname, strava.athlete_lastname].filter(Boolean).join(' ') || 'Athlète Strava'}
                  <br />
                  Accès activités :{' '}
                  <strong style={{ color: strava.activity_access_granted ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                    {strava.activity_access_granted ? 'complet' : 'à revalider'}
                  </strong>
                  <br />
                  Jeton : {strava.token_state} · dernière sync {fmtDateTime(strava.last_sync_at)}
                  <br />
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
                    Scopes reçus : {strava.scope || 'aucun'}
                  </span>
                </div>
              ) : null}

              <div style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 9,
                border: '1px solid color-mix(in oklab, var(--vl-ember) 55%, var(--vl-line))',
                background: 'color-mix(in oklab, var(--vl-ember) 8%, var(--vl-surf-2))',
              }}>
                <strong style={{ fontSize: 12 }}>Redemander l’autorisation complète</strong>
                <p style={{ margin: '6px 0 10px', color: 'var(--vl-text-2)', fontSize: 10.5, lineHeight: 1.55 }}>
                  Vorcelab demande <code>read</code> et <code>activity:read_all</code> avec l’écran forcé.
                  Strava affiche ces autorisations cochées ; l’athlète valide le bouton final sur son appareil.
                </p>
                <button
                  style={{ ...actionButton, width: '100%', borderColor: 'var(--vl-ember)', background: 'var(--vl-ember)', color: 'var(--vl-ink)' }}
                  disabled={busy}
                  onClick={() => actionMutation.mutate({ action: 'create_strava_reauth_link' })}
                >
                  GÉNÉRER ET COPIER LE LIEN STRAVA
                </button>
                {oauthUrl ? (
                  <div style={{ marginTop: 9 }}>
                    <input className="fi" readOnly value={oauthUrl} aria-label="Lien de réautorisation Strava" />
                    <button style={{ ...actionButton, width: '100%', marginTop: 6 }} onClick={copyOauthUrl}>
                      COPIER À NOUVEAU
                    </button>
                    <div style={{ marginTop: 6, color: 'var(--vl-text-3)', fontSize: 9.5, lineHeight: 1.45 }}>
                      Envoie ce lien à l’athlète. Ne l’ouvre pas dans ta propre session Strava.
                      L’état ci-dessus se met à jour automatiquement après validation.
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                <button
                  style={actionButton}
                  disabled={busy || !strava?.connected}
                  onClick={() => actionMutation.mutate({ action: 'strava_refresh_token' })}
                >
                  RAFRAÎCHIR JETON
                </button>
                <button
                  style={actionButton}
                  disabled={busy || !strava?.activity_access_granted}
                  onClick={() => actionMutation.mutate({ action: 'strava_sync_incremental' })}
                >
                  SYNC RÉCENTE
                </button>
                <button
                  style={actionButton}
                  disabled={busy || !strava?.activity_access_granted}
                  onClick={() => actionMutation.mutate({ action: 'strava_sync_full' })}
                >
                  SYNC COMPLÈTE
                </button>
                <button
                  style={{ ...actionButton, borderColor: 'var(--vl-ember)', color: 'var(--vl-ember)' }}
                  disabled={busy || !strava?.connected}
                  onClick={disconnectStrava}
                >
                  DÉCONNECTER
                </button>
              </div>
            </section>

            <section style={card}>
              <div className="clabel" style={{ marginBottom: 10 }}>CONNEXION VORCELAB</div>
              <div style={{ color: 'var(--vl-text-2)', fontSize: 11, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                {supportContext.identity.email}
                <br />
                Dernière connexion : {fmtDateTime(supportContext.identity.last_sign_in_at)}
                <br />
                Données : {supportContext.counts.activities} activité{supportContext.counts.activities > 1 ? 's' : ''} · {supportContext.counts.races} course{supportContext.counts.races > 1 ? 's' : ''}
              </div>
              {syntheticEmail ? (
                <div style={{ marginTop: 12, color: 'var(--vl-text-3)', fontSize: 10.5, lineHeight: 1.5 }}>
                  Compte créé avec Strava : il se reconnecte avec le bouton Strava. Aucun email de mot de passe n’est envoyé à l’adresse technique.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    style={actionButton}
                    disabled={busy}
                    onClick={() => actionMutation.mutate({ action: 'send_magic_link' })}
                  >
                    ENVOYER LIEN DE CONNEXION
                  </button>
                  <button
                    style={actionButton}
                    disabled={busy}
                    onClick={() => actionMutation.mutate({ action: 'send_password_reset' })}
                  >
                    RESET MOT DE PASSE
                  </button>
                </div>
              )}
            </section>
          </div>

          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div className="clabel">PROFIL ET RÉGLAGES VORCELAB</div>
                <div style={{ marginTop: 4, color: 'var(--vl-text-3)', fontSize: 10 }}>
                  Modifications limitées aux champs fonctionnels ci-dessous et journalisées.
                </div>
              </div>
              <button
                style={actionButton}
                onClick={() => setProfileForm(profileFormFrom(supportContext.profile))}
              >
                ANNULER LES MODIFICATIONS
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <Field label="Nom affiché" value={profileForm.name} onChange={(value) => setProfileField('name', value)} />
              <Field label="Date de naissance" type="date" value={profileForm.birthdate} onChange={(value) => setProfileField('birthdate', value)} />
              <SelectField label="Sexe physiologique" value={profileForm.sex} onChange={(value) => setProfileField('sex', value)} options={[['', 'Non renseigné'], ['M', 'Homme'], ['F', 'Femme']]} />
              <Field label="Poids (kg)" type="number" value={profileForm.weight} onChange={(value) => setProfileField('weight', value)} />
              <Field label="Taille (cm)" type="number" value={profileForm.height} onChange={(value) => setProfileField('height', value)} />
              <Field label="VO₂max" type="number" value={profileForm.vo2max} onChange={(value) => setProfileField('vo2max', value)} />
              <Field label="FC max (bpm)" type="number" value={profileForm.fc_max} onChange={(value) => setProfileField('fc_max', value)} />
              <Field label="Seuil lactique (bpm)" type="number" value={profileForm.lactate_threshold} onChange={(value) => setProfileField('lactate_threshold', value)} />
              <Field label="Allure seuil" value={profileForm.lactate_pace} placeholder="ex. 4:35/km" onChange={(value) => setProfileField('lactate_pace', value)} />
              <SelectField
                label="Niveau nutrition"
                value={profileForm.nutrition_level}
                onChange={(value) => setProfileField('nutrition_level', value)}
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
                onChange={(value) => setProfileField('coach_days_per_week', value)}
                options={['3', '4', '5', '6'].map((value) => [value, value])}
              />
              <SelectField
                label="Objectif coach"
                value={profileForm.coach_motivation}
                onChange={(value) => setProfileField('coach_motivation', value)}
                options={[['plaisir', 'Plaisir'], ['mix', 'Mix'], ['performance', 'Performance']]}
              />
              <SelectField
                label="Renforcement / semaine"
                value={profileForm.renfo_weekly_target}
                onChange={(value) => setProfileField('renfo_weekly_target', value)}
                options={['2', '3', '4', '5'].map((value) => [value, value])}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--vl-text-2)', fontSize: 11 }}>
              <input
                type="checkbox"
                checked={profileForm.nutrition_no_caffeine}
                onChange={(event) => setProfileField('nutrition_no_caffeine', event.target.checked)}
              />
              Sans caféine
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <button
                style={{ ...actionButton, borderColor: 'var(--vl-ember)', background: 'var(--vl-ember)', color: 'var(--vl-ink)' }}
                disabled={updateProfileMutation.isPending}
                onClick={saveProfile}
              >
                ENREGISTRER LE PROFIL
              </button>
              <button
                style={actionButton}
                disabled={updateProfileMutation.isPending}
                onClick={() => updateProfileMutation.mutate({ onboarding_done: false })}
              >
                REJOUER L’ONBOARDING
              </button>
              <button
                style={actionButton}
                disabled={updateProfileMutation.isPending}
                onClick={() => updateProfileMutation.mutate({ tours_seen: [], tours_off: false })}
              >
                RÉAFFICHER TOUS LES TUTORIELS
              </button>
            </div>
          </section>

          <section style={card}>
            <div className="clabel" style={{ marginBottom: 4 }}>JOURNAL LIVE DE LA SESSION</div>
            <div style={{ marginBottom: 10, color: 'var(--vl-text-3)', fontSize: 9.5 }}>
              Le succès n’est ajouté qu’après confirmation de la base ou du serveur.
            </div>
            {(supportContext.recent_actions ?? []).map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px minmax(140px, .8fr) minmax(220px, 2fr)',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--vl-line)',
                  fontFamily: 'var(--vl-mono)',
                  fontSize: 9.5,
                }}
              >
                <span style={{ color: 'var(--vl-text-3)' }}>{fmtDateTime(log.created_at)}</span>
                <span style={{ color: log.outcome === 'success' ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                  {log.outcome === 'success' ? '✓' : '✕'} {log.action}
                </span>
                <span style={{ color: 'var(--vl-text-2)' }}>{log.summary}</span>
              </div>
            ))}
            {!supportContext.recent_actions?.length ? (
              <div style={{ color: 'var(--vl-text-3)', fontSize: 10 }}>Aucune action enregistrée.</div>
            ) : null}
          </section>

          <SupportHistorySection
            sessions={historyQuery.data ?? []}
            loading={historyQuery.isLoading}
            error={historyQuery.isError}
          />
        </>
      ) : null}
    </div>
  )
}
