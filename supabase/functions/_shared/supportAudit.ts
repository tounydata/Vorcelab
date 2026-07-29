export interface AssistedSupportSession {
  id: string
  admin_user_id: string
  target_user_id: string
  expires_at: string
}

export class SupportAuditError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SupportAuditError'
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
}

export async function resolveAssistedSupportSession(
  // Supabase Edge Functions do not generate Database types in this project.
  // deno-lint-ignore no-explicit-any
  admin: any,
  rawSessionId: unknown,
  targetUserId: string,
): Promise<AssistedSupportSession | null> {
  if (rawSessionId === undefined || rawSessionId === null || rawSessionId === '') {
    return null
  }
  if (!isUuid(rawSessionId)) {
    throw new SupportAuditError(
      'invalid_support_session',
      'La session d’assistance est invalide.',
    )
  }

  const { data, error } = await admin
    .from('admin_support_sessions')
    .select('id, admin_user_id, target_user_id, expires_at')
    .eq('id', rawSessionId)
    .eq('target_user_id', targetUserId)
    .eq('user_present', true)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) {
    throw new SupportAuditError(
      'support_session_unavailable',
      'La session d’assistance est absente, terminée ou expirée.',
    )
  }

  return data as AssistedSupportSession
}

export async function writeSupportAudit(
  // deno-lint-ignore no-explicit-any
  admin: any,
  session: AssistedSupportSession,
  action: string,
  outcome: 'success' | 'error',
  summary: string,
  beforeState?: Record<string, unknown> | null,
  afterState?: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await admin.from('admin_support_action_log').insert({
    session_id: session.id,
    admin_user_id: session.admin_user_id,
    target_user_id: session.target_user_id,
    action: action.slice(0, 80),
    outcome,
    summary: summary.slice(0, 240),
    before_state: beforeState ?? null,
    after_state: afterState ?? null,
  })

  if (error) {
    // Never include database payloads here: they could contain private data.
    console.error('support audit write failed')
  }
}
