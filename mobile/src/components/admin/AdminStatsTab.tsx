import { Text, View } from 'react-native'
import { colors, font, radius } from '@/lib/theme'
import { Card, CLabel } from '@/components/coach/ui'
import {
  getEventBreakdown, getFunnel, getKpis, getSessionsDaily, getSignupsDaily, getWeeklyRetention,
} from '@/lib/adminApi'
import {
  BarChart, BarRow, EVENT_ICONS, EVENT_LABELS, Etat, KpiCard,
  fmtWeek, retentionColor, useAsync,
} from './adminUi'

// Onglet Statistiques — portage de `src/components/admin/StatsTab.tsx`. Mêmes RPC, mêmes
// indicateurs, mêmes dérivés (taux de conversion, % de la base, conversion d'étape,
// rétention hebdomadaire) et mêmes états vides.

function ChartFooter({ first, middle, middleColor }: {
  first: string | undefined
  middle: string
  middleColor: string
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
      <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }}>{first ?? '—'}</Text>
      <Text style={{ fontFamily: font.monoMedium, fontSize: 9, color: middleColor }}>{middle}</Text>
      <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }}>Aujourd’hui</Text>
    </View>
  )
}

function CardHead({ title, right }: { title: string; right?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <CLabel>{title}</CLabel>
      {right ? (
        <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }}>{right}</Text>
      ) : null}
    </View>
  )
}

export default function AdminStatsTab() {
  const kpis = useAsync(() => getKpis(), [])
  const signups = useAsync(() => getSignupsDaily(30), [])
  const sessions = useAsync(() => getSessionsDaily(30), [])
  const events = useAsync(() => getEventBreakdown(30), [])
  const funnel = useAsync(() => getFunnel(), [])
  const retention = useAsync(() => getWeeklyRetention(), [])

  const k = kpis.data
  const signupList = signups.data ?? []
  const sessionList = sessions.data ?? []
  const eventList = events.data ?? []
  const funnelList = funnel.data ?? []
  const retentionList = retention.data ?? []

  const pctOfBase = (n: number | undefined) =>
    k?.total_users ? Math.round(((n ?? 0) / k.total_users) * 100) : 0
  const convRate = k && k.total_users > 0 ? Math.round((k.pro_users / k.total_users) * 100) : 0
  const maxEvent = Math.max(...eventList.map((e) => e.total_count), 1)
  const funnelMax = funnelList[0]?.users ?? 1

  return (
    <View style={{ gap: 14 }}>
      <View>
        <CLabel>VUE D’ENSEMBLE</CLabel>
        <Etat state={kpis} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <KpiCard label="Total users" value={k?.total_users ?? 0} sub={`+${k?.new_users_30d ?? 0} ce mois`} />
          <KpiCard label="Actifs 7j" value={k?.active_users_7d ?? 0} sub={`${pctOfBase(k?.active_users_7d)}% de la base`} />
          <KpiCard label="Actifs 30j" value={k?.active_users_30d ?? 0} sub={`${pctOfBase(k?.active_users_30d)}% de la base`} />
          <KpiCard label="PRO actifs" value={k?.pro_users ?? 0} accent sub={`taux conv. ${convRate}%`} />
          <KpiCard label="Sessions/jour" value={k?.sessions_today ?? 0} sub={`${k?.sessions_7d ?? 0} cette semaine`} />
          <KpiCard label="Sessions 30j" value={k?.sessions_30d ?? 0} />
        </View>
      </View>

      <Card>
        <CardHead title="INSCRIPTIONS" right="30 jours" />
        <Etat state={signups} />
        <BarChart
          data={signupList.map((p) => ({ day: p.day.slice(5), value: p.signups ?? 0 }))}
          color={colors.growth}
        />
        <ChartFooter
          first={signupList[0]?.day?.slice(5)}
          middle={`+${k?.new_users_7d ?? 0} cette sem.`}
          middleColor={colors.growth}
        />
      </Card>

      <Card>
        <CardHead title="UTILISATEURS ACTIFS / JOUR" right="30 jours" />
        <Etat state={sessions} />
        <BarChart
          data={sessionList.map((p) => ({ day: p.day.slice(5), value: p.unique_users ?? 0 }))}
          color={colors.ember}
        />
        <ChartFooter
          first={sessionList[0]?.day?.slice(5)}
          middle={`${k?.active_users_7d ?? 0} uniques/sem.`}
          middleColor={colors.ember}
        />
      </Card>

      <Card>
        <CLabel>FUNNEL DE CONVERSION</CLabel>
        <Etat state={funnel} />
        {funnelList.map((s, i) => {
          const prev = funnelList[i - 1]?.users || 1
          return (
            <BarRow
              key={s.step}
              label={s.step}
              value={s.users}
              max={funnelMax}
              trailing={`${Math.round((s.users / funnelMax) * 100)}%`}
              sub={i > 0 ? `↓ ${Math.round((s.users / prev) * 100)}% étape` : undefined}
            />
          )
        })}
        <Text style={{
          marginTop: 12, padding: 10, borderRadius: radius.sm, backgroundColor: colors.surf2,
          fontFamily: font.mono, fontSize: 9.5, lineHeight: 16, color: colors.text3,
        }}>
          💡 <Text style={{ fontFamily: font.monoSemiBold, color: colors.text2 }}>Objectif :</Text> améliorer
          chaque étape du funnel. Focus sur le taux Strava → Course créée et Course créée → Coach.
        </Text>
      </Card>

      <Card>
        <CardHead title="USAGE DES FEATURES" right="30 derniers jours" />
        <Etat state={events} />
        {eventList.length === 0 && !events.loading ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
            Aucun événement enregistré
          </Text>
        ) : null}
        {eventList.map((ev) => (
          <BarRow
            key={ev.event}
            label={`${EVENT_ICONS[ev.event] ?? '•'} ${EVENT_LABELS[ev.event] ?? ev.event}`}
            value={ev.total_count}
            max={maxEvent}
            trailing={`${ev.unique_users} user${ev.unique_users > 1 ? 's' : ''}`}
          />
        ))}
      </Card>

      <Card>
        <CLabel>RÉTENTION HEBDOMADAIRE</CLabel>
        <Etat state={retention} />
        {retentionList.length === 0 && !retention.loading ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
            Pas encore assez de données
          </Text>
        ) : null}
        {retentionList.slice(-8).map((row) => {
          const pct = row.users_that_week > 0
            ? Math.round((row.returned_next_week / row.users_that_week) * 100)
            : 0
          return (
            <BarRow
              key={row.cohort_week}
              label={fmtWeek(row.cohort_week)}
              value={pct}
              max={100}
              color={retentionColor(pct)}
              trailing="%"
              sub={`${row.users_that_week} actifs · ${row.returned_next_week} revenus sem. suiv.`}
            />
          )
        })}
        <Text style={{
          marginTop: 10, fontFamily: font.mono, fontSize: 9, lineHeight: 14, color: colors.text3,
        }}>
          % d’utilisateurs actifs une semaine qui reviennent la semaine suivante.
          Vert ≥50% · Orange ≥25% · Rouge {'<'}25%
        </Text>
      </Card>
    </View>
  )
}
