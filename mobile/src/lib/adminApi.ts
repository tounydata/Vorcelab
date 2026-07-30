// Accès admin — couche typée unique pour l'app mobile.
//
// Le backend admin est DÉJÀ partagé avec le web : 21 fonctions RPC (`admin_*`) plus
// l'edge function `admin-support`. Le mobile n'a donc aucune logique métier à
// reproduire — seulement à appeler le même contrat. Ce module centralise ces appels
// pour qu'un écran n'écrive jamais un nom de RPC en dur, et que la dérive éventuelle
// du contrat se corrige à un seul endroit.
//
// Les habilitations restent côté serveur : chaque RPC vérifie que l'appelant est
// admin. Ce fichier n'accorde aucun droit — il ne fait que transporter la requête.

import { supabase, SUPA_URL } from './supabase'

// ── Types (miroirs de ceux du web) ───────────────────────────────────────────────

export interface AdminUser {
  id: string
  email: string
  name: string | null
  plan_tier: string
  plan_expires_at: string | null
  plan_note: string | null
  is_admin: boolean
  joined_at: string
  last_seen: string | null
}

export interface AdminGrant {
  id: string
  plan_tier: string
  expires_at: string | null
  note: string | null
  granted_at: string
  revoked_at: string | null
  granted_by_email: string
}

export interface AdminActivityEvent {
  event_id: string
  user_id?: string
  user_email?: string
  user_name?: string | null
  event: string
  meta: Record<string, unknown>
  created_at: string
}

export interface AdminKpis {
  total_users: number
  new_users_7d: number
  new_users_30d: number
  active_users_7d: number
  active_users_30d: number
  pro_users: number
  sessions_today: number
  sessions_7d: number
  sessions_30d: number
}

export interface AdminDailyPoint {
  day: string
  signups?: number
  sessions?: number
  unique_users?: number
}

export interface AdminEventRow {
  event: string
  total_count: number
  unique_users: number
}

export interface AdminFunnelStep {
  step: string
  users: number
}

export interface AdminRetentionRow {
  cohort_week: string
  users_that_week: number
  returned_next_week: number
}

