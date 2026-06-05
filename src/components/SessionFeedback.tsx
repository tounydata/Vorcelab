import { useMemo, useState } from 'react'
import { assessPain } from '../lib/safetyGuards'
import { matchCandidates } from '../lib/coach/activityMatch'
import { buildSessionVerdict } from '../lib/coach/verdictFromActivity'
import { saveSessionLog } from '../lib/coach/sessionLog'
import { fetchStreams } from '../lib/streams'
import { computeCardiacDrift } from '../lib/sessionQuality'
import type { SessionVerdict, VerdictResult } from '../lib/coach/sessionVerdict'
import type { WorkoutTemplate } from '../lib/coach/workouts'
import type { ActivityForLoad } from '../lib/trainingLoad'
import SessionAdaptationSplash from './SessionAdaptationSplash'
import { CheckIcon } from './coach/CoachIcons'

// Feedback post-séance NON ANXIOGÈNE : étage 1 = ressenti en 1 tap ; étage 2
// (optionnel) = raisons fixes ; la douleur n'apparaît QUE si l'athlète la signale.
// Si `link` est fourni (semaine courante), on propose en plus d'associer une
// activité Strava (TOUJOURS confirmée par l'athlète) pour compiler un verdict.

// Échelle de difficulté ressentie (gradient facile → dur). « Bien » = conforme aux
// attentes (et non « trop facile ») : un footing facile vécu bien est exactement le but.
type Feeling = 'too_easy' | 'good' | 'meh' | 'too_hard'
const FEELINGS: { key: Feeling; label: string; color: string }[] = [
  { key: 'too_easy', label: 'Trop facile', color: '#3b82f6' },
  { key: 'good', label: 'Bien', color: 'var(--vl-growth)' },
  { key: 'meh', label: 'Bof', color: 'var(--vl-amber)' },
  { key: 'too_hard', label: 'Trop dur', color: 'var(--vl-ember)' },
]
// Ressentis « sans souci » : pas de questionnaire « qu'est-ce qui a coincé ? ».
const NO_ISSUE: Feeling[] = ['too_easy', 'good']

const REASONS = ['Allures trop dures', 'Trop long', 'Pas en forme', 'Douleur'] as const

export type LinkActivity = ActivityForLoad & {
  id?: string | number | null
  strava_activity_id?: string | number | null
  name?: string | null
}

export interface SessionLinkCtx {
  template: Pick<WorkoutTemplate, 'system' | 'climbing'>
  vdot: number | null
  fcMax: number | null
  weekStartISO: string
  weekPhase?: string
  plannedDayOfWeek: number
  plannedDateISO: string
  expectedDurationMin: number | null
  workoutId: string
  activities: LinkActivity[]
}

const VERDICT_STYLE: Record<SessionVerdict, { label: string; color: string }> = {
  trop_dur: { label: 'Trop dur', color: 'var(--vl-ember)' },
  conforme: { label: 'Conforme', color: 'var(--vl-growth)' },
  trop_facile: { label: 'Trop facile', color: '#3b82f6' },
  manquee: { label: 'Manquée', color: 'var(--vl-text-3)' },
}

