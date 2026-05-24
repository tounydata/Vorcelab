import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import {
  epley1RM, getBestVariant, buildSession, generateWeekSchedule,
  getDUPPhase, DUP_PHASE_LABELS, applyDUP,
  weeklyImpactScore, weeklyImpactZone,
  type RenfoProfile, type RenfoSession, type RenfoExerciseSlot, type WeekSchedule,
} from '../utils/renfoAlgo'
// @ts-ignore
import { RENFO_EXERCISES, RENFO_FOCUS_COLORS, FOCUS_META, INTER_SET_REST, getExerciseGifUrl, fmtRest } from '../../renfo-data.js'

// ── Types ──────────────────────────────────────────────────────────────────

type RenfoView = 'home' | 'onboarding' | 'session' | 'settings'

interface CompletedExo {
  variantId: string; loadType: string; loadKg: number | null
  reps: number | null; rpe: number | null; logged_at: string; auto_completed?: boolean
}

interface SessionState {
  dayKey: string; session: RenfoSession
  exoIdx: number; serieIdx: number; startTime: number
  suggestions: Record<string, number>; location: 'salle' | 'maison'; alreadyDone: boolean
  phase: 'warmup' | 'exercise'
}

interface RestState {
  remaining: number; total: number; nextLabel: string | null; type: 'set' | 'exo'
  onDismiss: () => void
}

interface LogPopup {
  exerciseId: string; variantId: string; loadType: string
  prefillLoad: number | null; afterLog: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentWeekStartStr() {
  const t = new Date(); const ws = new Date(t)
  ws.setDate(t.getDate() - ((t.getDay() + 6) % 7)); ws.setHours(0, 0, 0, 0)
  return localDateStr(ws)
}

function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}
function fmtTimer(s: number) {
  const m = Math.floor(s / 60), r = s % 60; return m > 0 ? `${m}:${r.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`
}

const WARMUP: Record<string, string> = {
  force_lourde: 'Footing léger 3min → montées de genoux 30s → talons-fesses 30s → squat profond ×10 → rotation de buste ×10/côté',
  pliometrie: 'Footing léger 3min → skip ×20m → sauts à cloche-pied ×10/côté → squat sauté ×5 → cercles chevilles ×10',
  excentrique: 'Vélo ou marche rapide 5min → étirements dynamiques mollets → nordic curl partiel ×5 → hip flexor stretch 30s/côté',
  tronc: 'Marche rapide 3min → rotations de buste ×10 → cat-cow ×10 → planche 20s×2 → bird-dog ×5/côté',
  haut_corps: "Footing léger 2min → cercles d'épaules ×10 → pompes légères ×5 → face pull élastique ×10 → bras croisés 30s/côté",
}
const NO_WARMUP = ['mobilite', 'yoga_coureur', 'stretching']
const EQ_LABELS: Record<string, string> = { barbell: 'Barre + disques', leg_press: 'Presse à cuisses', bench: 'Banc', pullup_bar: 'Barre de traction', step: 'Step / marche', anchor_point: "Point d'ancrage", bands: 'Élastiques', dumbbells: 'Haltères', kettlebell: 'Kettlebell' }
const FOCUS_SUBS: Record<string, string> = { force_lourde: 'squat, soulevé, step-up', pliometrie: 'bondissements, sauts', excentrique: 'descentes, freinages', excentrique_pliometrie: 'descentes, bondissements', tronc: 'gainage, anti-rotation', haut_corps: 'tractions, pompes', mobilite: 'hanches, chevilles', yoga_coureur: 'poses, étirements profonds', stretching: 'mollets, ischio, piriforme' }

async function fetchSuggestNextLoad(userId: string, exerciseId: string): Promise<number | null> {
  const { data } = await supabase.from('renfo_exercise_log').select('load_kg,rpe,completed_all_reps').eq('user_id', userId).eq('exercise_id', exerciseId).order('session_date', { ascending: false }).limit(3)
  if (!data?.length || !data[0].load_kg) return null
  const last = data[0]
  if (!last.completed_all_reps) return data.length >= 2 && !data[1].completed_all_reps ? Math.round(last.load_kg * 0.95 / 1.25) * 1.25 : last.load_kg
  if (last.rpe <= 7) { const raw = last.load_kg * 1.04; return last.load_kg + Math.max(1.25, Math.round((raw - last.load_kg) / 1.25) * 1.25) }
  if (last.rpe === 8) return last.load_kg
  if (last.rpe === 9) return Math.round(last.load_kg * 0.975 / 1.25) * 1.25
  return Math.round(last.load_kg * 0.95 / 1.25) * 1.25
}

function playBip(ctxRef: React.MutableRefObject<AudioContext | null>, freq = 880) {
  try {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const ctx = ctxRef.current; ctx.state === 'suspended' && ctx.resume()
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = freq; gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.start(); osc.stop(ctx.currentTime + 0.18)
  } catch { /* no audio */ }
}

// ── RenfoPage ─────────────────────────────────────────────────────────────

