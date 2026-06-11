import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import { useRunningDUPOverride } from '../../lib/coach/useRunningDUPOverride'
import {
  computeCoPerioWarnings, computeImpactZone,
  get4WeekPhase, DUP4_LABELS, DUP4_COLORS,
  type SessionLog,
} from '../../lib/renfoUtils'
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../../lib/renfoData'
import { RENFO_FOCUS_SHORT, type RenfoFusion } from '../../lib/coach/renfoFusion'
import { syncStravaRenfo } from '../../lib/syncStravaRenfo'
import Collapsible from '../Collapsible'

// ─── Le renfo vit ICI, dans la page Coach — pas de page hub séparée. ──────────
// Hérité de l'ancienne RenfoPage (dissoute) : co-périodisation, suggestion,
// bibliothèque par focus et gestion des séances récentes (liaison Strava).

const ALL_FOCUSES = [
  'force_lourde','pliometrie','excentrique','tronc',
  'haut_corps','yoga_coureur','pilates_coureur','stretching',
] as const

const FORCE_FOCUSES = ['force_lourde', 'pliometrie', 'excentrique', 'tronc'] as const
const MOBILITE_FOCUSES = ['haut_corps', 'yoga_coureur', 'pilates_coureur', 'stretching'] as const

const PHASE_DESC: Record<string, string> = {
  force: 'Charges lourdes, peu de répétitions, longues récup — on entretient la force max sans empiéter sur la course.',
  volume: 'Plus de répétitions à charge modérée — on construit l’endurance de force.',
  puissance: 'Mouvements explosifs (pliométrie) — on transforme la force en vitesse.',
  deload: 'Semaine allégée — on récupère pour assimiler les blocs précédents.',
}

export default function RenfoSection({ fusion }: { fusion: RenfoFusion | null }) {
  const { user } = useVLStore()
  const queryClient = useQueryClient()

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
      queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-dashboard'] })
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
      queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-dashboard'] })
    },
  })

  // Tag du type d'une séance (utile pour catégoriser les imports Strava « à catégoriser »).
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

  const lastDateByFocus: Record<string, string> = {}
  for (const s of sessionLogs) {
    if (s.focus && s.session_date && !lastDateByFocus[s.focus]) {
      lastDateByFocus[s.focus] = s.session_date
    }
  }

  const preferred = new Set(warnings.flatMap((w) => w.prefer))
  const avoided = new Set(warnings.flatMap((w) => w.avoid))

  function fmtLastDate(iso: string) {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    return `il y a ${diff}j`
  }

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
  const uncategorized = sessionLogs.filter((s) => !s.focus).length

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
    <div data-tour="coach-renfo" style={{ marginTop: 24 }}>
      <div className="coach-block-h">
        <span className="coach-block-ttl">RENFORCEMENT</span>
        <span className="coach-block-sub">Co-périodisé avec ta course · bloc {DUP4_LABELS[phase]}</span>
      </div>

      {/* ── Phase + co-périodisation ── */}
      <div className="card" style={{ marginBottom: '1rem', padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, color: DUP4_COLORS[phase] }}>
            Bloc {DUP4_LABELS[phase]}
          </div>
          <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
            <span><strong style={{ color: 'var(--color-renfo)', fontSize: 12 }}>{weekCount}</strong> SÉANCES · 7 J</span>
            <span><strong style={{ color: impact.color, fontSize: 12 }}>{impact.label}</strong> CHARGE · 7 J</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--vl-text-3)', lineHeight: 1.5, marginTop: 4 }}>{PHASE_DESC[phase] ?? ''}</div>
        {alertWarning && (
          <div style={{ marginTop: 8, padding: '6px 9px', borderLeft: `3px solid ${alertWarning.severity === 'alert' ? 'var(--vl-ember)' : 'var(--vl-amber)'}`, fontSize: 12, color: 'var(--vl-text-2)', lineHeight: 1.5 }}>
            ⚡ {alertWarning.message}
          </div>
        )}
      </div>

      {/* ── Cette semaine : slots fusionnés autour des séances course ── */}
      {fusion && fusion.slots.length > 0 && (
        <div className="card" style={{ padding: '12px 14px', marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: 8 }}>CETTE SEMAINE · AUTOUR DE TES SÉANCES COURSE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fusion.slots.map((sl, i) => (
              <Link key={i} to={`/renfo/session/${sl.focus}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, color: 'var(--vl-text-3)', minWidth: 30, textTransform: 'uppercase', paddingTop: 2 }}>
                  {['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][sl.dayOfWeek]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--vl-text)' }}>
                    {RENFO_FOCUS_SHORT[sl.focus] ?? sl.focus}
                    {sl.heavy ? <span style={{ marginLeft: 6, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', letterSpacing: '.05em' }}>LOURD</span> : null}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--vl-text-3)', lineHeight: 1.45, marginTop: 1 }}>{sl.rationale}</div>
                </div>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-ember)', letterSpacing: '.08em', flexShrink: 0, paddingTop: 3 }}>
                  LANCER →
                </span>
              </Link>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--vl-text-3)', lineHeight: 1.5, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--vl-line)' }}>
            {fusion.note}
          </div>
        </div>
      )}

      {/* ── Suggéré maintenant (proposition, pas prescription) ── */}
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

      {/* ── Bibliothèque par catégorie : tu choisis librement ── */}
      <div className="rcat-h">Force &amp; puissance</div>
      <div className="rfocgrid">{FORCE_FOCUSES.map(renderFocus)}</div>
      <div className="rcat-h">Mobilité &amp; prévention</div>
      <div className="rfocgrid">{MOBILITE_FOCUSES.map(renderFocus)}</div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '1rem 0 1.25rem' }}>
        <Link to="/renfo/library"><button className="hbtn">BIBLIOTHÈQUE COMPLÈTE</button></Link>
        <Link to="/profile/settings"><button className="hbtn">RÉGLAGES ÉQUIPEMENT</button></Link>
      </div>

      {/* ── Séances récentes : gestion + liaison des imports Strava ── */}
      {sessionLogs.length > 0 && (
        <Collapsible
          title={uncategorized > 0 ? `SÉANCES RÉCENTES · ${uncategorized} À RELIER` : 'SÉANCES RÉCENTES · 7 JOURS'}
          defaultOpen={uncategorized > 0}
        >
          {uncategorized > 0 && (
            <div style={{ fontSize: 11, color: 'var(--vl-amber)', margin: '0.6rem 0', lineHeight: 1.5 }}>
              {uncategorized} séance(s) importée(s) de Strava à catégoriser — choisis le type ci-dessous pour qu'elles nourrissent l'algo.
            </div>
          )}
          {sessionLogs.map((s) => {
            const isEditing = editingId === s.id
            const isConfirming = confirmDeleteId === s.id
            const isStrava = s.source === 'strava'
            const notCategorized = !s.focus
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 8px 8px', borderBottom: '1px solid var(--vl-line)', borderLeft: notCategorized ? '2px solid var(--vl-amber)' : '2px solid transparent', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      value={s.focus ?? ''}
                      onChange={(e) => s.id && focusMutation.mutate({ id: s.id, focus: e.target.value })}
                      style={{
                        fontFamily: 'var(--vl-mono)', fontSize: 11, padding: '3px 6px', borderRadius: 4,
                        background: notCategorized ? 'color-mix(in oklab, var(--vl-amber) 14%, transparent)' : 'var(--vl-surf-2)',
                        border: `1px solid ${notCategorized ? 'var(--vl-amber)' : 'var(--vl-line)'}`, color: 'var(--vl-text)',
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
        </Collapsible>
      )}
    </div>
  )
}
