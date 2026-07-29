import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  clearSupportSessionMeta,
  readSupportSessionMeta,
  type SupportSessionMeta,
} from '../lib/supportSession'

function remainingLabel(expiresAt: string, now: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function SupportSessionBanner() {
  const [meta] = useState<SupportSessionMeta | null>(() => readSupportSessionMeta())
  const [now, setNow] = useState(Date.now())
  const [ending, setEnding] = useState(false)

  const closeSupport = useCallback(async (notifyServer = true) => {
    if (ending) return
    setEnding(true)

    if (notifyServer && meta?.id) {
      try {
        await supabase.rpc('support_end_assisted_session', {
          support_session_id: meta.id,
        })
      } catch {
        // La déconnexion locale doit rester possible même si le réseau est coupé.
      }
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    clearSupportSessionMeta()

    window.close()
    // Fallback lorsque le navigateur refuse window.close().
    window.setTimeout(() => window.location.replace('/support-session?ended=1'), 150)
  }, [ending, meta?.id])

  useEffect(() => {
    if (!meta) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [meta])

  useEffect(() => {
    if (!meta) return
    if (new Date(meta.expires_at).getTime() <= now) {
      void closeSupport(false)
    }
  }, [closeSupport, meta, now])

  useEffect(() => {
    if (!meta) return
    const validate = async () => {
      const { data, error } = await supabase.rpc('support_validate_assisted_session', {
        support_session_id: meta.id,
      })
      if (error || !data) void closeSupport(false)
    }
    const timer = window.setInterval(validate, 15_000)
    return () => window.clearInterval(timer)
  }, [closeSupport, meta])

  if (!meta) return null

  return (
    <div style={{
      position: 'fixed',
      inset: '0 0 auto',
      zIndex: 9500,
      minHeight: 52,
      background: '#b42318',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '8px 16px',
      boxShadow: '0 4px 20px rgba(0,0,0,.45)',
      fontFamily: 'var(--vl-mono)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em' }}>
          ● SESSION ASSISTÉE — TU AGIS COMME {meta.target_name || meta.target_email || 'CET UTILISATEUR'}
        </div>
        <div style={{ marginTop: 2, fontSize: 9.5, opacity: .88, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Présence et accord déclarés par l’admin · {meta.reason} · fermeture automatique dans {remainingLabel(meta.expires_at, now)}
        </div>
      </div>
      <button
        onClick={() => { void closeSupport(true) }}
        disabled={ending}
        style={{
          flexShrink: 0,
          border: '1px solid rgba(255,255,255,.75)',
          borderRadius: 7,
          background: '#fff',
          color: '#7a1410',
          padding: '6px 11px',
          cursor: ending ? 'wait' : 'pointer',
          fontFamily: 'var(--vl-mono)',
          fontSize: 9.5,
          fontWeight: 900,
        }}
      >
        {ending ? 'FERMETURE…' : 'QUITTER L’ASSISTANCE'}
      </button>
    </div>
  )
}
