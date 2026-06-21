import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import WeekMenu from './coach/WeekMenu'
import { fuseRenfoIntoWeek } from '@/lib/coach/renfoFusion'
import { computeCoPerioWarnings } from '@/lib/renfoUtils'
import type { SessionLogRow } from '@/lib/coach/sessionLog'
import { PHASE_LABELS } from '@/lib/coach/planGenerator'
import { ChevronLeft, ChevronRight } from './coach/CoachIcons'
import { type ModulationDir } from '@/lib/coach/sessionModulation'
import type { PlanWeek } from '@/lib/coach/planGenerator'
import type { LinkActivity } from './SessionFeedback'
import { Card, hbtnStyle } from './coach/ui'
import { colors } from '@/lib/theme'

function addDaysISO(weekStartISO: string, days: number): string {
  const d = new Date(weekStartISO + (weekStartISO.length <= 10 ? 'T00:00:00' : ''))
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'Cette semaine'
  if (offset === 1) return 'Semaine prochaine'
  return `Dans ${offset} semaines`
}

export interface HistoryDone {
  workoutId: string
  workoutName: string
  date: string
  verdict: string
}
export interface HistoryWeek {
  weekStartISO: string
  done: HistoryDone[]
}

const HISTORY_VERDICT: Record<string, { label: string; color: string }> = {
  conforme: { label: 'Conforme', color: colors.growth },
  trop_facile: { label: 'Trop facile', color: colors.amber },
  trop_dur: { label: 'Trop dur', color: colors.ember },
  a_surveiller: { label: 'À surveiller', color: colors.amber },
}

const FR_DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
function fmtDayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${FR_DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${FR_MONTHS[d.getMonth()]}`
}

function HistoryWeekView({ week }: { week: HistoryWeek }) {
  if (!week.done.length) {
    return <Card><Text style={{ fontSize: 13, color: colors.text3 }}>Aucune séance validée cette semaine-là.</Text></Card>
  }
  return (
    <View>
      {week.done.map((d, i) => {
        const v = HISTORY_VERDICT[d.verdict] ?? { label: d.verdict, color: colors.text2 }
        return (
          <Card key={i} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: 16, color: colors.text, fontWeight: '700' }}>{d.workoutName}</Text>
              <Text style={{ fontSize: 10, color: colors.text3 }}>{fmtDayDate(d.date)}</Text>
            </View>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.54, color: v.color, borderWidth: 1, borderColor: v.color, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, textTransform: 'uppercase', overflow: 'hidden' }}>✓ {v.label}</Text>
          </Card>
        )
      })}
    </View>
  )
}

/**
 * Programme HEBDOMADAIRE — une semaine à la fois, navigation ‹ ›.
 * Les séances sont décidées par l'algo (plan) et présentées en choix-first.
 */
export default function WeekProgram({ weeks, vdot, activities, fcMax, scale, logs, onSaved, pastWeeks, renfoSessionsPerWeek }: {
  weeks: PlanWeek[]
  vdot: number
  activities: LinkActivity[]
  fcMax?: number | null
  scale?: { workoutId: string; dir: ModulationDir }
  logs?: SessionLogRow[]
  onSaved?: () => void
  pastWeeks?: HistoryWeek[]
  renfoSessionsPerWeek?: number | null
}) {
  const pastN = pastWeeks?.length ?? 0
  const [offset, setOffset] = useState(0)

  if (weeks.length === 0 && pastN === 0) {
    return <Card><Text style={{ fontSize: 13, color: colors.text3 }}>Pas de programme.</Text></Card>
  }

  const off = Math.min(Math.max(offset, -pastN), weeks.length - 1)
  const isPast = off < 0
  const atStart = off === -pastN
  const atEnd = off === weeks.length - 1

  const navBar = (label: string, sub: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
      <Pressable onPress={() => setOffset(off - 1)} disabled={atStart} style={[hbtnStyle, { opacity: atStart ? 0.4 : 1 }]}>
        <ChevronLeft size={16} color={colors.text2} />
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 17, color: colors.text, fontWeight: '700' }}>{label}</Text>
        <Text style={{ fontSize: 9, color: colors.text3 }}>{sub}</Text>
      </View>
      <Pressable onPress={() => setOffset(off + 1)} disabled={atEnd} style={[hbtnStyle, { opacity: atEnd ? 0.4 : 1 }]}>
        <ChevronRight size={16} color={colors.text2} />
      </Pressable>
    </View>
  )

  // ── Semaine passée : historique des séances validées (lecture seule) ──
  if (isPast) {
    const hw = pastWeeks![pastN + off]
    const weeksAgo = -off
    const n = hw.done.length
    return (
      <View>
        {navBar(weeksAgo === 1 ? 'Semaine dernière' : `Il y a ${weeksAgo} semaines`, `${n} séance${n > 1 ? 's' : ''} validée${n > 1 ? 's' : ''}`)}
        <HistoryWeekView week={hw} />
      </View>
    )
  }

  // ── Semaine courante ou à venir (plan) ──
  const week = weeks[off]
  const isCurrent = off === 0

  // Co-périodisation (fatigue récente) — ne vaut que pour la semaine COURANTE.
  const coPerio = isCurrent ? computeCoPerioWarnings(activities as Parameters<typeof computeCoPerioWarnings>[0]) : []
  const avoided = new Set(coPerio.flatMap((w) => w.avoid))
  const preferred = new Set(coPerio.flatMap((w) => w.prefer))

  // Séances de renfo fusionnées dans CETTE semaine (course + renfo, même menu).
  const renfoSlots = fuseRenfoIntoWeek(week, renfoSessionsPerWeek ?? null, avoided)?.slots ?? []

  // Séances déjà validées (depuis session_log), clé `${workoutId}@${date}`.
  const doneByKey = (() => {
    const m = new Map<string, SessionLogRow>()
    if (!logs || !week.weekStartISO) return m
    for (const s of week.sessions) {
      const date = addDaysISO(week.weekStartISO, (s.dayOfWeek ?? 1) - 1)
      const row = logs.find((l) => l.planned_workout_id === s.workoutId && l.planned_date === date)
      if (row) m.set(`${s.workoutId}@${date}`, row)
    }
    return m
  })()

  return (
    <View>
      {navBar(weekLabel(off), `S${week.weekIndex + 1} · ${PHASE_LABELS[week.phase]}${week.isRecovery ? ' · DÉCHARGE' : ''}`)}

      {week.focus ? (
        <Text style={{ fontSize: 12, color: colors.text3, marginBottom: 12, lineHeight: 18 }}>{week.focus}</Text>
      ) : null}

      <WeekMenu
        key={off}
        week={week}
        vdot={vdot}
        fcMax={fcMax}
        activities={activities}
        isCurrent={isCurrent}
        weekStartISO={week.weekStartISO}
        renfoSlots={renfoSlots}
        renfoPreferred={preferred}
        renfoAvoided={avoided}
        scale={isCurrent ? scale : undefined}
        doneByKey={doneByKey}
        onSaved={onSaved}
      />
    </View>
  )
}