export function RenfoPage() {
  const user = useVLStore(s => s.user)
  const qc = useQueryClient()
  const [view, setView] = useState<RenfoView>('home')
  const [sess, setSess] = useState<SessionState | null>(null)
  const [restState, setRestState] = useState<RestState | null>(null)
  const [logPopup, setLogPopup] = useState<LogPopup | null>(null)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [completionDate, setCompletionDate] = useState(localDateStr())
  const completedExosRef = useRef<Record<string, CompletedExo>>({})
  const audioCtxRef = useRef<AudioContext | null>(null)
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: profile, isLoading: profLoading } = useQuery({
    queryKey: ['renfo_profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('renfo_profile').select('*').eq('user_id', user!.id).maybeSingle()
      return data as RenfoProfile | null
    },
    enabled: !!user,
  })

  const { data: program } = useQuery({
    queryKey: ['renfo_program', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('renfo_program').select('*').eq('user_id', user!.id).maybeSingle()
      return data as { week_schedule: WeekSchedule } | null
    },
    enabled: !!user && !!profile?.onboarding_completed,
  })

  const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  const { data: sessionLogs = [] } = useQuery({
    queryKey: ['renfo_logs', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('renfo_session_log').select('*').eq('user_id', user!.id).gte('session_date', cutoff14).order('session_date', { ascending: false })
      return (data || []) as Array<{ session_date: string; day_key: string; completed_exercises: Record<string, CompletedExo> }>
    },
    enabled: !!user && !!profile?.onboarding_completed,
  })

  const { data: warnings = [] } = useQuery({
    queryKey: ['copério', user?.id],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
      const { data: acts } = await supabase.from('strava_activities').select('start_date_local,distance,moving_time,total_elevation_gain').eq('user_id', user!.id).gte('start_date_local', cutoff).order('start_date_local', { ascending: false })
      if (!acts?.length) return []
      const ws: Array<{ message: string; severity: string }> = []; const seen: Record<string, boolean> = {}; const now = Date.now()
      for (const a of acts) {
        const daysAgo = Math.round((now - new Date(a.start_date_local).getTime()) / 86400000)
        const km = (a.distance || 0) / 1000; const dp = a.total_elevation_gain || 0; const pace = km > 0 ? (a.moving_time / 60) / km : 99
        if (!seen['avoid_force'] && daysAgo <= 2 && km > 15) { ws.push({ severity: 'warn', message: `Sortie longue ${km.toFixed(0)}km → évite force lourde et pliométrie` }); seen['avoid_force'] = true }
        if (!seen['post_long'] && daysAgo <= 3 && (km > 25 || dp > 1500)) { ws.push({ severity: 'alert', message: `Course exigeante ${km.toFixed(0)}km / D+${dp}m → priorité récupération` }); seen['post_long'] = true }
        if (!seen['quality'] && daysAgo <= 1 && km > 3 && pace < 5) { ws.push({ severity: 'info', message: `Séance rapide hier (${pace.toFixed(2)} min/km) → préfère tronc ou yoga` }); seen['quality'] = true }
      }
      return ws
    },
    enabled: !!user && !!profile?.onboarding_completed,
    staleTime: 5 * 60 * 1000,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ prof, sched }: { prof: RenfoProfile; sched: WeekSchedule }) => {
      await supabase.from('renfo_profile').upsert({ ...prof, user_id: user!.id })
      await supabase.from('renfo_program').upsert({ user_id: user!.id, week_schedule: sched, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['renfo_profile', user?.id] }); qc.invalidateQueries({ queryKey: ['renfo_program', user?.id] }); setView('home') },
  })

  const completeMutation = useMutation({
    mutationFn: async ({ dayKey, dateStr }: { dayKey: string; dateStr: string }) => {
      // Auto-complete unchecked exercises
      const completed = { ...completedExosRef.current }
      if (sess) {
        sess.session.exercises.forEach(exo => {
          if (!completed[exo.exercise_id]) completed[exo.exercise_id] = { variantId: exo.variant_id, loadType: exo.load_type, loadKg: null, reps: null, rpe: null, logged_at: new Date().toISOString(), auto_completed: true }
        })
      }
      const { data: prev } = await supabase.from('renfo_session_log').select('completed_exercises').eq('user_id', user!.id).eq('session_date', dateStr).maybeSingle()
      const merged = prev ? { ...(prev.completed_exercises || {}), ...completed } : completed
      await supabase.from('renfo_session_log').upsert({ user_id: user!.id, session_date: dateStr, day_key: dayKey, completed_exercises: merged }, { onConflict: 'user_id,session_date' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['renfo_logs', user?.id] }); completedExosRef.current = {}; setSess(null); setCompletionOpen(false); setView('home') },
  })

  // Rest timer tick
  useEffect(() => {
    if (!restState) return
    if (restIntervalRef.current) clearInterval(restIntervalRef.current)
    restIntervalRef.current = setInterval(() => {
      setRestState(prev => {
        if (!prev) return prev
        const next = prev.remaining - 1
        if (next <= 3 && next > 0) playBip(audioCtxRef, next === 1 ? 1200 : 880)
        if (next <= 0) { clearInterval(restIntervalRef.current!); navigator.vibrate?.([100, 50, 100, 50, 200]); prev.onDismiss(); return null }
        return { ...prev, remaining: next }
      })
    }, 1000)
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current) }
  }, [restState?.remaining === restState?.total]) // only restart when a new timer begins (total resets)

  // Log popup handler — writes to DB then calls afterLog
  const handleLogClose = useCallback(async (data: { loadKg: number | null; reps: number | null; rpe: number } | null) => {
    if (!logPopup || !user) return
    const { exerciseId, variantId, loadType, afterLog } = logPopup
    setLogPopup(null)
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exoDef = (RENFO_EXERCISES as any)[exerciseId]
      const targetReps = exoDef?.variants?.find((v: { id: string }) => v.id === variantId)?.default_reps ?? null
      const e1rm = (data.loadKg && data.reps) ? epley1RM(data.loadKg, data.reps) : null
      completedExosRef.current[exerciseId] = { variantId, loadType, loadKg: data.loadKg, reps: data.reps, rpe: data.rpe, logged_at: new Date().toISOString() }
      await supabase.from('renfo_exercise_log').insert({ user_id: user.id, session_date: localDateStr(), exercise_id: exerciseId, variant_id: variantId, load_kg: data.loadKg, reps_completed: data.reps, reps_target: targetReps, rpe: data.rpe, e1rm, load_type: loadType, completed_all_reps: data.reps !== null && targetReps !== null ? data.reps >= targetReps : null })
      if (e1rm) await supabase.from('renfo_max_lifts').upsert({ user_id: user.id, exercise_id: exerciseId, one_rm: e1rm, is_estimated: true, recorded_at: new Date().toISOString() }, { onConflict: 'user_id,exercise_id' })
      qc.invalidateQueries({ queryKey: ['renfo_logs', user.id] })
    }
    afterLog()
  }, [logPopup, user, qc])

  const startSession = useCallback(async (dayKey: string) => {
    const sched = program?.week_schedule; if (!sched || !profile) return
    let session = sched[dayKey] as RenfoSession
    if (!session || (session as { rest?: boolean }).rest) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(FOCUS_META as any)[dayKey]) return
      session = buildSession(dayKey, profile)
    }
    session = applyDUP(session)
    const suggestions: Record<string, number> = {}
    await Promise.all(session.exercises.filter(e => e.load_type === 'external_kg').map(async e => {
      const kg = await fetchSuggestNextLoad(user!.id, e.exercise_id)
      if (kg !== null) suggestions[e.exercise_id] = kg
    }))
    const ws = new Date(); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7)); ws.setHours(0, 0, 0, 0)
    const alreadyDone = session.focus !== 'mobilite' && sessionLogs.some(l => {
      const lf = (sched[l.day_key] as RenfoSession)?.focus || l.day_key
      return new Date(l.session_date) >= ws && lf === session.focus
    })
    completedExosRef.current = {}
    setSess({ dayKey, session, exoIdx: 0, serieIdx: 0, startTime: Date.now(), suggestions, location: 'salle', alreadyDone, phase: NO_WARMUP.includes(session.focus) ? 'exercise' : 'warmup' })
    setView('session')
  }, [program, profile, sessionLogs, user])

  const openRestTimer = useCallback((seconds: number, type: 'set' | 'exo', nextLabel: string | null, onDismiss: () => void) => {
    setRestState({ remaining: seconds, total: seconds, nextLabel, type, onDismiss })
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  if (profLoading) return <div style={{ padding: 40, fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)', textAlign: 'center' }}>Chargement…</div>

  if (!profile?.onboarding_completed) return <Onboarding onSave={saveMutation.mutate} saving={saveMutation.isPending} />

  const renderMain = () => {
    if (view === 'settings') return <Settings profile={profile} onSave={saveMutation.mutate} saving={saveMutation.isPending} onBack={() => setView('home')} />
    if (view === 'session' && sess) return (
      <SessionView sess={sess} onChange={setSess} audioCtxRef={audioCtxRef}
        onLogPopup={setLogPopup} onOpenRest={openRestTimer}
        onComplete={() => { setCompletionDate(localDateStr()); setCompletionOpen(true) }}
        onBack={() => { setSess(null); setView('home') }} />
    )
    return (
      <HomeView profile={profile} program={program?.week_schedule || null} sessionLogs={sessionLogs}
        warnings={warnings} onStartSession={startSession} onSettings={() => setView('settings')} />
    )
  }

  return (
    <>
      {renderMain()}
      {/* Rest timer overlay */}
      {restState && <RestOverlay rest={restState} onChange={setRestState} audioCtxRef={audioCtxRef} />}
      {/* Log popup */}
      {logPopup && <LogPopupSheet popup={logPopup} onClose={handleLogClose} />}
      {/* Completion picker */}
      {completionOpen && sess && (
        <CompletionPicker
          date={completionDate} onDateChange={setCompletionDate}
          onCancel={() => setCompletionOpen(false)}
          onConfirm={() => completeMutation.mutate({ dayKey: sess.dayKey, dateStr: completionDate })}
          saving={completeMutation.isPending}
        />
      )}
    </>
  )
}

// ── HomeView ───────────────────────────────────────────────────────────────

function HomeView({ profile, program, sessionLogs, warnings, onStartSession, onSettings }: {
  profile: RenfoProfile; program: WeekSchedule | null
  sessionLogs: Array<{ session_date: string; day_key: string }>
  warnings: Array<{ message: string; severity: string }>
  onStartSession: (dayKey: string) => void; onSettings: () => void
}) {
  const weekStart = currentWeekStartStr()
  const thisWeekLogs = sessionLogs.filter(l => l.session_date >= weekStart)
  const weekDoneFocuses = new Set(thisWeekLogs.map(l => (program?.[l.day_key] as RenfoSession)?.focus || l.day_key).filter(Boolean))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const focusMeta = FOCUS_META as any; const focusColors = RENFO_FOCUS_COLORS as any

  const allocatedFocuses = program
    ? [...new Set(Object.values(program).filter((s): s is RenfoSession => !!(s as RenfoSession).focus).map(s => s.focus))]
        .slice(0, profile.sessions_per_week)
    : []
  const focusToDayKey: Record<string, string> = {}
  if (program) Object.entries(program).forEach(([dk, s]) => { if ((s as RenfoSession).focus) focusToDayKey[(s as RenfoSession).focus] = dk })

  const focusCount30: Record<string, number> = {}
  sessionLogs.filter(l => Date.now() - new Date(l.session_date).getTime() <= 30 * 86400000).forEach(l => {
    const f = (program?.[l.day_key] as RenfoSession)?.focus || l.day_key
    if (f) focusCount30[f] = (focusCount30[f] || 0) + 1
  })

  const loadScore = weeklyImpactScore(thisWeekLogs.map(l => ({ focus: (program?.[l.day_key] as RenfoSession)?.focus || l.day_key, duration_min: (program?.[l.day_key] as RenfoSession)?.duration_min || 30 })))
  const loadZone = weeklyImpactZone(loadScore)
  const loadPct = Math.min(100, loadScore / 240 * 100)
  const dupPhase = getDUPPhase()

  return (
    <div style={{ maxWidth: 700, paddingBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>SEM. · {thisWeekLogs.length} SÉANCE{thisWeekLogs.length !== 1 ? 'S' : ''} FAITE{thisWeekLogs.length !== 1 ? 'S' : ''}</div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, marginTop: 2 }}>QU'EST-CE QU'ON FAIT ?</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.05em' }}>CHARGE 7J</div>
          <div style={{ marginTop: 4, width: 120, height: 5, background: 'var(--vl-bg)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${loadPct}%`, background: loadZone.color, borderRadius: 3 }} /></div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', marginTop: 3 }}>{loadScore} u · <span style={{ color: loadZone.color }}>{loadZone.label}</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.06em' }}>DUP SEMAINE</div>
        {DUP_PHASE_LABELS.map((l, i) => <div key={l} style={{ padding: '3px 8px', borderRadius: 4, fontFamily: 'var(--vl-mono)', fontSize: '.5rem', fontWeight: 700, background: i === dupPhase ? 'rgba(124,58,237,.2)' : 'transparent', border: `1px solid ${i === dupPhase ? '#7c3aed' : 'var(--vl-border)'}`, color: i === dupPhase ? '#7c3aed' : 'var(--vl-text-3)' }}>{l}</div>)}
      </div>

      {warnings.length > 0 && <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {warnings.map((w, i) => { const c = w.severity === 'alert' ? '#ef4444' : w.severity === 'warn' ? '#f59e0b' : '#3b82f6'; return <div key={i} style={{ padding: '8px 12px', background: `${c}18`, border: `1px solid ${c}50`, borderRadius: 8, fontFamily: 'var(--vl-mono)', fontSize: '.58rem', color: c, lineHeight: 1.4 }}>{w.message}</div> })}
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10, marginBottom: 16 }}>
        {allocatedFocuses.map(focus => {
          const meta = focusMeta[focus]; if (!meta) return null
          const color = focusColors[focus] || '#7c3aed'
          const dayKey = focusToDayKey[focus] || focus
          const done = weekDoneFocuses.has(focus)
          const chargePct = Math.min(100, (focusCount30[focus] || 0) / 4 * 100)
          return (
            <div key={focus} onClick={() => onStartSession(dayKey)}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 13, background: 'var(--vl-surf-2)', border: `1.5px solid ${done ? color + '60' : color + '40'}`, borderRadius: 12, cursor: 'pointer', position: 'relative' }}>
              <div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 700 }}>{meta.label}</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 3 }}>{FOCUS_SUBS[focus] || ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: '.75rem' }}>
                <div><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.05em' }}>DURÉE</div><div style={{ fontWeight: 600 }}>{meta.duration_min} min</div></div>
                <div><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.05em' }}>CHARGE 30J</div><div style={{ fontWeight: 600 }}>{focusCount30[focus] || 0}/4</div></div>
              </div>
              <div style={{ height: 4, background: 'var(--vl-bg)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: `${chargePct}%`, background: color, borderRadius: 2 }} /></div>
              <div style={{ padding: '8px 0', textAlign: 'center', border: `1.5px solid ${color}`, borderRadius: 8, fontFamily: 'var(--vl-display)', fontSize: '.82rem', fontWeight: 700, color }}>
                {done ? 'REFAIRE' : 'VOIR LA SÉANCE'}
              </div>
              {done && <div style={{ position: 'absolute', top: 10, right: 10, padding: '3px 8px', background: `${color}20`, borderRadius: 4, fontFamily: 'var(--vl-mono)', fontSize: '.48rem', fontWeight: 700, color }}>FAIT</div>}
            </div>
          )
        })}
      </div>
      <button onClick={onSettings} style={{ background: 'none', border: '1px solid var(--vl-border)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>Réglages du programme →</button>
    </div>
  )
}

