import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useRunningDUPOverride } from '../lib/coach/useRunningDUPOverride'
import { useVLStore } from '../store/vlStore'
import { buildSession, applyDUP } from '../lib/renfoProgram'
import ExerciseMedia, { HomeIcon, GymIcon } from '../components/ExerciseMedia'
import { RENFO_EXERCISES as _RENFO_EXERCISES, FOCUS_META as _FOCUS_META, RENFO_FOCUS_COLORS as _RENFO_FOCUS_COLORS } from '../lib/renfoData'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENFO_EXERCISES = _RENFO_EXERCISES as Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FOCUS_META = _FOCUS_META as Record<string, any>
const RENFO_FOCUS_COLORS = _RENFO_FOCUS_COLORS as Record<string, string>
import {
  get4WeekPhase, applyDeloadModifiers,
  computeNextLoad, calcE1rm, fmtRestTimer, todayStr,
  type ExerciseLog,
} from '../lib/renfoUtils'

type Stage =
  | { stage: 'warmup' }
  | { stage: 'active'; exoIdx: number; setIdx: number }
  | { stage: 'rest'; nextExo: number; nextSet: number; secondsLeft: number; totalSeconds: number }
  | { stage: 'done' }

interface SetLog {
  exercise_id: string
  variant_id: string
  load_kg: number | null
  reps: number
  rpe: number
  e1rm: number | null
}

const DEFAULT_PROFILE = {
  objective_weight: 50,
  sessions_per_week: 3,
  has_gym_access: false,
  location_pref: 'maison',
  equipment: {},
}