export interface StravaSupportStatus {
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

export interface SupportActionLog {
  id: string
  action: string
  outcome: 'success' | 'error'
  summary: string
  before_state?: Record<string, unknown> | null
  after_state?: Record<string, unknown> | null
  created_at: string
}

export interface ActiveSupportSession {
  id: string
  target_user_id: string
  target_email?: string
  target_name?: string | null
  reason: string
  consent_mode: string
  started_at: string
  expires_at: string
}

export interface SupportHistorySession {
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

export interface SupportContext {
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
  counts: { activities: number; races: number }
  recent_actions: SupportActionLog[]
}

/** Dossier complet renvoyé par `admin_get_user_support_snapshot` (lecture tracée). */
export interface SupportSnapshot {
  identity: {
    id: string
    email: string
    joined_at: string | null
    last_sign_in_at: string | null
  }
  profile: Record<string, unknown>
  strava: {
    connected: boolean
    athlete_id?: number
    athlete_firstname?: string
    athlete_lastname?: string
    scope?: string
    last_sync_at?: string
    token_expires_at?: string
  }
  counts: {
    activities: number
    races: number
    renfo_sessions: number
    coach_feedbacks: number
  }
  activities: Record<string, unknown>[]
  races: Record<string, unknown>[]
  coach_sessions: Record<string, unknown>[]
  renfo: {
    profile: Record<string, unknown> | null
    max_lifts: Record<string, unknown>[]
    recent_sessions: Record<string, unknown>[]
  }
  projection_validation: Record<string, unknown>[]
}

export interface DataAccessLogRow {
  id: string
  admin_email?: string | null
  target_user_id?: string | null
  target_email?: string | null
  reason?: string | null
  accessed_at: string
}

/** Actions de l'edge function `admin-support` (contrat serveur, cf. _shared/adminSupport.ts). */
export const ADMIN_SUPPORT_ACTIONS = [
  'strava_status',
  'strava_refresh_token',
  'strava_sync_incremental',
  'strava_sync_full',
  'create_strava_reauth_link',
  'strava_disconnect',
  'start_vorcelab_impersonation',
  'send_password_reset',
  'send_magic_link',
] as const

export type AdminSupportAction = (typeof ADMIN_SUPPORT_ACTIONS)[number]

// ── Utilitaire ───────────────────────────────────────────────────────────────────

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = args
    ? await supabase.rpc(fn, args)
    : await supabase.rpc(fn)
  if (error) throw new Error(error.message)
  return data as T
}

// ── Utilisateurs & abonnements ───────────────────────────────────────────────────

export const getUsers = () => rpc<AdminUser[]>('admin_get_users').then((r) => r ?? [])

export const getGrants = (targetUserId: string) =>
  rpc<AdminGrant[]>('admin_get_grants', { target_user_id: targetUserId }).then((r) => r ?? [])

export const getUserActivity = (targetUserId: string, limit = 20) =>
  rpc<AdminActivityEvent[]>('admin_get_user_activity', {
    target_user_id: targetUserId,
    limit_n: limit,
  }).then((r) => r ?? [])

export const getActivityFeed = (limit = 60) =>
  rpc<AdminActivityEvent[]>('admin_get_activity_feed', { limit_n: limit }).then((r) => r ?? [])

export const grantPro = (targetUserId: string, months: number | null, note?: string | null) =>
  rpc<unknown>('admin_grant_pro', {
    target_user_id: targetUserId,
    months,
    note_text: note?.trim() ? note.trim() : null,
  })

export const revokePro = (targetUserId: string) =>
  rpc<unknown>('admin_revoke_pro', { target_user_id: targetUserId })

/**
 * Réinitialisation de mot de passe déclenchée depuis la fiche utilisateur (comme le web).
 * Passe par l'API Auth publique, pas par une RPC admin : c'est l'utilisateur qui reçoit
 * l'email, l'admin ne voit jamais le lien.
 *
 * L'email renvoie vers le site — le compte est le même partout, et l'utilisateur revient
 * ensuite se connecter dans l'app (même convention que l'écran de connexion mobile).
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://vorcelab.app/profile/settings',
  })
  if (error) throw new Error(error.message)
}

// ── Statistiques ─────────────────────────────────────────────────────────────────

export const getKpis = () => rpc<AdminKpis>('admin_get_kpis')
export const getSignupsDaily = (daysBack = 30) =>
  rpc<AdminDailyPoint[]>('admin_get_signups_daily', { days_back: daysBack }).then((r) => r ?? [])
export const getSessionsDaily = (daysBack = 30) =>
  rpc<AdminDailyPoint[]>('admin_get_sessions_daily', { days_back: daysBack }).then((r) => r ?? [])
export const getEventBreakdown = (daysBack = 30) =>
  rpc<AdminEventRow[]>('admin_get_event_breakdown', { days_back: daysBack }).then((r) => r ?? [])
export const getFunnel = () => rpc<AdminFunnelStep[]>('admin_get_funnel').then((r) => r ?? [])
export const getWeeklyRetention = () =>
  rpc<AdminRetentionRow[]>('admin_get_weekly_retention').then((r) => r ?? [])

// ── Assistance ───────────────────────────────────────────────────────────────────

export const getActiveSupportSession = () =>
  rpc<ActiveSupportSession | null>('admin_get_active_support_session')

export const startSupportSession = (input: {
  targetUserId: string
  reason: string
  consentMode: string
  userPresent: boolean
}) =>
  rpc<ActiveSupportSession>('admin_start_support_session', {
    target_user_id: input.targetUserId,
    support_reason: input.reason.trim(),
    consent_mode: input.consentMode,
    user_present: input.userPresent,
  })

export const endSupportSession = (sessionId: string) =>
  rpc<unknown>('admin_end_support_session', { support_session_id: sessionId })

export const getSupportContext = (sessionId: string) =>
  rpc<SupportContext>('admin_get_support_context', { support_session_id: sessionId })

export const listSupportHistory = (limit = 25) =>
  rpc<SupportHistorySession[]>('admin_list_support_history', { history_limit: limit }).then(
    (r) => r ?? [],
  )

export const updateSupportProfile = (sessionId: string, patch: Record<string, unknown>) =>
  rpc<Record<string, unknown>>('admin_update_user_support_profile', {
    support_session_id: sessionId,
    profile_patch: patch,
  })

// ── Labo & traçabilité ───────────────────────────────────────────────────────────

export const getDataAccessLog = (limit = 30) =>
  rpc<DataAccessLogRow[]>('admin_get_data_access_log', { limit_n: limit }).then((r) => r ?? [])

export const getUserSupportSnapshot = (targetUserId: string, reason: string) =>
  rpc<SupportSnapshot>('admin_get_user_support_snapshot', {
    target_user_id: targetUserId,
    access_reason: reason.trim(),
  })

// ── Edge function `admin-support` ─────────────────────────────────────────────────

export interface SupportActionResult {
  status?: StravaSupportStatus
  oauth_url?: string
  requested_scopes?: string[]
  token_hash?: string
  support_session_id?: string
  target_user_id?: string
  expires_at?: string
  [key: string]: unknown
}

/**
 * Exécute une action d'assistance. `supportSessionId` est OBLIGATOIRE : le serveur le
 * revalide (session non terminée, non expirée, appartenant à l'admin appelant) avant
 * toute action, et journalise systématiquement le résultat dans
 * `admin_support_action_log` — succès comme échec. Une erreur remontée ici est donc déjà
 * tracée côté serveur.
 *
 * `confirmation` porte les gardes-fous explicites du contrat (ex. `DISCONNECT_STRAVA`).
 */
export async function runSupportAction(
  supportSessionId: string,
  action: AdminSupportAction,
  confirmation?: string,
): Promise<SupportActionResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session admin expirée — reconnecte-toi.')

  const response = await fetch(`${SUPA_URL}/functions/v1/admin-support`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId: supportSessionId, action, confirmation }),
  })

  const body = (await response.json().catch(() => null)) as
    | (SupportActionResult & { error?: string; code?: string })
    | null

  if (!response.ok) {
    throw new Error(body?.error ?? `Échec de l'action (${response.status})`)
  }
  return body ?? {}
}