// ── SessionView ────────────────────────────────────────────────────────────

function SessionView({ sess, onChange, audioCtxRef, onLogPopup, onOpenRest, onComplete, onBack }: {
  sess: SessionState; onChange: React.Dispatch<React.SetStateAction<SessionState | null>>
  audioCtxRef: React.MutableRefObject<AudioContext | null>
  onLogPopup: (p: LogPopup) => void
  onOpenRest: (secs: number, type: 'set' | 'exo', nextLabel: string | null, onDismiss: () => void) => void
  onComplete: () => void; onBack: () => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => { const t = setInterval(() => setElapsed(Date.now() - sess.startTime), 1000); return () => clearInterval(t) }, [sess.startTime])

  const { session, exoIdx, serieIdx, phase } = sess
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exo: RenfoExerciseSlot | undefined = session.exercises[exoIdx]; const def = exo ? (RENFO_EXERCISES as any)[exo.exercise_id] : null
  const variant = def?.variants?.find((v: { id: string }) => v.id === exo?.variant_id) || def?.variants?.[0]
  const gifUrl = exo ? getExerciseGifUrl(exo.exercise_id) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interSetRest = exo ? ((INTER_SET_REST as any)[exo.exercise_id] || 90) : 90
  const interExoRest = variant?.rest_seconds || 90

  const serieComplete = useCallback(() => {
    if (!audioCtxRef.current) { try { audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() } catch { /* */ } }
    audioCtxRef.current?.resume?.()
    if (!exo) return
    const isLastSerie = serieIdx >= exo.sets - 1
    const isLastExo = exoIdx >= session.exercises.length - 1
    const loadVal = (document.getElementById('sess-load') as HTMLInputElement | null)?.value
    const capturedLoad = loadVal ? parseFloat(loadVal) : null
    if (capturedLoad) onChange(p => p ? { ...p, suggestions: { ...p.suggestions, [exo.exercise_id]: capturedLoad } } : p)

    if (isLastSerie) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextExo = !isLastExo ? session.exercises[exoIdx + 1] : null; const nextDef = nextExo ? (RENFO_EXERCISES as any)[nextExo.exercise_id] : null
      onLogPopup({
        exerciseId: exo.exercise_id, variantId: exo.variant_id, loadType: exo.load_type,
        prefillLoad: capturedLoad ?? (sess.suggestions[exo.exercise_id] ?? null),
        afterLog: () => {
          if (isLastExo) { onComplete() }
          else { onChange(p => p ? { ...p, exoIdx: exoIdx + 1, serieIdx: 0 } : p); onOpenRest(interExoRest, 'exo', nextDef?.name_fr || null, () => {}) }
        },
      })
    } else {
      onChange(p => p ? { ...p, serieIdx: serieIdx + 1 } : p)
      onOpenRest(interSetRest, 'set', `Série ${serieIdx + 2}/${exo.sets}`, () => {})
    }
  }, [exo, exoIdx, serieIdx, session.exercises, sess.suggestions, onLogPopup, onOpenRest, onComplete, onChange, audioCtxRef, interExoRest, interSetRest])

  if (phase === 'warmup') return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: 4, maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vl-text-3)', padding: 4, fontSize: '1.1rem' }}>←</button>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: '#7c3aed', letterSpacing: '.1em' }}>{session.focus.replace(/_/g, ' ').toUpperCase()} · ~{session.duration_min} MIN</div>
        {session.dup_label && <div style={{ padding: '2px 7px', background: 'rgba(124,58,237,.15)', borderRadius: 4, fontFamily: 'var(--vl-mono)', fontSize: '.48rem', fontWeight: 700, color: '#7c3aed' }}>DUP · {session.dup_label}</div>}
      </div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, marginBottom: 6 }}>{session.label}</div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginBottom: 20 }}>{session.exercises.length} exercices</div>
      <div style={{ background: 'rgba(124,58,237,.05)', border: '1px solid rgba(124,58,237,.2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: '#7c3aed', marginBottom: 8, letterSpacing: '.08em' }}>ÉCHAUFFEMENT (5–8 MIN)</div>
        <div style={{ fontSize: '.8rem', color: 'var(--vl-text-3)', lineHeight: 1.5 }}>{WARMUP[session.focus] || WARMUP.force_lourde}</div>
      </div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.52rem', color: 'var(--vl-text-3)', marginBottom: 8, textAlign: 'center' }}>OÙ S'ENTRAÎNER ?</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {(['maison', 'salle'] as const).map(loc => (
          <button key={loc} onClick={() => onChange(p => p ? { ...p, location: loc } : p)}
            style={{ flex: 1, padding: '14px 10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--vl-display)', fontSize: '.95rem', fontWeight: 800, border: `2px solid ${sess.location === loc ? '#a78bfa' : 'var(--vl-border)'}`, background: sess.location === loc ? '#a78bfa' : 'transparent', color: sess.location === loc ? '#15161a' : 'var(--vl-text-3)' }}>
            <div style={{ fontSize: '.52rem', fontFamily: 'var(--vl-mono)', opacity: .75, marginBottom: 3 }}>{loc === 'maison' ? 'DOMICILE' : 'AVEC ÉQUIPEMENT'}</div>
            {loc === 'maison' ? 'MAISON' : 'SALLE'}
          </button>
        ))}
      </div>
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        {session.exercises.map((e, i) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = (RENFO_EXERCISES as any)[e.exercise_id]
          return <div key={e.exercise_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: i < session.exercises.length - 1 ? '1px dashed var(--vl-border)' : 'none' }}>
            <div style={{ fontSize: '.8rem' }}>{d?.name_fr || e.exercise_id}</div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginLeft: 8 }}>{e.sets}×{e.reps} · RPE {e.target_rpe}</div>
          </div>
        })}
      </div>
      <div style={{ flex: 1 }} />
      {sess.alreadyDone
        ? <div style={{ width: '100%', padding: 18, background: 'var(--vl-surf-2)', borderRadius: 14, textAlign: 'center', fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--vl-text-3)' }}>DÉJÀ FAIT CETTE SEMAINE</div>
        : <button onClick={() => onChange(p => p ? { ...p, phase: 'exercise' } : p)} style={{ width: '100%', padding: 18, background: '#a78bfa', border: 'none', borderRadius: 14, cursor: 'pointer', color: '#15161a', fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800 }}>LANCER LA SÉANCE →</button>}
    </div>
  )

  if (!exo || !def) { onComplete(); return null }

  const isTimeBased = variant?.unit === 's'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: 4, maxWidth: 600 }}>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {session.exercises.map((e, exoI) => (
          <div key={exoI} style={{ flex: e.sets, display: 'flex', gap: 2 }}>
            {Array.from({ length: e.sets }, (_, j) => {
              const done = exoI < exoIdx || (exoI === exoIdx && j < serieIdx)
              const act = exoI === exoIdx && j === serieIdx
              return <div key={j} style={{ flex: 1, height: 6, borderRadius: 1, background: done ? '#7c3aed' : act ? 'transparent' : 'var(--vl-bg)', border: act ? '1.5px solid #7c3aed' : 'none' }} />
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vl-text-3)', padding: 4, fontSize: '1.1rem' }}>←</button>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>EXO {exoIdx + 1}/{session.exercises.length} · SÉRIE {serieIdx + 1}/{exo.sets}</div>
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>{fmtElapsed(elapsed)}</div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: '#a78bfa', letterSpacing: '.1em', marginBottom: 4 }}>EN COURS</div>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(1.8rem,7vw,2.6rem)', fontWeight: 800, lineHeight: 1, textTransform: 'uppercase' }}>{def.name_fr}</div>
        {def.primary_muscles?.length > 0 && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginTop: 6 }}>{def.primary_muscles.slice(0, 3).join(' · ')}</div>}
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 4 }}>{variant?.name}</div>
      </div>

      {gifUrl && <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--vl-border)', background: 'var(--vl-surf-2)', lineHeight: 0, marginBottom: 14 }}><img src={gifUrl} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block' }} onError={e => { (e.target as HTMLElement).parentElement!.style.display = 'none' }} /></div>}

      <div style={{ display: 'flex', gap: 24, marginBottom: 18 }}>
        <div><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', marginBottom: 2 }}>CIBLE</div><div style={{ fontFamily: 'var(--vl-display)', fontSize: '2.2rem', fontWeight: 800, lineHeight: 1 }}>{isTimeBased ? `${exo.reps}s` : exo.reps}<span style={{ fontSize: '.8rem', fontWeight: 500, marginLeft: 4 }}>{isTimeBased ? 'TENIR' : 'REPS'}</span></div></div>
        {!isTimeBased && <div><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', marginBottom: 2 }}>RPE</div><div style={{ fontFamily: 'var(--vl-display)', fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, color: '#7c3aed' }}>{exo.target_rpe}</div></div>}
        <div><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', marginBottom: 2 }}>{isTimeBased ? 'CÔTÉ' : 'REPOS'}</div><div style={{ fontFamily: 'var(--vl-display)', fontSize: '2.2rem', fontWeight: 800, lineHeight: 1 }}>{fmtRest(serieIdx >= exo.sets - 1 ? interExoRest : interSetRest)}</div></div>
      </div>

      {exo.load_type === 'external_kg'
        ? <div style={{ marginBottom: 14 }}><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', marginBottom: 6 }}>CHARGE</div><input id="sess-load" type="number" inputMode="decimal" step={2.5} min={0} placeholder={sess.suggestions[exo.exercise_id] ? `${sess.suggestions[exo.exercise_id]} kg (suggéré)` : 'Charge en kg…'} defaultValue={sess.suggestions[exo.exercise_id] || ''} style={{ width: '100%', padding: '11px 14px', background: 'var(--vl-bg)', border: '1.5px solid #7c3aed40', borderRadius: 8, color: 'var(--vl-text)', fontSize: '1.1rem', boxSizing: 'border-box', fontWeight: 600 }} /></div>
        : <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginBottom: 14 }}>{exo.load_type === 'band' ? 'Élastique' : 'Poids de corps'}</div>
      }

      <button onClick={serieComplete} style={{ width: '100%', padding: 20, background: 'rgba(124,58,237,.1)', border: '2px solid #7c3aed', borderRadius: 14, cursor: 'pointer', marginBottom: 4 }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: '#7c3aed', marginBottom: 4, letterSpacing: '.1em' }}>QUAND C'EST FAIT, TAPE ICI</div>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: '#7c3aed' }}>SÉRIE FAITE ✓</div>
      </button>

      <button onClick={() => setShowDetail(v => !v)} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', padding: 0 }}>comment faire ?</button>
      {showDetail && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--vl-surf-2)', borderRadius: 8, border: '1px solid var(--vl-border)' }}>
          {def.position && <div style={{ fontSize: '.72rem', color: 'var(--vl-text-3)', marginBottom: 6 }}><strong style={{ color: 'var(--vl-text)' }}>Position</strong><br />{def.position}</div>}
          {def.movement && <div style={{ marginBottom: 6 }}><strong style={{ fontSize: '.72rem', color: 'var(--vl-text)' }}>Mouvement</strong>{def.movement.split(/\.\s+/).filter(Boolean).map((s: string, i: number) => <div key={i} style={{ display: 'flex', gap: 6, padding: '2px 0' }}><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: '#7c3aed', minWidth: 14, paddingTop: 3 }}>{i + 1}.</div><div style={{ fontSize: '.7rem', color: 'var(--vl-text-3)', lineHeight: 1.4 }}>{s.replace(/\.$/, '')}</div></div>)}</div>}
          {def.common_errors && <div style={{ fontSize: '.72rem', color: '#7c3aed' }}><strong>Erreurs fréquentes</strong><br />{def.common_errors}</div>}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 12 }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={() => { if (serieIdx > 0) onChange(p => p ? { ...p, serieIdx: serieIdx - 1 } : p); else if (exoIdx > 0) onChange(p => p ? { ...p, exoIdx: exoIdx - 1, serieIdx: 0 } : p) }} disabled={exoIdx === 0 && serieIdx === 0} style={{ flex: 1, padding: '10px 4px', border: '1.5px solid var(--vl-border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', opacity: (exoIdx === 0 && serieIdx === 0) ? .3 : 1 }}>← précédent</button>
        <button onClick={() => { if (serieIdx < exo.sets - 1) onChange(p => p ? { ...p, serieIdx: serieIdx + 1 } : p); else if (exoIdx < session.exercises.length - 1) onChange(p => p ? { ...p, exoIdx: exoIdx + 1, serieIdx: 0 } : p); else onComplete() }} style={{ flex: 1, padding: '10px 4px', border: '1.5px solid var(--vl-border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>exercice suivant →</button>
      </div>
    </div>
  )
}

