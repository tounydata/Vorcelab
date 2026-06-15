import { useState } from 'react'
import SessionProfile from '../SessionProfile'
import SessionFeedback, { type LinkActivity, type SessionLinkCtx } from '../SessionFeedback'
import RenfoDetail from './RenfoDetail'
import { ChevronLeft } from './CoachIcons'
import { getWorkout, type WorkoutSystem, type Intensity } from '../../lib/coach/workouts'
import { structureWorkout } from '../../lib/coach/structureWorkout'
import { scaleWorkout, type ModulationDir } from '../../lib/coach/sessionModulation'
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../../lib/renfoData'
import type { PlanWeek } from '../../lib/coach/planGenerator'
import type { RenfoSlot } from '../../lib/coach/renfoFusion'
import type { SessionLogRow } from '../../lib/coach/sessionLog'

// MENU DE LA SEMAINE (principe « séances de la semaine » à la Campus Coach, UI maison) :
// une liste NUMÉROTÉE des séances réelles de la semaine — course ET renfo fusionnés,
// ordonnés par jour. L'athlète clique une séance pour voir le détail :
//  • course → profil structuré + validation/liaison Strava (semaine courante) ;
//  • renfo  → suggestion + catégories (excentrique, tronc…) recommandé/évité.

const VERDICT_FR: Record<string, string> = {
  conforme: 'Conforme', trop_facile: 'Trop facile', trop_dur: 'Trop dur', a_surveiller: 'À surveiller',
}
const INTENSITY_DOTS: Record<Intensity, number> = { easy: 1, moderate: 3, hard: 4 }
const KEY_SYSTEMS = new Set<WorkoutSystem>(['threshold', 'vo2max', 'tempo', 'hills', 'descent', 'speed', 'race_pace', 'race', 'long'])
const DAY_SHORT = ['', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']

function addDaysISO(weekStartISO: string, days: number): string {
  const d = new Date(weekStartISO + (weekStartISO.length <= 10 ? 'T00:00:00' : ''))
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

type RunItem = {
  kind: 'run'
  day: number
  workoutId: string
  name: string
  description: string
  durationMin: number
  intensity: Intensity
  isKey: boolean
  dateISO?: string
}
type RenfoItem = {
  kind: 'renfo'
  day: number
  focus: string
  name: string
  durationMin: number
  heavy: boolean
}
type Item = RunItem | RenfoItem

function DifficultyDots({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-label={`Difficulté ${level} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ width: 6, height: 6, borderRadius: 1, background: n <= level ? 'var(--vl-ember)' : 'var(--vl-line)' }} />
      ))}
    </span>
  )
}

export default function WeekMenu({ week, vdot, fcMax, activities, isCurrent, weekStartISO, renfoSlots, scale, doneByKey, onSaved }: {
  week: PlanWeek
  vdot: number
  fcMax?: number | null
  activities: LinkActivity[]
  isCurrent: boolean
  weekStartISO?: string
  renfoSlots: RenfoSlot[]
  /** Modulation v3 : adapte la séance qualité ciblée (semaine courante). */
  scale?: { workoutId: string; dir: ModulationDir }
  /** Séances validées, clé `${workoutId}@${dateISO}` → badge « faite » + verdict. */
  doneByKey?: Map<string, SessionLogRow>
  onSaved?: () => void
}) {
  const [selected, setSelected] = useState<Item | null>(null)
  const [validated, setValidated] = useState(false)

  // ── Construction de la liste unifiée (course + renfo), ordonnée par jour ──
  const runItems: RunItem[] = []
  for (const s of week.sessions) {
    const t = getWorkout(s.workoutId)
    if (!t) continue
    const wk = structureWorkout(t, vdot)
    runItems.push({
      kind: 'run',
      day: s.dayOfWeek ?? 1,
      workoutId: s.workoutId,
      name: t.name,
      description: t.description,
      durationMin: s.targetDurationMin ?? wk.totalMin,
      intensity: t.intensity,
      isKey: t.intensity === 'hard' || KEY_SYSTEMS.has(t.system),
      dateISO: weekStartISO ? addDaysISO(weekStartISO, (s.dayOfWeek ?? 1) - 1) : undefined,
    })
  }
  const renfoItems: RenfoItem[] = renfoSlots.map((sl) => ({
    kind: 'renfo',
    day: sl.dayOfWeek,
    focus: sl.focus,
    name: FOCUS_META[sl.focus]?.label ?? sl.focus,
    durationMin: FOCUS_META[sl.focus]?.duration_min ?? 0,
    heavy: sl.heavy,
  }))
  const items: Item[] = [...runItems, ...renfoItems].sort((a, b) => a.day - b.day)
  const total = items.length

  function doneRowFor(it: RunItem): SessionLogRow | undefined {
    return it.dateISO ? doneByKey?.get(`${it.workoutId}@${it.dateISO}`) : undefined
  }

  function select(it: Item | null) {
    setSelected(it)
    setValidated(!!(it && it.kind === 'run' && doneRowFor(it)))
  }

  // ── Détail d'une séance sélectionnée ──
  if (selected) {
    return (
      <div>
        <button className="hbtn" onClick={() => select(null)} style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ChevronLeft size={15} /> Retour
        </button>
        {selected.kind === 'renfo' ? (
          <>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, color: 'var(--vl-text)', margin: '0 0 12px' }}>{selected.name}</div>
            <RenfoDetail slotFocus={selected.focus} />
          </>
        ) : (
          <RunDetail
            item={selected}
            vdot={vdot} fcMax={fcMax ?? null} activities={activities}
            isCurrent={isCurrent} weekStartISO={weekStartISO} weekPhase={week.phase}
            scale={scale} doneRow={doneRowFor(selected)}
            validated={validated} onValidate={() => setValidated(true)} onSaved={onSaved}
          />
        )}
      </div>
    )
  }

  // ── Liste numérotée (le menu) ──
  return (
    <div>
      {items.map((it, i) => {
        const done = it.kind === 'run' ? doneRowFor(it) : undefined
        const color = it.kind === 'renfo' ? (RENFO_FOCUS_COLORS[it.focus] ?? 'var(--color-renfo)') : 'var(--vl-ember)'
        return (
          <button
            key={`${it.kind}-${i}`}
            className="card"
            onClick={() => select(it)}
            style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.75rem', cursor: 'pointer', border: done ? '1px solid var(--vl-growth)' : it.kind === 'run' && it.isKey ? '1px solid var(--vl-ember)' : undefined }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--vl-text-3)' }}>
                  {DAY_SHORT[it.day]} · SÉANCE {i + 1}/{total}
                </span>
                {it.kind === 'renfo' ? <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, color, letterSpacing: '.05em' }}>RENFO</span> : null}
                {it.kind === 'run' && it.isKey ? <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, color: 'var(--vl-ember)', letterSpacing: '.05em' }}>SÉANCE CLÉ</span> : null}
                {it.kind === 'renfo' && it.heavy ? <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, color: 'var(--vl-ember)', letterSpacing: '.05em' }}>LOURD</span> : null}
              </span>
              {done ? (
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--vl-growth)', border: '1px solid var(--vl-growth)', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>✓ Faite</span>
              ) : null}
            </div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: 19, color: 'var(--vl-text)', letterSpacing: '.01em', marginBottom: 6 }}>{it.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-2)' }}>{it.durationMin} min</span>
              {it.kind === 'run' ? <DifficultyDots level={INTENSITY_DOTS[it.intensity]} /> : null}
            </div>
          </button>
        )
      })}
      {total === 0 ? <div className="card" style={{ fontSize: 13, color: 'var(--vl-text-3)' }}>Pas de séance cette semaine.</div> : null}
    </div>
  )
}

// Détail d'une séance COURSE : profil structuré + validation / liaison Strava.
function RunDetail({ item, vdot, fcMax, activities, isCurrent, weekStartISO, weekPhase, scale, doneRow, validated, onValidate, onSaved }: {
  item: RunItem
  vdot: number
  fcMax: number | null
  activities: LinkActivity[]
  isCurrent: boolean
  weekStartISO?: string
  weekPhase?: string
  scale?: { workoutId: string; dir: ModulationDir }
  doneRow?: SessionLogRow
  validated: boolean
  onValidate: () => void
  onSaved?: () => void
}) {
  const template = getWorkout(item.workoutId)!
  let workout = structureWorkout(template, vdot)
  if (isCurrent && scale && scale.workoutId === item.workoutId) workout = scaleWorkout(workout, scale.dir).workout

  const link: SessionLinkCtx | undefined =
    isCurrent && weekStartISO && item.dateISO
      ? {
          template: { system: template.system, climbing: template.climbing },
          vdot, fcMax, weekStartISO, weekPhase,
          plannedDayOfWeek: item.day,
          plannedDateISO: item.dateISO,
          expectedDurationMin: item.durationMin,
          workoutId: item.workoutId,
          activities,
        }
      : undefined

  return (
    <div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, color: 'var(--vl-text)', margin: '0 0 4px' }}>{item.name}</div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.4 }}>{item.description}</p>
      <SessionProfile workout={workout} />
      {doneRow && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 'var(--vl-r-sm)', border: '1px solid var(--vl-growth)', background: 'color-mix(in srgb, var(--vl-growth) 12%, transparent)', fontSize: 12.5, color: 'var(--vl-growth)' }}>
          ✓ Séance déjà validée — verdict : {VERDICT_FR[doneRow.verdict] ?? doneRow.verdict}
        </div>
      )}
      {validated ? (
        <SessionFeedback link={link} onSaved={onSaved} />
      ) : (
        <button className="hbtn" onClick={onValidate} style={{ marginTop: 12 }}>Valider ma séance</button>
      )}
    </div>
  )
}