export default function SessionFeedback({ link }: { link?: SessionLinkCtx }) {
  const [feeling, setFeeling] = useState<Feeling | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [painLevel, setPainLevel] = useState<number | null>(null)
  const [chosenActivityId, setChosenActivityId] = useState<string | 'none' | null>(null)
  const [verdict, setVerdict] = useState<VerdictResult | null>(null)
  const [splash, setSplash] = useState(false)
  const [saving, setSaving] = useState(false)

  const painAssessment = reason === 'Douleur' && painLevel !== null ? assessPain({ level: painLevel }) : null

  // Candidates d'activités (course à pied, semaine lundi→dimanche), classées.
  const candidates = useMemo(() => {
    if (!link) return []
    return matchCandidates(link.weekStartISO, link.plannedDayOfWeek, link.expectedDurationMin, link.activities)
  }, [link])

  function activityId(a: LinkActivity): string {
    return String(a.strava_activity_id ?? a.id ?? a.start_date)
  }

  async function computeVerdict() {
    if (!link || !feeling) return
    const chosen = chosenActivityId && chosenActivityId !== 'none'
      ? link.activities.find((a) => activityId(a) === chosenActivityId) ?? null
      : null

    setSaving(true)
    // Streams Strava → dérive cardiaque RÉELLE (1re vs 2e moitié) pour affiner le verdict.
    let driftPct: number | null = null
    if (chosen) {
      const sid = chosen.strava_activity_id ?? chosen.id
      if (sid != null) {
        try {
          const streams = await fetchStreams(sid)
          driftPct = computeCardiacDrift(streams)?.driftPct ?? null
        } catch { /* streams indisponibles → dérive non mesurée */ }
      }
    }
    const chosenWithDrift = chosen ? { ...chosen, driftPct } : null

    const { result } = buildSessionVerdict(
      link.template, link.vdot, link.fcMax, chosenWithDrift,
      { feeling, rpe: null, pain: reason === 'Douleur' },
    )
    setVerdict(result)
    await saveSessionLog({
      plannedWorkoutId: link.workoutId,
      plannedDateISO: link.plannedDateISO,
      weekPhase: link.weekPhase,
      stravaActivityId: chosen ? activityId(chosen) : null,
      verdict: result.verdict,
      confidence: result.confidence,
      compliancePace: result.signals.find((s) => s.axis === 'allure')?.status ?? null,
      avgHrPctMax: chosen && link.fcMax && chosen.average_heartrate ? +(chosen.average_heartrate / link.fcMax).toFixed(3) : null,
      hrDriftPct: driftPct,
      dplusM: chosen?.total_elevation_gain ?? null,
      durationMin: chosen?.moving_time ? Math.round(chosen.moving_time / 60) : null,
      feeling,
      reasons: reason ? [reason] : [],
      pain: reason === 'Douleur',
    })
    setSaving(false)
    if (result.verdict !== 'conforme') setSplash(true)
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {splash ? <SessionAdaptationSplash onDone={() => setSplash(false)} /> : null}
      <div className="clabel" style={{ margin: '0 0 8px' }}>Comment c'était ?</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {FEELINGS.map((f) => {
          const on = feeling === f.key
          return (
            <button
              key={f.key}
              className="hbtn"
              onClick={() => {
                setFeeling(f.key)
                if (NO_ISSUE.includes(f.key)) { setReason(null); setPainLevel(null) }
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderColor: on ? f.color : undefined, color: on ? f.color : undefined }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
              {f.label}
            </button>
          )
        })}
      </div>

      {feeling && NO_ISSUE.includes(feeling) && !link ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--vl-growth)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckIcon size={14} /> {feeling === 'too_easy' ? 'Noté — on pourra progresser' : 'Noté, belle séance'}
        </div>
      ) : null}

      {feeling && !NO_ISSUE.includes(feeling) ? (
        <div style={{ marginTop: 10 }}>
          <div className="mlabel" style={{ marginBottom: 6 }}>Qu'est-ce qui a coincé ? (optionnel)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map((r) => (
              <button
                key={r}
                className="hbtn"
                onClick={() => { setReason(r); if (r !== 'Douleur') setPainLevel(null) }}
                style={{ borderColor: reason === r ? 'var(--vl-ember)' : undefined }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {reason === 'Douleur' ? (
        <div style={{ marginTop: 10 }}>
          <div className="mlabel" style={{ marginBottom: 6 }}>Niveau de douleur : {painLevel ?? 0}/10</div>
          <input
            type="range" min={0} max={10} value={painLevel ?? 0}
            onChange={(e) => setPainLevel(Number(e.target.value))}
            style={{ width: '100%' }}
            aria-label="Niveau de douleur 0 à 10"
          />
          {painAssessment ? (
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4, color: painAssessment.refer ? 'var(--vl-ember)' : 'var(--vl-text-2)' }}>
              {painAssessment.message}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Liaison à une activité (semaine courante, toujours confirmée) ── */}
      {link && feeling && !verdict ? (
        <div style={{ marginTop: 14 }}>
          <div className="mlabel" style={{ marginBottom: 6 }}>Quelle sortie correspond ? (tu confirmes)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map((c) => {
              const id = activityId(c.activity)
              const km = c.activity.distance != null ? (c.activity.distance / 1000).toFixed(1) : '?'
              const min = c.activity.moving_time ? Math.round(c.activity.moving_time / 60) : '?'
              return (
                <button
                  key={id}
                  className="hbtn"
                  onClick={() => setChosenActivityId(id)}
                  style={{ textAlign: 'left', borderColor: chosenActivityId === id ? 'var(--vl-ember)' : undefined }}
                >
                  {c.activity.name ?? 'Sortie'} · {km} km · {min} min
                </button>
              )
            })}
            <button
              className="hbtn"
              onClick={() => setChosenActivityId('none')}
              style={{ borderColor: chosenActivityId === 'none' ? 'var(--vl-ember)' : undefined }}
            >
              Aucune activité — ressenti seul
            </button>
          </div>
          <button
            className="hbtn"
            onClick={computeVerdict}
            disabled={chosenActivityId === null || saving}
            style={{ marginTop: 10, opacity: chosenActivityId === null || saving ? 0.5 : 1 }}
          >
            {saving ? 'Analyse…' : 'Voir mon verdict'}
          </button>
        </div>
      ) : null}

      {/* ── Verdict compilé ── */}
      {verdict ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--vl-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontFamily: 'var(--vl-display)', fontSize: 16,
              color: VERDICT_STYLE[verdict.verdict].color,
            }}>
              {VERDICT_STYLE[verdict.verdict].label}
            </span>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
              confiance {verdict.confidence}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {verdict.signals.filter((s) => s.status !== 'unknown').map((s) => (
              <span key={s.axis} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: 'var(--vl-surface-2)', color: 'var(--vl-text-2)',
              }}>
                {s.label}
              </span>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--vl-text-2)' }}>{verdict.summary}</p>
        </div>
      ) : null}
    </div>
  )
}