// ── RestOverlay ────────────────────────────────────────────────────────────

function RestOverlay({ rest, onChange, audioCtxRef }: { rest: RestState; onChange: React.Dispatch<React.SetStateAction<RestState | null>>; audioCtxRef: React.MutableRefObject<AudioContext | null> }) {
  const dismiss = useCallback(() => { onChange(null); rest.onDismiss() }, [onChange, rest])
  const barPct = rest.total > 0 ? Math.max(0, rest.remaining / rest.total * 100) : 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0E0D0A', zIndex: 9500, display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: '#666', letterSpacing: '.1em' }}>{rest.type === 'exo' ? 'REPOS ENTRE EXERCICES' : 'REPOS ENTRE SÉRIES'}</div>
        <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontFamily: 'var(--vl-mono)', fontSize: '.7rem', padding: '4px 8px' }}>×</button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: "'Oswald',var(--vl-display),sans-serif", fontSize: 'clamp(100px,28vw,160px)', fontWeight: 600, color: '#F3EFE4', lineHeight: .9 }}>{fmtTimer(rest.remaining)}</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: '#666' }}>SUR {fmtTimer(rest.total)}</div>
        <div style={{ width: 'min(280px,70vw)', height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}><div style={{ height: '100%', width: `${barPct}%`, background: '#7c3aed', borderRadius: 2, transition: 'width .9s linear' }} /></div>
        {rest.nextLabel && <div style={{ marginTop: 8, textAlign: 'center' }}><div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: '#666' }}>{rest.type === 'exo' ? 'EXERCICE SUIVANT' : 'SÉRIE SUIVANTE'}</div><div style={{ fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 700, color: '#F3EFE4', marginTop: 4 }}>{rest.nextLabel}</div></div>}
      </div>
      <div style={{ padding: '16px 20px 32px', display: 'flex', gap: 10 }}>
        <button onClick={() => onChange(p => p ? { ...p, remaining: p.remaining + 30, total: p.total + 30 } : p)} style={{ flex: 1, padding: 14, border: '1.5px solid #333', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: '.8rem', color: '#999' }}>+30s</button>
        <button onClick={dismiss} style={{ flex: 2, padding: 14, border: '1.5px solid #7c3aed', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 700, color: '#7c3aed' }}>PASSER MAINTENANT →</button>
      </div>
    </div>
  )
}

