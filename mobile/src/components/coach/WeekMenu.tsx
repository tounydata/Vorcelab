import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import SessionProfile from '../SessionProfile'
import SessionFeedback, { type LinkActivity, type SessionLinkCtx } from '../SessionFeedback'
import RenfoDetail from './RenfoDetail'
import { ChevronLeft } from './CoachIcons'
import { getWorkout, type WorkoutSystem, type Intensity } from '@/lib/coach/workouts'
import { structureWorkout } from '@/lib/coach/structureWorkout'
import { scaleWorkout, type ModulationDir } from '@/lib/coach/sessionModulation'
import { FOCUS_META, RENFO_FOCUS_COLORS } from '@/lib/renfoData'
import type { PlanWeek } from '@/lib/coach/planGenerator'
import type { RenfoSlot } from '@/lib/coach/renfoFusion'
import type { SessionLogRow } from '@/lib/coach/sessionLog'
import { colors, radius } from '@/lib/theme'
import { Card, HButton, cardStyle } from './ui'

// MENU DE LA SEMAINE : une liste NUMÉROTÉE des séances réelles de la semaine —
// course ET renfo fusionnés, ordonnés par jour. L'athlète clique une séance pour
// voir le détail : course → profil + validation/liaison Strava ; renfo → suggestion.

const VERDICT_FR: Record<string, string> = {
  conforme: 'Conforme', trop_facile: 'Trop facile', trop_dur: 'Trop dur', a_surveiller: 'À surveiller',
}
const INTENSITY_DOTS: Record<Intensity, number> = { easy: 1, moderate: 3, hard: 4 }
const KEY_SYSTEMS = new Set<WorkoutSystem>(['threshold', 'vo2max', 'tempo', 'hills', 'descent', 'speed', 'race_pace', 'race', 'long'])
const DAY_SHORT = ['', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']
const RENFO_COLOR = colors.violet

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
  climbTargetM?: { min: number; max: number } | null
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

function fmtClimb(b: { min: number; max: number }): string {
  return b.min === b.max ? `${b.max} m D+` : `${b.min}–${b.max} m D+`
}

function DifficultyDots({ level }: { level: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: n <= level ? colors.ember : colors.line }} />
      ))}
    </View>
  )
}

export default function WeekMenu({ week, vdot, fcMax, activities, isCurrent, weekStartISO, renfoSlots, renfoPreferred, renfoAvoided, scale, doneByKey, onSaved }: {
  week: PlanWeek
  vdot: number
  fcMax?: number | null
  activities: LinkActivity[]
  isCurrent: boolean
  weekStartISO?: string
  renfoSlots: RenfoSlot[]
  renfoPreferred?: Set<string>
  renfoAvoided?: Set<string>
  scale?: { workoutId: string; dir: ModulationDir }
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
      climbTargetM: s.climbTargetM ?? null,
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
      <View>
        <HButton onPress={() => select(null)} style={{ marginBottom: 12, alignSelf: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={15} color={colors.text2} />
            <Text style={{ color: colors.text2, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>Retour</Text>
          </View>
        </HButton>
        {selected.kind === 'renfo' ? (
          <>
            <Text style={{ fontSize: 22, color: colors.text, fontWeight: '800', marginBottom: 12 }}>{selected.name}</Text>
            <RenfoDetail slotFocus={selected.focus} preferred={renfoPreferred} avoided={renfoAvoided} />
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
      </View>
    )
  }

  // ── Liste numérotée (le menu) ──
  return (
    <View>
      {items.map((it, i) => {
        const done = it.kind === 'run' ? doneRowFor(it) : undefined
        const color = it.kind === 'renfo' ? (RENFO_FOCUS_COLORS[it.focus] ?? RENFO_COLOR) : colors.ember
        const borderColor = done ? colors.growth : it.kind === 'run' && it.isKey ? colors.ember : colors.line
        return (
          <Pressable
            key={`${it.kind}-${i}`}
            onPress={() => select(it)}
            style={[cardStyle, { marginBottom: 12, borderColor }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.54, color: colors.text3 }}>
                  {DAY_SHORT[it.day]} · SÉANCE {i + 1}/{total}
                </Text>
                {it.kind === 'renfo' ? <Text style={{ fontSize: 9, fontWeight: '700', color, letterSpacing: 0.45 }}>RENFO</Text> : null}
                {it.kind === 'run' && it.isKey ? <Text style={{ fontSize: 9, fontWeight: '700', color: colors.ember, letterSpacing: 0.45 }}>SÉANCE CLÉ</Text> : null}
                {it.kind === 'renfo' && it.heavy ? <Text style={{ fontSize: 9, fontWeight: '700', color: colors.ember, letterSpacing: 0.45 }}>LOURD</Text> : null}
              </View>
              {done ? (
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.54, color: colors.growth, borderWidth: 1, borderColor: colors.growth, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, textTransform: 'uppercase', overflow: 'hidden' }}>✓ Faite</Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 19, color: colors.text, letterSpacing: 0.19, marginBottom: 6, fontWeight: '700' }}>{it.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, color: colors.text2 }}>{it.durationMin} min</Text>
              {it.kind === 'run' && it.climbTargetM ? (
                <Text style={{ fontSize: 11, color: colors.growth }}>{fmtClimb(it.climbTargetM)}</Text>
              ) : null}
              {it.kind === 'run' ? <DifficultyDots level={INTENSITY_DOTS[it.intensity]} /> : null}
            </View>
          </Pressable>
        )
      })}
      {total === 0 ? <Card><Text style={{ fontSize: 13, color: colors.text3 }}>Pas de séance cette semaine.</Text></Card> : null}
    </View>
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
  // Trail/côte : l'allure est trompeuse (D+, terrain) → on pilote à l'EFFORT (RPE).
  const effortMode: 'pace' | 'rpe' = template.climbing ? 'rpe' : 'pace'

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
    <View>
      <Text style={{ fontSize: 22, color: colors.text, marginBottom: 4, fontWeight: '700' }}>{item.name}</Text>
      <Text style={{ marginBottom: 8, fontSize: 13, color: colors.text2, lineHeight: 18 }}>{item.description}</Text>
      {item.climbTargetM ? (
        <Text style={{ marginBottom: 12, fontSize: 12, color: colors.growth }}>
          Objectif D+ · <Text style={{ fontWeight: '700' }}>{fmtClimb(item.climbTargetM)}</Text> <Text style={{ color: colors.text3 }}>(fourchette — progresse vers le D+ de ta course)</Text>
        </Text>
      ) : null}
      {effortMode === 'rpe' ? (
        <Text style={{ marginBottom: 12, fontSize: 11.5, color: colors.text3, lineHeight: 17 }}>
          Séance trail/côte : pilote à l’<Text style={{ color: colors.text2, fontWeight: '700' }}>effort (RPE)</Text>, pas à l’allure — le D+ et le terrain la faussent.
        </Text>
      ) : null}
      <SessionProfile workout={workout} effortMode={effortMode} />
      {doneRow ? (
        <View style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.growth, backgroundColor: 'rgba(93,160,132,0.12)' }}>
          <Text style={{ fontSize: 12.5, color: colors.growth }}>✓ Séance déjà validée — verdict : {VERDICT_FR[doneRow.verdict] ?? doneRow.verdict}</Text>
        </View>
      ) : null}
      {validated ? (
        <SessionFeedback link={link} onSaved={onSaved} />
      ) : (
        <HButton label="Valider ma séance" onPress={onValidate} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
      )}
    </View>
  )
}
