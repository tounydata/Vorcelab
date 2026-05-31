import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import {
  computeCoPerioWarnings, computeImpactZone,
  get4WeekPhase, DUP4_LABELS, DUP4_COLORS,
  type SessionLog,
} from '../lib/renfoUtils'
// @ts-ignore
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../lib/renfoData'

const ALL_FOCUSES = [
  'force_lourde','pliometrie','excentrique','tronc',
  'haut_corps','yoga_coureur','pilates_coureur','stretching',
] as const

export default function RenfoPage() {
  const { user } = useVLStore()

  const { data: activities = [] } = useQuery({
    queryKey: ['activities-copério'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('strava_activities')
        .select('start_date_local,type,sport_type,distance,moving_time,total_elevation_gain')
        .gte('start_date_local', cutoff)
        .order('start_date_local', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: sessionLogs = [] } = useQuery<SessionLog[]>({
    queryKey: ['renfo-session-logs-7d'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_session_log')
        .select('id,focus,duration_min,session_date')
        .eq('user_id', user!.id)
        .gte('session_date', cutoff)
        .order('session_date', { ascending: false })
      return (data ?? []) as SessionLog[]
    },
    enabled: !!user,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('renfo_session_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setConfirmDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-7d'] })
    },
  })

  const updateDateMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
      const dayKey = DAY_KEYS[new Date(date + 'T12:00:00').getDay()]
      const { error } = await supabase.from('renfo_session_log').update({ session_date: date, day_key: dayKey }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingId(null)
      queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-7d'] })
    },
  })

  const warnings = computeCoPerioWarnings(activities as Parameters<typeof computeCoPerioWarnings>[0])
  const impact = computeImpactZone(sessionLogs)
  const phase = get4WeekPhase()

  // Last session date per focus
  const lastDateByFocus: Record<string, string> = {}
  for (const s of sessionLogs) {
    if (s.focus && s.session_date && !lastDateByFocus[s.focus]) {
      lastDateByFocus[s.focus] = s.session_date
    }
  }

  // Focuses preferred by co-pério
  const preferred = new Set(warnings.flatMap((w) => w.prefer))
  const avoided = new Set(warnings.flatMap((w) => w.avoid))

  function fmtLastDate(iso: string) {
    const d = new Date(iso)
    const diff = Math.round((Date.now() - d.getTime()) / 86400000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    return `il y a ${diff}j`
  }

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1.5rem' }}>RENFORCEMENT</div>

      {/* ── Co-pério warnings ────────────────────────────────────────────── */}
      {warnings.map((w, i) => (
        <div key={i} className="card" style={{
          marginBottom: '0.75rem',
          borderLeft: `3px solid ${w.severity === 'alert' ? 'var(--vl-ember)' : w.severity === 'warn' ? 'var(--vl-amber)' : 'var(--vl-growth)'}`,
        }}>
          <div className="mlabel" style={{ color: w.severity === 'alert' ? 'var(--vl-ember)' : w.severity === 'warn' ? 'var(--vl-amber)' : 'var(--vl-text-3)' }}>
            {w.severity === 'alert' ? '⚠ ALERTE' : w.severity === 'warn' ? '⚡ ATTENTION' : 'ℹ INFO'}
          </div>
          <div className="mlabel" style={{ marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>{w.message}</div>
        </div>
      ))}

      {/* ── DUP badge + impact ────────────────────────────────────────────── */}
      <div className="strip" style={{ marginBottom: '1.5rem' }}>
        <div className="scell" style={{ gridColumn: 'span 3' }}>
          <div className="sval" style={{ color: DUP4_COLORS[phase], fontSize: '1.1rem' }}>{DUP4_LABELS[phase]}</div>
          <div className="slbl">Phase DUP</div>
        </div>
        <div className="scell" style={{ gridColumn: 'span 3' }}>
          <div className="sval" style={{ color: impact.color, fontSize: '1.1rem' }}>{impact.label}</div>
          <div className="slbl">Charge 7j</div>
        </div>
      </div>

      {/* ── Focus grid ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
        {ALL_FOCUSES.map((focus) => {
          const meta = FOCUS_META[focus]
          if (!meta) return null
          const color = RENFO_FOCUS_COLORS[focus] ?? '#7c3aed'
          const lastDate = lastDateByFocus[focus]
          const isPreferred = preferred.has(focus)
          const isAvoided = avoided.has(focus)
          return (
            <Link
              key={focus}
              to={`/renfo/session/${focus}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="card" style={{
                borderLeft: `3px solid ${color}`,
                opacity: isAvoided ? 0.45 : 1,
                position: 'relative',
                minHeight: 96,
              }}>
                {isPreferred && (
                  <div className="mlabel" style={{ color, marginBottom: 4 }}>★ Recommandé</div>
                )}
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '0.95rem', color, lineHeight: 1.2, marginBottom: 4 }}>
                  {meta.label}
                </div>
                <div className="mlabel">{meta.duration_min} min</div>
                {lastDate && (
                  <div className="mlabel" style={{ marginTop: 4, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                    {fmtLastDate(lastDate)}
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Liens secondaires ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <Link to="/renfo/library"><button className="hbtn">BIBLIOTHÈQUE</button></Link>
        <Link to="/renfo/settings"><button className="hbtn">RÉGLAGES ÉQUIPEMENT</button></Link>
      </div>

      {/* ── Historique 7 jours — gestion séances ─────────────────────────── */}
      {sessionLogs.length > 0 && (
        <div className="card">
          <div className="clabel" style={{ marginBottom: '0.75rem' }}>SÉANCES RÉCENTES</div>
          {sessionLogs.map((s) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const meta = (FOCUS_META as Record<string, any>)[s.focus]
            const isEditing = editingId === s.id
            const isConfirming = confirmDeleteId === s.id
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--vl-line)', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>{meta?.label ?? s.focus}</div>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                      <input
                        type="date"
                        defaultValue={s.session_date}
                        onChange={(e) => setEditDate(e.target.value)}
                        style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 4, padding: '3px 6px', color: 'var(--vl-text)' }}
                      />
                      <button className="hbtn" style={{ fontSize: 10, padding: '3px 8px' }}
                        onClick={() => editDate && s.id && updateDateMutation.mutate({ id: s.id, date: editDate })}>
                        OK
                      </button>
                      <button className="hbtn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  ) : (
                    <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>
                      {s.session_date ? new Date(s.session_date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
                      {s.duration_min ? ` · ${s.duration_min} min` : ''}
                    </div>
                  )}
                </div>
                {!isEditing && !isConfirming && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="hbtn" style={{ fontSize: 10, padding: '3px 8px' }}
                      onClick={() => { setEditingId(s.id ?? null); setEditDate(s.session_date ?? '') }}>
                      Date
                    </button>
                    <button className="hbtn" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--vl-ember)', borderColor: 'var(--vl-ember)' }}
                      onClick={() => setConfirmDeleteId(s.id ?? null)}>
                      Suppr.
                    </button>
                  </div>
                )}
                {isConfirming && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    <span className="mlabel" style={{ color: 'var(--vl-text-2)', textTransform: 'none', letterSpacing: 0 }}>Confirmer ?</span>
                    <button className="hbtn" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--vl-ember)', borderColor: 'var(--vl-ember)' }}
                      onClick={() => s.id && deleteMutation.mutate(s.id)}>
                      Oui
                    </button>
                    <button className="hbtn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setConfirmDeleteId(null)}>Non</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