// ── Log popup ──────────────────────────────────────────────────────────────

function LogPopupSheet({ popup, onClose }: { popup: LogPopup; onClose: (data: { loadKg: number | null; reps: number | null; rpe: number } | null) => void }) {
  const [rpe, setRpe] = useState(8)
  const [loadKg, setLoadKg] = useState(popup.prefillLoad !== null ? String(popup.prefillLoad) : '')
  const [reps, setReps] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (RENFO_EXERCISES as any)[popup.exerciseId]
  const isWeighted = popup.loadType === 'external_kg'
  const RPE_LABELS = ['', 'Repos', 'Très léger', 'Léger', 'Assez léger', 'Modéré', 'Difficile', 'Assez dur', 'Dur ✓', 'Très dur', 'Max']
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 8000, display: 'flex', alignItems: 'flex-end' }} onClick={() => onClose(null)}>
      <div style={{ width: '100%', background: 'var(--vl-bg2)', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'var(--vl-border)', borderRadius: 2, margin: '0 auto 18px' }} />
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{def?.name_fr || popup.exerciseId}</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginBottom: 18 }}>{def?.name_tech}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isWeighted && <>
            <div><div style={{ fontSize: '.75rem', color: 'var(--vl-text-3)', marginBottom: 6 }}>Charge (kg)</div><input type="number" inputMode="decimal" min={0} step={2.5} value={loadKg} onChange={e => setLoadKg(e.target.value)} placeholder="60" style={{ width: '100%', padding: '10px 12px', background: 'var(--vl-bg)', border: '1.5px solid var(--vl-border)', borderRadius: 8, color: 'var(--vl-text)', fontSize: '1rem', boxSizing: 'border-box' }} /></div>
            <div><div style={{ fontSize: '.75rem', color: 'var(--vl-text-3)', marginBottom: 6 }}>Répétitions effectuées</div><input type="number" inputMode="numeric" min={1} max={30} value={reps} onChange={e => setReps(e.target.value)} placeholder="5" style={{ width: '100%', padding: '10px 12px', background: 'var(--vl-bg)', border: '1.5px solid var(--vl-border)', borderRadius: 8, color: 'var(--vl-text)', fontSize: '1rem', boxSizing: 'border-box' }} /></div>
          </>}
          <div>
            <div style={{ fontSize: '.75rem', color: 'var(--vl-text-3)', marginBottom: 10 }}>Difficulté ressentie (RPE)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => <button key={r} onClick={() => setRpe(r)} style={{ padding: '10px 2px', borderRadius: 8, border: `1.5px solid ${r === rpe ? '#7c3aed' : 'var(--vl-border)'}`, cursor: 'pointer', background: r === rpe ? '#7c3aed' : 'transparent', color: r === rpe ? '#fff' : 'var(--vl-text-3)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, lineHeight: 1 }}>{r}</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.4rem', marginTop: 3 }}>{RPE_LABELS[r]}</div>
              </button>)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={() => onClose(null)} style={{ flex: 1, padding: 13, background: 'var(--vl-bg)', border: '1.5px solid var(--vl-border)', borderRadius: 12, cursor: 'pointer', color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)', fontSize: '.75rem' }}>Passer</button>
          <button onClick={() => onClose({ loadKg: loadKg ? parseFloat(loadKg) : null, reps: reps ? parseInt(reps) : null, rpe })} style={{ flex: 2, padding: 13, background: '#7c3aed', border: 'none', borderRadius: 12, cursor: 'pointer', color: '#fff', fontFamily: 'var(--vl-mono)', fontWeight: 700 }}>Valider</button>
        </div>
      </div>
    </div>
  )
}