export default function RenfoSessionPage() {
  const { focusKey } = useParams<{ focusKey: string }>()
  const { user } = useVLStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: renfoProfile } = useQuery({
    queryKey: ['renfo-profile'],
    queryFn: async () => {
      const { data } = await supabase
        .from('renfo_profile').select('*').eq('user_id', user!.id).maybeSingle()
      return data
    },
    enabled: !!user,
  })

  const { data: exerciseLogs = [] } = useQuery<ExerciseLog[]>({
    queryKey: ['renfo-exercise-logs-30d'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_exercise_log')
        .select('session_date,exercise_id,load_kg,reps_completed,rpe,e1rm,completed_all_reps')
        .eq('user_id', user!.id)
        .gte('session_date', cutoff)
        .order('session_date', { ascending: false })
      return (data ?? []) as ExerciseLog[]
    },
    enabled: !!user,
  })

  const dupOverride = useRunningDUPOverride()
  const phase = get4WeekPhase(dupOverride)

  // Lieu choisi pour CETTE séance → sélectionne le bon jeu de matériel (maison vs salle)
  // et donc les variantes proposées. Mémorisé pour ne pas le redemander à chaque fois.
  const [location, setLocation] = useState<'maison' | 'salle'>(
    () => (localStorage.getItem('vl-renfo-location') as 'maison' | 'salle') || 'maison',
  )
  useEffect(() => { localStorage.setItem('vl-renfo-location', location) }, [location])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effectiveProfile = useMemo<any>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = renfoProfile ?? DEFAULT_PROFILE
    const eqHome = p.equipment_home ?? p.equipment ?? {}
    const eqGym = p.equipment_gym ?? p.equipment ?? {}
    return {
      ...p,
      equipment: location === 'salle' ? eqGym : eqHome,
      has_gym_access: location === 'salle',
    }
  }, [renfoProfile, location])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = useMemo<any>(() => {
    if (!focusKey) return null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let s: any = buildSession(focusKey, effectiveProfile)
      if (phase === 'deload') {
        s = { ...s, exercises: applyDeloadModifiers(s.exercises) }
      } else {
        s = applyDUP(s)
      }
      // Guard: ensure exercises is always an array
      if (!s || !Array.isArray(s.exercises)) {
        return { ...s, exercises: [], _buildError: 'exercises manquants' }
      }
      return s
    } catch (err) {
      console.error('[RenfoSession] buildSession error for', focusKey, err)
      return { exercises: [], focus: focusKey, label: focusKey, duration_min: 30, timing_notes: [], _buildError: String(err) }
    }
  }, [focusKey, phase, effectiveProfile])

  const logsByExo = useMemo(() => {
    const map: Record<string, ExerciseLog[]> = {}
    for (const l of exerciseLogs) {
      if (!map[l.exercise_id]) map[l.exercise_id] = []
      map[l.exercise_id].push(l)
    }
    return map
  }, [exerciseLogs])

  const [stageState, setStageState] = useState<Stage>({ stage: 'warmup' })
  const [setLogs, setSetLogs] = useState<SetLog[]>([])
  const [load, setLoad] = useState<number | ''>('')
  const [reps, setReps] = useState<number>(0)
  const [rpe, setRpe] = useState<number>(8)
  const [sessionDate, setSessionDate] = useState(todayStr())
  const timerRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  function playBeep(freq = 880, dur = 0.13, gain = 0.5) {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.connect(g)
      g.connect(ctx.destination)
      osc.frequency.value = freq
      // Attaque instantanée + déclin rapide → son sport/digital
      g.gain.setValueAtTime(gain, ctx.currentTime)
      g.gain.setValueAtTime(gain, ctx.currentTime + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + dur)
    } catch { /* audio non disponible */ }
  }

  const exoIdx = stageState.stage === 'active' ? stageState.exoIdx : -1
  const secondsLeft = stageState.stage === 'rest' ? stageState.secondsLeft : null

  useEffect(() => {
    if (exoIdx < 0 || !session) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exo: any = session.exercises[exoIdx]
    if (!exo) return
    const suggested = computeNextLoad(logsByExo[exo.exercise_id] ?? [])
    setLoad(suggested !== null ? suggested : '')
    setReps(exo.reps)
    setRpe(exo.target_rpe ?? 8)
  }, [exoIdx]) // eslint-disable-line

  // Bips standard sport : 3 ticks courts identiques 880Hz + long bip GO
  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 3 && secondsLeft > 0) {
      playBeep(880, 0.15, 0.50)   // tick court identique à chaque fois
    }
  }, [secondsLeft])  

  // GO : même fréquence 880Hz mais beaucoup plus long
  const prevIsRestingRef = useRef(false)
  useEffect(() => {
    const isResting = stageState.stage === 'rest'
    if (prevIsRestingRef.current && !isResting && stageState.stage === 'active') {
      playBeep(1200, 0.55, 0.60)  // BEEEP long 1200Hz → signal départ
    }
    prevIsRestingRef.current = isResting
  }, [stageState.stage])  

  // Scroll au timer dès que la récup commence — évite de devoir scroller
  useEffect(() => {
    if (stageState.stage === 'rest') {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [stageState.stage])

  useEffect(() => {
    if (stageState.stage !== 'rest') {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = window.setInterval(() => {
      setStageState((prev) => {
        if (prev.stage !== 'rest') return prev
        if (prev.secondsLeft <= 1) {
          clearInterval(timerRef.current!)
          return { stage: 'active', exoIdx: prev.nextExo, setIdx: prev.nextSet }
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 }
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [stageState.stage])

  function completeSet() {
    if (!session || stageState.stage !== 'active') return
    // Pre-warm AudioContext sur le geste utilisateur (iOS impose un geste avant tout son)
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    } catch { /* ignore */ }
    const { exoIdx: ei, setIdx: si } = stageState
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exo: any = session.exercises[ei]
    const loadKg = typeof load === 'number' && load > 0 ? load : null
    const e1rm = loadKg && reps > 0 ? calcE1rm(loadKg, reps) : null
    setSetLogs((prev) => [...prev, {
      exercise_id: exo.exercise_id,
      variant_id: exo.variant_id,
      load_kg: loadKg,
      reps,
      rpe,
      e1rm,
    }])
    const isLastSet = si >= exo.sets - 1
    const isLastExo = ei >= session.exercises.length - 1
    if (isLastSet && isLastExo) {
      setStageState({ stage: 'done' })
    } else {
      const nextExo = isLastSet ? ei + 1 : ei
      const nextSet = isLastSet ? 0 : si + 1
      setStageState({ stage: 'rest', nextExo, nextSet, secondsLeft: exo.rest_seconds, totalSeconds: exo.rest_seconds })
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session) return
       
      const exerciseInserts = setLogs.map((l) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const targetReps = session.exercises.find((e: any) => e.exercise_id === l.exercise_id)?.reps ?? 0
        return {
          user_id: user!.id,
          session_date: sessionDate,
          exercise_id: l.exercise_id,
          variant_id: l.variant_id,
          load_kg: l.load_kg,
          reps_completed: l.reps,
          reps_target: targetReps,
          rpe: l.rpe,
          e1rm: l.e1rm,
          completed_all_reps: l.reps >= targetReps,
        }
      })
      const { error: eErr } = await supabase.from('renfo_exercise_log').insert(exerciseInserts)
      if (eErr) throw eErr

      const maxE1rm: Record<string, number> = {}
      for (const l of setLogs) {
        if (l.e1rm && (!maxE1rm[l.exercise_id] || l.e1rm > maxE1rm[l.exercise_id]))
          maxE1rm[l.exercise_id] = l.e1rm
      }
      for (const [exId, oneRm] of Object.entries(maxE1rm)) {
        await supabase.from('renfo_max_lifts').upsert({
          user_id: user!.id, exercise_id: exId, one_rm: oneRm,
          is_estimated: true, recorded_at: new Date().toISOString(),
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const completedMap = Object.fromEntries(session.exercises.map((e: any) => [e.exercise_id, true]))
      const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
      const dayKey = DAY_KEYS[new Date(sessionDate + 'T12:00:00').getDay()]
      // Plus de contrainte d'unicité (user,date,focus) — on autorise les doubles séances.
      // On met à jour une séance MANUELLE existante de ce type ce jour (re-sauvegarde),
      // sans jamais écraser un import Strava ; sinon on insère une nouvelle ligne.
      const { data: existingManual } = await supabase
        .from('renfo_session_log')
        .select('id')
        .eq('user_id', user!.id)
        .eq('session_date', sessionDate)
        .eq('focus', focusKey!)
        .is('source', null)
        .limit(1)
      const existingId = existingManual?.[0]?.id
      const payload = { day_key: dayKey, duration_min: session.duration_min, completed_exercises: completedMap }
      const { error: sErr } = existingId
        ? await supabase.from('renfo_session_log').update(payload).eq('id', existingId)
        : await supabase.from('renfo_session_log').insert({
            user_id: user!.id, session_date: sessionDate, focus: focusKey!, ...payload,
          })
      if (sErr) throw sErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-7d'] })
      navigate('/renfo')
    },
  })

  if (!session) return <div className="loading"><div className="spinner" /></div>

  const meta = FOCUS_META[focusKey!] ?? {}
  const color: string = RENFO_FOCUS_COLORS[focusKey!] ?? 'var(--vl-ember)'

  // Sélecteur de lieu (affiché à l'intro de séance) — pilote le matériel → les variantes.
  const locationToggle = (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="fl" style={{ marginBottom: '0.5rem' }}>Où t'entraînes-tu aujourd'hui ?</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['maison', 'salle'] as const).map((loc) => (
          <button key={loc} className="hbtn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            ...(location === loc ? { background: 'var(--vl-ember)', borderColor: 'var(--vl-ember)', color: 'var(--vl-ink)' } : {}) }}
            onClick={() => setLocation(loc)}>
            {loc === 'maison' ? <HomeIcon /> : <GymIcon />}
            {loc === 'maison' ? 'Maison' : 'Salle'}
          </button>
        ))}
      </div>
      <div className="mlabel" style={{ marginTop: 6, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
        Variantes adaptées à ton matériel {location === 'salle' ? 'de salle' : 'à la maison'}. Configurable dans Réglages équipement.
      </div>
    </div>
  )

  // ── Warmup ────────────────────────────────────────────────────────────────
  if (stageState.stage === 'warmup' && session.exercises.length === 0) {
    return (
      <>
        <Link to="/renfo" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
          ← Renfo
        </Link>
        <div className="clabel" style={{ marginBottom: '1rem', color }}>{meta.label ?? focusKey}</div>
        {locationToggle}
        <div className="card" style={{ borderLeft: '3px solid var(--vl-ember)' }}>
          <div className="mlabel" style={{ color: 'var(--vl-ember)', marginBottom: 4 }}>Aucun exercice disponible</div>
          <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0, marginTop: 4 }}>
            Aucune variante ne correspond à ton matériel {location === 'salle' ? 'de salle' : 'à la maison'}. Essaie l'autre lieu, ou ajoute du matériel dans Réglages équipement.
          </div>
          {session._buildError && (
            <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0, fontSize: '0.75rem', marginTop: 4 }}>
              {session._buildError}
            </div>
          )}
        </div>
      </>
    )
  }

  if (stageState.stage === 'warmup') {
    return (
      <>
        <Link to="/renfo" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
          ← Renfo
        </Link>
        <div className="clabel" style={{ marginBottom: '1.5rem', color }}>{meta.label ?? focusKey}</div>

        {locationToggle}

        {/* Échauffement block — shown when warmup_text is defined in FOCUS_META */}
        {meta.warmup_text && (
          <div className="card" style={{ marginBottom: '1rem', borderLeft: `3px solid ${color}` }}>
            <div className="mlabel" style={{ color, marginBottom: 6 }}>ÉCHAUFFEMENT</div>
            <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, lineHeight: 1.5 }}>
              {meta.warmup_text}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="strip" style={{ marginBottom: '1rem' }}>
            <div className="scell" style={{ gridColumn: 'span 3' }}>
              <div className="sval">{session.exercises.length}</div>
              <div className="slbl">Exercices</div>
            </div>
            <div className="scell" style={{ gridColumn: 'span 3' }}>
              <div className="sval">{session.duration_min} min</div>
              <div className="slbl">Durée</div>
            </div>
          </div>
          {(meta.timing_notes ?? []).map((note: string, i: number) => (
            <div key={i} className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 4 }}>{note}</div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="fl" style={{ marginBottom: '0.5rem' }}>Programme du jour</div>
          {session.exercises.map((exo: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const ex = RENFO_EXERCISES[exo.exercise_id]
            const isHold = exo.unit === 's'
            const repsLabel = isHold ? `${exo.sets} × ${exo.reps}s tenir` : `${exo.sets}×${exo.reps} · RPE ${exo.target_rpe}`
            return (
              <div key={i} className="fg" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.35rem 0' }}>
                <ExerciseMedia exerciseId={exo.exercise_id} category={ex?.category ?? focusKey} variant="thumb" preferDemo />
                <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, flex: 1, minWidth: 0 }}>{ex?.name_fr ?? exo.exercise_id}</span>
                <span className="mlabel" style={{ color: 'var(--vl-text-3)', flexShrink: 0 }}>{repsLabel}</span>
              </div>
            )
          })}
        </div>

        <button className="btn-primary" onClick={() => {
          // Pré-échauffage AudioContext dès le premier tap (iOS)
          try {
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
              audioCtxRef.current = new AudioContext()
            }
            if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
          } catch { /* ignore */ }
          setStageState({ stage: 'active', exoIdx: 0, setIdx: 0 })
        }}>
          LANCER LA SÉANCE →
        </button>
      </>
    )
  }

  // ── Active ────────────────────────────────────────────────────────────────
  if (stageState.stage === 'active') {
    const { exoIdx: ei, setIdx: si } = stageState
    const exo = session.exercises[ei]  
    const ex = RENFO_EXERCISES[exo.exercise_id]
    const variant = ex?.variants?.find((v: any) => v.id === exo.variant_id) ?? ex?.variants?.[0] // eslint-disable-line @typescript-eslint/no-explicit-any
    const isLoadExo = exo.load_type === 'external_kg'
    const isHold = exo.unit === 's'

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="hbtn" onClick={() => navigate('/renfo')}>← Quitter</button>
          <div className="mlabel" style={{ color: 'var(--vl-text-3)' }}>
            {ei + 1}/{session.exercises.length} · série {si + 1}/{exo.sets}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <ExerciseMedia exerciseId={exo.exercise_id} category={ex?.category ?? focusKey} variant="full" preferDemo />
        </div>

        <div className="card" style={{ borderLeft: `3px solid ${color}`, marginBottom: '1rem' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', color, marginBottom: 4 }}>
            {ex?.name_fr ?? exo.exercise_id}
          </div>
          {variant && (
            <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
              {variant.name}
            </div>
          )}
          {ex?.primary_muscles && (
            <div className="mlabel" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {ex.primary_muscles.join(' · ')}
            </div>
          )}
          {isHold && (
            <div style={{ marginTop: 10, display: 'flex', gap: '1.5rem' }}>
              <div>
                <div className="mlabel" style={{ color: 'var(--vl-text-3)', marginBottom: 2 }}>CIBLE</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', lineHeight: 1 }}>
                  {exo.reps}s <span className="mlabel" style={{ fontSize: '0.75rem' }}>TENIR</span>
                </div>
              </div>
              <div>
                <div className="mlabel" style={{ color: 'var(--vl-text-3)', marginBottom: 2 }}>CÔTÉ SUIVANT</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', lineHeight: 1 }}>
                  {exo.rest_seconds}s
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {isLoadExo && (
              <div style={{ flex: 1 }}>
                <div className="fl" style={{ marginBottom: 4 }}>Charge (kg)</div>
                <input
                  type="number" min={0} step={1.25}
                  value={load}
                  onChange={(e) => setLoad(e.target.value === '' ? '' : +e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '1.1rem', background: 'var(--vl-surface-2)', border: '1px solid var(--vl-border)', borderRadius: 6, color: 'var(--vl-text-1)' }}
                />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div className="fl" style={{ marginBottom: 4 }}>{isHold ? 'Durée réelle (s)' : 'Répétitions'}</div>
              <input
                type="number" min={1} step={isHold ? 5 : 1}
                value={reps}
                onChange={(e) => setReps(+e.target.value)}
                style={{ width: '100%', padding: '0.5rem', fontSize: '1.1rem', background: 'var(--vl-surface-2)', border: '1px solid var(--vl-border)', borderRadius: 6, color: 'var(--vl-text-1)' }}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="fl" style={{ marginBottom: '0.5rem' }}>RPE ressenti</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[6, 7, 8, 9, 10].map((r) => (
              <button key={r}
                className="hbtn"
                style={rpe === r
                  ? { background: color, borderColor: color, color: 'var(--vl-ink)', flex: 1 }
                  : { flex: 1 }}
                onClick={() => setRpe(r)}
              >{r}</button>
            ))}
          </div>
        </div>

        <button className="btn-primary" onClick={completeSet}>
          SÉRIE {si + 1}/{exo.sets} TERMINÉE ✓
        </button>
      </>
    )
  }

  // ── Rest ──────────────────────────────────────────────────────────────────
  if (stageState.stage === 'rest') {
    const { secondsLeft, nextExo, nextSet, totalSeconds } = stageState
    const pct = Math.round((1 - secondsLeft / totalSeconds) * 100)
    const nextExoData = session.exercises[nextExo]
    const nextEx = nextExoData ? RENFO_EXERCISES[nextExoData.exercise_id] : null

    return (
      <>
        <div className="clabel" style={{ marginBottom: '1.5rem' }}>RÉCUPÉRATION</div>
        <div className="card" style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '3.5rem', color, marginBottom: '0.75rem' }}>
            {fmtRestTimer(secondsLeft)}
          </div>
          <div style={{ background: 'var(--vl-surface-2)', borderRadius: 4, height: 8, marginBottom: '1rem' }}>
            <div style={{
              width: `${pct}%`, height: '100%', background: color, borderRadius: 4,
              transition: 'width 1s linear',
            }} />
          </div>
          <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
            {nextEx
              ? `Prochain : ${nextEx.name_fr} — série ${nextSet + 1}`
              : 'Dernière récupération'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="hbtn" style={{ flex: 1 }}
            onClick={() => setStageState((s) => s.stage === 'rest'
              ? { ...s, secondsLeft: s.secondsLeft + 30, totalSeconds: s.totalSeconds + 30 }
              : s)}>
            +30s
          </button>
          <button className="btn-primary" style={{ flex: 2 }}
            onClick={() => {
              if (timerRef.current) clearInterval(timerRef.current)
              setStageState({ stage: 'active', exoIdx: nextExo, setIdx: nextSet })
            }}>
            PASSER →
          </button>
        </div>
      </>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  const uniqueExos = new Set(setLogs.map((l) => l.exercise_id)).size
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1.5rem', color }}>SÉANCE TERMINÉE</div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="strip">
          <div className="scell" style={{ gridColumn: 'span 3' }}>
            <div className="sval">{uniqueExos}</div>
            <div className="slbl">Exercices</div>
          </div>
          <div className="scell" style={{ gridColumn: 'span 3' }}>
            <div className="sval">{setLogs.length}</div>
            <div className="slbl">Séries</div>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="fl" style={{ marginBottom: '0.5rem' }}>Date de la séance</div>
        <input
          type="date"
          value={sessionDate}
          min={weekStart}
          max={todayStr()}
          onChange={(e) => setSessionDate(e.target.value)}
          style={{ background: 'var(--vl-surface-2)', border: '1px solid var(--vl-border)', borderRadius: 6, padding: '0.5rem', color: 'var(--vl-text-1)' }}
        />
      </div>
      <button
        className="btn-primary"
        style={{ marginBottom: '0.5rem' }}
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? 'Enregistrement…' : 'CONFIRMER ET ENREGISTRER'}
      </button>
      {saveMutation.isError && (
        <div className="mlabel" style={{ color: 'var(--vl-ember)', marginTop: 8 }}>
          Erreur : {(saveMutation.error as Error)?.message ?? String(saveMutation.error)}
        </div>
      )}
    </>
  )
}
