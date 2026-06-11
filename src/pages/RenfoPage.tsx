import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useRunningDUPOverride } from '../lib/coach/useRunningDUPOverride'
import { useVLStore } from '../store/vlStore'
import {
  computeCoPerioWarnings, computeImpactZone,
  get4WeekPhase, DUP4_LABELS, DUP4_COLORS,
  type SessionLog,
} from '../lib/renfoUtils'
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../lib/renfoData'
import { syncStravaRenfo } from '../lib/syncStravaRenfo'

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

  // Rattrapage : importe les séances de renfo déjà sur Strava (musculation, yoga…)
  // que le webhook n'a jamais vues. Idempotent — ne ré-importe jamais une date loggée.
  useQuery({
    queryKey: ['renfo-strava-backfill', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const n = await syncStravaRenfo(user!.id)
      if (n > 0) {
        queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-7d'] })
        queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-dashboard'] })
      }
      return n
    },
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: sessionLogs = [] } = useQuery<SessionLog[]>({
    queryKey: ['renfo-session-logs-7d'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_session_log')
        .select('id,focus,duration_min,session_date,source')
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

  // Tag du type d'une séance (utile pour catégoriser les imports Strava « à catégoriser »).
  // Aucun garde-fou : la contrainte d'unicité a été levée → doubles séances autorisées.
  const focusMutation = useMutation({
    mutationFn: async ({ id, focus }: { id: string; focus: string }) => {
      const { error } = await supabase.from('renfo_session_log').update({ focus }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-7d'] })
      queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-dashboard'] })
    },
  })

  const warnings = computeCoPerioWarnings(activities as Parameters<typeof computeCoPerioWarnings>[0])
  const impact = computeImpactZone(sessionLogs)
  const dupOverride = useRunningDUPOverride()
  const phase = get4WeekPhase(dupOverride)

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

  // ── Données refonte ──
  // Séance suggérée : préférée par la co-pério d'abord, sinon la plus ancienne.
  const sortedFocuses = [...ALL_FOCUSES].sort((a, b) => {
    const ap = preferred.has(a) ? 0 : avoided.has(a) ? 2 : 1
    const bp = preferred.has(b) ? 0 : avoided.has(b) ? 2 : 1
    if (ap !== bp) return ap - bp
    const al = lastDateByFocus[a] ? new Date(lastDateByFocus[a]).getTime() : 0
    const bl = lastDateByFocus[b] ? new Date(lastDateByFocus[b]).getTime() : 0
    return al - bl
  })
  const suggested = sortedFocuses[0]
  const weekCount = new Set(sessionLogs.map((s) => s.session_date).filter(Boolean)).size
  const alertWarning = warnings.find((w) => w.severity === 'alert') ?? warnings[0] ?? null

  const PHASE_DESC: Record<string, string> = {
    force: 'Charges lourdes, peu de répétitions, longues récup — on entretient la force max sans empiéter sur la course.',
    volume: 'Plus de répétitions à charge modérée — on construit l’endurance de force.',
    puissance: 'Mouvements explosifs (pliométrie) — on transforme la force en vitesse.',
    deload: 'Semaine allégée — on récupère pour assimiler les blocs précédents.',
  }

  const FORCE_FOCUSES = ['force_lourde', 'pliometrie', 'excentrique', 'tronc'] as const
  const MOBILITE_FOCUSES = ['haut_corps', 'yoga_coureur', 'pilates_coureur', 'stretching'] as const

  const WCAL = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'] as const
  const now = new Date()
  const rhythm7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { label: WCAL[(d.getDay() + 6) % 7], has: sessionLogs.some((s) => s.session_date === ds), isToday: i === 6 }
  })

  function renderFocus(focus: string) {
    const meta = FOCUS_META[focus]
    if (!meta) return null
    const color = RENFO_FOCUS_COLORS[focus] ?? 'var(--color-renfo)'
    const lastDate = lastDateByFocus[focus]
    const isPreferred = preferred.has(focus)
    const isAvoided = avoided.has(focus)
    return (
      <Link key={focus} to={`/renfo/session/${focus}`} style={{ textDecoration: 'none' }}>
        <div className="rfoc" style={{ borderTop: `3px solid ${color}`, opacity: isAvoided ? 0.45 : 1 }}>
          <div className="rfoc-n" style={{ color }}>{meta.label}</div>
          <div className="rfoc-m">{meta.duration_min} min{lastDate ? ` · ${fmtLastDate(lastDate)}` : ' · jamais'}</div>
          {isPreferred && <span className="rfoc-rec">★ Recommandé</span>}
          {isAvoided && <span className="rfoc-avoid">évité cette semaine</span>}
        </div>
      </Link>
    )
  }

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1rem' }}>RENFORCEMENT</div>

      {/* ── 1 · HÉROS : l'intelligence co-périodisation ── */}
      <div className="rhero">
        <div className="rhero-kic">Co-périodisation · semaine en cours</div>
        <div className="rhero-phase" style={{ color: DUP4_COLORS[phase] }}>Bloc {DUP4_LABELS[phase]}</div>
        <div className="rhero-desc">{PHASE_DESC[phase] ?? ''}</div>
        {alertWarning && (
          <div className="rcoperio" style={{ borderColor: `color-mix(in oklab, ${alertWarning.severity === 'alert' ? 'var(--vl-ember)' : 'var(--vl-amber)'} 35%, transparent)` }}>
            <span className="rcoperio-ic" style={{ color: alertWarning.severity === 'alert' ? 'var(--vl-ember)' : 'var(--vl-amber)' }}>⚡</span>
            <span className="rcoperio-tx">{alertWarning.message}</span>
          </div>
        )}
        <div className="rhero-foot">
          <div className="rstat"><div className="rstat-v" style={{ color: 'var(--color-renfo)' }}>{weekCount}</div><div className="rstat-l">Séances · 7 j</div></div>
          <div className="rstat"><div className="rstat-v" style={{ color: impact.color }}>{impact.label}</div><div className="rstat-l">Charge 7 j</div></div>
          <div className="rstat"><div className="rstat-v" style={{ color: DUP4_COLORS[phase] }}>{DUP4_LABELS[phase]}</div><div className="rstat-l">Phase DUP</div></div>
        </div>
      </div>

      {/* ── 2 · SUGGÉRÉ MAINTENANT (proposition, pas prescription) ── */}
      {suggested && FOCUS_META[suggested] && (
        <div className="rsuggest">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rsuggest-l">Suggéré maintenant · d'après ta charge</div>
            <div className="rsuggest-n">{FOCUS_META[suggested].label}</div>
            <div className="rsuggest-d">{FOCUS_META[suggested].duration_min} min{preferred.has(suggested) ? ' · privilégié par la co-périodisation' : ''}</div>
          </div>
          <span className="rsuggest-alt">…ou choisis librement ci-dessous ↓</span>
          <Link to={`/renfo/session/${suggested}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <button className="hbtn hbtn-go">Démarrer</button>
          </Link>
        </div>
      )}

      {/* ── 3 · BIBLIOTHÈQUE par catégorie ── */}
      <div className="rcat-h">Force &amp; puissance</div>
      <div className="rfocgrid">{FORCE_FOCUSES.map(renderFocus)}</div>
      <div className="rcat-h">Mobilité &amp; prévention</div>
      <div className="rfocgrid">{MOBILITE_FOCUSES.map(renderFocus)}</div>

      {/* ── 4 · RYTHME hebdo ── */}
      <div className="rrhythm">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="clabel" style={{ marginBottom: 10 }}>7 derniers jours</div>
          <div className="rcal">
            {rhythm7.map((d, i) => (
              <div key={i} className="rcal-c">
                <div className="rcal-bx" style={{
                  background: d.has ? 'color-mix(in oklab, var(--color-renfo) 38%, transparent)' : 'transparent',
                  borderColor: d.isToday ? 'var(--color-renfo)' : 'var(--vl-line)',
                }} />
                <div className="rcal-l" style={{ color: d.isToday ? 'var(--color-renfo)' : 'var(--vl-text-3)' }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rring">
          <div className="rring-v">{weekCount}</div>
          <div className="rring-l">séances · 7 j</div>
        </div>
      </div>

      {/* ── Liens secondaires ── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '1.5rem 0 2rem' }}>
        <Link to="/renfo/library"><button className="hbtn">BIBLIOTHÈQUE COMPLÈTE</button></Link>
        <Link to="/profile/settings"><button className="hbtn">RÉGLAGES ÉQUIPEMENT</button></Link>
      </div>

      {/* ── Historique 7 jours — gestion séances ─────────────────────────── */}
      {sessionLogs.length > 0 && (
        <div className="card">
          <div className="clabel" style={{ marginBottom: '0.75rem' }}>SÉANCES RÉCENTES</div>
          {sessionLogs.some((s) => !s.focus) && (
            <div style={{ fontSize: 11, color: 'var(--vl-amber)', marginBottom: '0.6rem', lineHeight: 1.5 }}>
              {sessionLogs.filter((s) => !s.focus).length} séance(s) importée(s) à catégoriser — choisis le type ci-dessous pour qu'elles nourrissent l'algo.
            </div>
          )}
          {sessionLogs.map((s) => {
            const isEditing = editingId === s.id
            const isConfirming = confirmDeleteId === s.id
            const isStrava = s.source === 'strava'
            const uncategorized = !s.focus
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 8px 8px', borderBottom: '1px solid var(--vl-line)', borderLeft: uncategorized ? '2px solid var(--vl-amber)' : '2px solid transparent', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      value={s.focus ?? ''}
                      onChange={(e) => s.id && focusMutation.mutate({ id: s.id, focus: e.target.value })}
                      style={{
                        fontFamily: 'var(--vl-mono)', fontSize: 11, padding: '3px 6px', borderRadius: 4,
                        background: uncategorized ? 'color-mix(in oklab, var(--vl-amber) 14%, transparent)' : 'var(--vl-surf-2)',
                        border: `1px solid ${uncategorized ? 'var(--vl-amber)' : 'var(--vl-line)'}`, color: 'var(--vl-text)',
                      }}
                    >
                      <option value="" disabled>À catégoriser…</option>
                      {ALL_FOCUSES.map((f) => (
                        <option key={f} value={f}>{(FOCUS_META as Record<string, { label?: string }>)[f]?.label ?? f}</option>
                      ))}
                    </select>
                    {isStrava && (
                      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: '#FC4C02', background: '#FC4C0218', borderRadius: 3, padding: '1px 5px', letterSpacing: '.04em', flexShrink: 0 }}>
                        Strava
                      </span>
                    )}
                  </div>
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
