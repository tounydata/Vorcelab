import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { assessPain } from '@/lib/safetyGuards'
import { matchCandidates } from '@/lib/coach/activityMatch'
import { buildSessionVerdict } from '@/lib/coach/verdictFromActivity'
import { saveSessionLog } from '@/lib/coach/sessionLog'
import { fetchStreams } from '@/lib/streams'
import { computeCardiacDrift } from '@/lib/sessionQuality'
import type { SessionVerdict, VerdictResult } from '@/lib/coach/sessionVerdict'
import type { WorkoutTemplate } from '@/lib/coach/workouts'
import type { ActivityForLoad } from '@/lib/trainingLoad'
import SessionAdaptationSplash from './SessionAdaptationSplash'
import { CheckIcon } from './coach/CoachIcons'
import { Card, MLabel, CLabel } from './coach/ui'
import { colors, radius } from '@/lib/theme'

// Feedback post-séance NON ANXIOGÈNE : étage 1 = ressenti en 1 tap ; étage 2
// (optionnel) = raisons fixes ; la douleur n'apparaît QUE si l'athlète la signale.
// Si `link` est fourni (semaine courante), on propose en plus d'associer une
// activité Strava (TOUJOURS confirmée par l'athlète) pour compiler un verdict.

type Feeling = 'too_easy' | 'good' | 'meh' | 'too_hard'
const FEELINGS: { key: Feeling; label: string; color: string }[] = [
  { key: 'too_easy', label: 'Trop facile', color: '#3b82f6' },
  { key: 'good', label: 'Bien', color: colors.growth },
  { key: 'meh', label: 'Bof', color: colors.amber },
  { key: 'too_hard', label: 'Trop dur', color: colors.ember },
]
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
  trop_dur: { label: 'Trop dur', color: colors.ember },
  conforme: { label: 'Conforme', color: colors.growth },
  trop_facile: { label: 'Trop facile', color: '#3b82f6' },
  manquee: { label: 'Manquée', color: colors.text3 },
}

export default function SessionFeedback({ link, onSaved }: { link?: SessionLinkCtx; onSaved?: () => void }) {
  const [feeling, setFeeling] = useState<Feeling | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [painLevel, setPainLevel] = useState<number | null>(null)
  const [chosenActivityId, setChosenActivityId] = useState<string | 'none' | null>(null)
  const [verdict, setVerdict] = useState<VerdictResult | null>(null)
  const [splash, setSplash] = useState(false)
  const [saving, setSaving] = useState(false)

  const painAssessment = reason === 'Douleur' && painLevel !== null ? assessPain({ level: painLevel }) : null

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
    onSaved?.()
    if (result.verdict !== 'conforme') setSplash(true)
  }

  return (
    <Card style={{ marginTop: 12 }}>
      {splash ? <SessionAdaptationSplash onDone={() => setSplash(false)} /> : null}
      <CLabel style={{ marginBottom: 8 }}>Comment c’était ?</CLabel>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FEELINGS.map((f) => {
          const on = feeling === f.key
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                setFeeling(f.key)
                if (NO_ISSUE.includes(f.key)) { setReason(null); setPainLevel(null) }
              }}
              style={{
                width: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
                borderColor: on ? f.color : colors.line2, backgroundColor: colors.surf2,
              }}
            >
              <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: f.color }} />
              <Text style={{ color: on ? f.color : colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>{f.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {feeling && NO_ISSUE.includes(feeling) && !link ? (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CheckIcon size={14} color={colors.growth} />
          <Text style={{ fontSize: 12, color: colors.growth }}>{feeling === 'too_easy' ? 'Noté — on pourra progresser' : 'Noté, belle séance'}</Text>
        </View>
      ) : null}

      {feeling && !NO_ISSUE.includes(feeling) ? (
        <View style={{ marginTop: 10 }}>
          <MLabel style={{ marginBottom: 6 }}>Qu’est-ce qui a coincé ? (optionnel)</MLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => { setReason(r); if (r !== 'Douleur') setPainLevel(null) }}
                style={{
                  paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
                  borderColor: reason === r ? colors.ember : colors.line2, backgroundColor: colors.surf2,
                }}
              >
                <Text style={{ color: colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {reason === 'Douleur' ? (
        <View style={{ marginTop: 10 }}>
          <MLabel style={{ marginBottom: 6 }}>Niveau de douleur : {painLevel ?? 0}/10</MLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {Array.from({ length: 11 }, (_, n) => {
              const on = (painLevel ?? 0) === n
              return (
                <Pressable
                  key={n}
                  onPress={() => setPainLevel(n)}
                  style={{
                    width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: on ? colors.ember : colors.line2, backgroundColor: on ? colors.ember : colors.surf2,
                  }}
                >
                  <Text style={{ color: on ? colors.bg : colors.text2, fontSize: 12, fontWeight: '700' }}>{n}</Text>
                </Pressable>
              )
            })}
          </View>
          {painAssessment ? (
            <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: painAssessment.refer ? colors.ember : colors.text2 }}>
              {painAssessment.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Liaison à une activité (semaine courante, toujours confirmée) ── */}
      {link && feeling && !verdict ? (
        <View style={{ marginTop: 14 }}>
          <MLabel style={{ marginBottom: 6 }}>Quelle sortie correspond ? (tu confirmes)</MLabel>
          <View style={{ gap: 6 }}>
            {candidates.map((c) => {
              const id = activityId(c.activity)
              const km = c.activity.distance != null ? (c.activity.distance / 1000).toFixed(1) : '?'
              const min = c.activity.moving_time ? Math.round(c.activity.moving_time / 60) : '?'
              return (
                <Pressable
                  key={id}
                  onPress={() => setChosenActivityId(id)}
                  style={{
                    paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
                    borderColor: chosenActivityId === id ? colors.ember : colors.line2, backgroundColor: colors.surf2,
                  }}
                >
                  <Text style={{ color: colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>
                    {c.activity.name ?? 'Sortie'} · {km} km · {min} min
                  </Text>
                </Pressable>
              )
            })}
            <Pressable
              onPress={() => setChosenActivityId('none')}
              style={{
                paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
                borderColor: chosenActivityId === 'none' ? colors.ember : colors.line2, backgroundColor: colors.surf2,
              }}
            >
              <Text style={{ color: colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>Aucune activité — ressenti seul</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={computeVerdict}
            disabled={chosenActivityId === null || saving}
            style={{
              marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
              borderColor: colors.line2, backgroundColor: colors.surf2, alignItems: 'center',
              opacity: chosenActivityId === null || saving ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>{saving ? 'Analyse…' : 'Voir mon verdict'}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Verdict compilé ── */}
      {verdict ? (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 16, color: VERDICT_STYLE[verdict.verdict].color, fontWeight: '700' }}>{VERDICT_STYLE[verdict.verdict].label}</Text>
            <Text style={{ fontSize: 9, color: colors.text3 }}>confiance {verdict.confidence}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {verdict.signals.filter((s) => s.status !== 'unknown').map((s) => (
              <Text key={s.axis} style={{ fontSize: 11, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.surf2, color: colors.text2, overflow: 'hidden' }}>
                {s.label}
              </Text>
            ))}
          </View>
          <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.text2 }}>{verdict.summary}</Text>
        </View>
      ) : null}
    </Card>
  )
}