// ── CompletionPicker ───────────────────────────────────────────────────────

function CompletionPicker({ date, onDateChange, onCancel, onConfirm, saving }: {
  date: string; onDateChange: (d: string) => void; onCancel: () => void; onConfirm: () => void; saving: boolean
}) {
  const today = localDateStr()
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 8000, display: 'flex', alignItems: 'flex-end' }} onClick={onCancel}>
      <div style={{ width: '100%', background: 'var(--vl-bg2)', borderRadius: '20px 20px 0 0', padding: '20px 20px calc(32px + env(safe-area-inset-bottom,0px))' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: 'var(--vl-border)', borderRadius: 2, margin: '0 auto 18px' }} />
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: 6 }}>Terminer la séance</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginBottom: 18 }}>Les exercices non cochés seront automatiquement validés.</div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '.75rem', color: 'var(--vl-text-3)', marginBottom: 6 }}>Date de la séance</div>
          <input type="date" value={date} max={today} onChange={e => onDateChange(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: 'var(--vl-bg)', border: '1.5px solid var(--vl-border)', borderRadius: 8, color: 'var(--vl-text)', fontSize: '1rem', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 13, background: 'var(--vl-bg)', border: '1.5px solid var(--vl-border)', borderRadius: 12, cursor: 'pointer', color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)', fontSize: '.75rem' }}>Annuler</button>
          <button onClick={onConfirm} disabled={saving} style={{ flex: 2, padding: 13, background: '#7c3aed', border: 'none', borderRadius: 12, cursor: 'pointer', color: '#fff', fontFamily: 'var(--vl-display)', fontSize: '.95rem', fontWeight: 700, opacity: saving ? .7 : 1 }}>{saving ? 'Sauvegarde…' : 'CONFIRMER'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Onboarding ────────────────────────────────────────────────────────────

function Onboarding({ onSave, saving }: { onSave: (args: { prof: RenfoProfile; sched: WeekSchedule }) => void; saving: boolean }) {
  const user = useVLStore(s => s.user)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [ob, setOb] = useState<{ objective_weight?: number; sessions_per_week?: number; equipment: Record<string, unknown> }>({ equipment: {} })

  const finish = () => {
    const prof: RenfoProfile = { user_id: user!.id, sessions_per_week: ob.sessions_per_week || 3, objective_weight: ob.objective_weight || 50, equipment: ob.equipment, onboarding_completed: true }
    onSave({ prof, sched: generateWeekSchedule(prof) })
  }

  const titles = ['', 'Ton objectif', 'Ton rythme', 'Ton matériel']
  const subs = ['', "Le programme s'adaptera à ta priorité.", 'Sois réaliste — 2 séances tenues valent mieux que 5 ratées.', 'Le programme choisit automatiquement les meilleures variantes.']

  return (
    <div style={{ maxWidth: 480, paddingBottom: 24 }}>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', letterSpacing: '.12em', color: 'var(--vl-ember)', marginBottom: 8 }}>ÉTAPE {step} / 3</div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.1, marginBottom: 6 }}>{titles[step]}</div>
      <div style={{ fontSize: '.8rem', color: 'var(--vl-text-3)', marginBottom: 20 }}>{subs[step]}</div>

      {step === 1 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {([
          [25, 'Renforcement préventif', 'Excentrique · Mobilité · Yoga · Stabilité'],
          [50, 'Les deux à parts égales', 'Programme équilibré'],
          [75, 'Progresser en performance', 'Force lourde · Pliométrie · Économie de course'],
        ] as [number, string, string][]).map(([v, t, s]) => (
          <button key={v} onClick={() => setOb(p => ({ ...p, objective_weight: v }))} style={{ textAlign: 'left', padding: '14px 16px', background: 'var(--vl-surf-2)', border: `1.5px solid ${ob.objective_weight === v ? 'var(--vl-ember)' : 'var(--vl-border)'}`, borderRadius: 12, cursor: 'pointer', color: 'var(--vl-text)', width: '100%' }}>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: 3 }}>{t}</div>
            <div style={{ fontSize: '.73rem', color: 'var(--vl-text-3)' }}>{s}</div>
          </button>
        ))}
      </div>}

      {step === 2 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {([
          [1, '1 séance / semaine', '~50 min · Force lourde uniquement'],
          [3, '2–3 séances / semaine ⭐', '~35–50 min · Recommandé (Blagrove 2018)'],
          [5, '4–5 séances / semaine', '~30–40 min · Force + pliométrie + tronc + yoga'],
          [6, '6 séances / semaine', '~20–30 min · Format court quotidien'],
        ] as [number, string, string][]).map(([v, t, s]) => (
          <button key={v} onClick={() => setOb(p => ({ ...p, sessions_per_week: v }))} style={{ textAlign: 'left', padding: '14px 16px', background: 'var(--vl-surf-2)', border: `1.5px solid ${ob.sessions_per_week === v ? 'var(--vl-ember)' : 'var(--vl-border)'}`, borderRadius: 12, cursor: 'pointer', color: 'var(--vl-text)', width: '100%' }}>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: 3 }}>{t}</div>
            <div style={{ fontSize: '.73rem', color: 'var(--vl-text-3)' }}>{s}</div>
          </button>
        ))}
      </div>}

      {step === 3 && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', letterSpacing: '.08em', color: 'var(--vl-text-3)', marginBottom: 8 }}>À DOMICILE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([['pullup_bar', 'Barre de traction'], ['step', 'Step / marche'], ['anchor_point', "Point d'ancrage"]] as [string, string][]).map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--vl-surf-2)', border: '1.5px solid var(--vl-border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!ob.equipment[k]} onChange={e => setOb(p => ({ ...p, equipment: { ...p.equipment, [k]: e.target.checked } }))} style={{ accentColor: 'var(--vl-ember)', width: 16, height: 16 }} />
                <span style={{ fontSize: '.78rem' }}>{l}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', letterSpacing: '.08em', color: 'var(--vl-text-3)', marginBottom: 8 }}>EN SALLE</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--vl-surf-2)', border: '1.5px solid var(--vl-border)', borderRadius: 10, padding: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!ob.equipment.has_gym_access} onChange={e => setOb(p => ({ ...p, equipment: { ...p.equipment, has_gym_access: e.target.checked } }))} style={{ accentColor: 'var(--vl-ember)', width: 18, height: 18 }} />
            <div><div style={{ fontSize: '.82rem', fontWeight: 600 }}>J'ai accès à une salle</div><div style={{ fontSize: '.7rem', color: 'var(--vl-text-3)' }}>Débloque barres et machines</div></div>
          </label>
        </div>
      </div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        {step > 1 && <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)} style={{ flex: 1, padding: 14, background: 'var(--vl-surf-2)', border: '1.5px solid var(--vl-border)', borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--vl-mono)' }}>← Retour</button>}
        {step < 3
          ? <button onClick={() => { if (step === 1 && ob.objective_weight === undefined) return; if (step === 2 && ob.sessions_per_week === undefined) return; setStep(s => (s + 1) as 1 | 2 | 3) }} style={{ flex: 2, padding: 14, background: 'var(--vl-ember)', border: 'none', borderRadius: 12, cursor: 'pointer', color: '#fff', fontFamily: 'var(--vl-mono)', fontWeight: 700 }}>Suivant →</button>
          : <button onClick={finish} disabled={saving} style={{ flex: 2, padding: 14, background: 'var(--vl-ember)', border: 'none', borderRadius: 12, cursor: 'pointer', color: '#fff', fontFamily: 'var(--vl-mono)', fontWeight: 700, opacity: saving ? .7 : 1 }}>{saving ? 'Génération…' : 'Générer mon programme →'}</button>}
      </div>
    </div>
  )
}

