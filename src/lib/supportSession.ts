export const SUPPORT_WINDOW_FLAG = 'vl-support-window'
export const SUPPORT_SESSION_META_KEY = 'vl-support-session-meta'
export const SUPPORT_AUTH_STORAGE_KEY = 'vl-support-auth'

export interface SupportSessionMeta {
  id: string
  target_user_id: string
  target_name?: string | null
  target_email?: string | null
  reason: string
  started_at: string
  expires_at: string
}

export function isSupportSessionWindow(): boolean {
  if (typeof window === 'undefined') return false
  if (window.location.pathname.replace(/\/+$/, '') === '/support-session') return true

  try {
    return window.sessionStorage.getItem(SUPPORT_WINDOW_FLAG) === '1'
  } catch {
    return false
  }
}

export function readSupportSessionMeta(): SupportSessionMeta | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SUPPORT_SESSION_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SupportSessionMeta>
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.target_user_id !== 'string' ||
      typeof parsed.reason !== 'string' ||
      typeof parsed.started_at !== 'string' ||
      typeof parsed.expires_at !== 'string'
    ) {
      return null
    }
    return parsed as SupportSessionMeta
  } catch {
    return null
  }
}

export function writeSupportSessionMeta(meta: SupportSessionMeta): void {
  window.sessionStorage.setItem(SUPPORT_WINDOW_FLAG, '1')
  window.sessionStorage.setItem(SUPPORT_SESSION_META_KEY, JSON.stringify(meta))
}

export function clearSupportSessionMeta(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(SUPPORT_SESSION_META_KEY)
    window.sessionStorage.removeItem(SUPPORT_WINDOW_FLAG)
    window.sessionStorage.removeItem(SUPPORT_AUTH_STORAGE_KEY)
    window.sessionStorage.removeItem(`${SUPPORT_AUTH_STORAGE_KEY}-user`)
    window.sessionStorage.removeItem(`${SUPPORT_AUTH_STORAGE_KEY}-code-verifier`)
  } catch {
    // La fermeture de la fenêtre reste possible même si le stockage est bloqué.
  }
}