// ── Settings ──────────────────────────────────────────────────────────────

function Settings({ profile, onSave, saving, onBack }: { profile: RenfoProfile; onSave: (args: { prof: RenfoProfile; sched: WeekSchedule }) => void; saving: boolean; onBack: () => void }) {
  const [ow, setOw] = useState(profile.objective_weight)
  const [spw, setSpw] = useState(profile.sessions_per_week)
  const save = () => { const prof = { ...profile, objective_weight: ow, sessions_per_week: spw }; onSave({ prof, sched: generateWeekSchedule(prof) }) }
  return (
    <div style={{ maxWidth: 480, paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vl-text-3)', padding: 4, fontSize: '1.1rem' }}>←</button>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.04em' }}>RÉGLAGES</div>
      </div>
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', letterSpacing: '.08em', color: 'var(--vl-text-3)', marginBottom: 12 }}>OBJECTIF</div>
        {[[25, 'Renforcement préventif'], [50, 'Équilibré'], [75, 'Performance']].map(([v, t]) => (
          <button key={v} onClick={() => setOw(v as number)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, background: ow === v ? 'rgba(229,86,42,.1)' : 'transparent', border: `1.5px solid ${ow === v ? 'var(--vl-ember)' : 'var(--vl-border)'}`, borderRadius: 10, cursor: 'pointer', color: 'var(--vl-text)', marginBottom: 8 }}><span style={{ fontSize: '.85rem' }}>{t}</span></button>
        ))}
      </div>
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', letterSpacing: '.08em', color: 'var(--vl-text-3)', marginBottom: 12 }}>SÉANCES / SEMAINE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[1, 3, 5, 6].map(v => <button key={v} onClick={() => setSpw(v)} style={{ padding: 12, background: spw === v ? 'rgba(229,86,42,.1)' : 'transparent', border: `1.5px solid ${spw === v ? 'var(--vl-ember)' : 'var(--vl-border)'}`, borderRadius: 10, cursor: 'pointer', color: 'var(--vl-text)' }}><div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.2rem', fontWeight: 700 }}>{v}</div><div style={{ fontSize: '.65rem', color: 'var(--vl-text-3)' }}>séance{v > 1 ? 's' : ''}/sem</div></button>)}
        </div>
      </div>
      <button onClick={save} disabled={saving} style={{ width: '100%', padding: 14, background: 'var(--vl-ember)', border: 'none', borderRadius: 12, cursor: 'pointer', color: '#fff', fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 700, opacity: saving ? .7 : 1 }}>{saving ? 'Sauvegarde…' : 'Sauvegarder & Régénérer'}</button>
    </div>
  )
}
