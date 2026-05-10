import { useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../../stores/useAuthStore'
import { useStravaStore } from '../../stores/useStravaStore'
import { useRaceStore } from '../../stores/useRaceStore'
import { colors } from '../../lib/colors'
import {
  metresToKm,
  speedToPace,
  formatDuration,
  formatDate,
} from '../../utils/pace'

function getRuns(activities: ReturnType<typeof useStravaStore.getState>['activities']) {
  return activities.filter((a) => ['Run', 'TrailRun', 'VirtualRun'].includes(a.type))
}

export default function DashboardScreen() {
  const { signOut } = useAuthStore()
  const { connected, athleteName, activities, loading, error, connectStrava, loadActivities } =
    useStravaStore()
  const { races, loadRaces } = useRaceStore()

  useEffect(() => {
    void loadActivities()
    void loadRaces()
  }, [])

  if (!connected && !loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.connectContainer}>
          <Text style={s.connectEmoji}>🏃</Text>
          <Text style={s.connectTitle}>Bienvenue sur VORCELAB</Text>
          <Text style={s.connectDesc}>
            Connecte ton compte Strava pour importer tes activités et débloquer le dashboard.
          </Text>
          {error ? <Text style={s.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={s.stravaBtn}
            onPress={() => void connectStrava()}
            activeOpacity={0.85}
          >
            <Text style={s.stravaBtnText}>Connecter Strava →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void signOut()} style={s.signOutLink}>
            <Text style={s.signOutText}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

  const runs = getRuns(activities)
  const thisMonth = runs.filter((a) => new Date(a.start_date) >= monthStart)
  const last7Days = runs.filter((a) => new Date(a.start_date) >= sevenDaysAgo)
  const last30Days = runs.filter((a) => new Date(a.start_date) >= thirtyDaysAgo)
  const latest = runs[0]

  const kmMonth = thisMonth.reduce((sum, a) => sum + a.distance, 0)
  const km7Days = last7Days.reduce((sum, a) => sum + a.distance, 0)
  const km30Days = last30Days.reduce((sum, a) => sum + a.distance, 0)
  const elevMonth = thisMonth.reduce((sum, a) => sum + a.total_elevation_gain, 0)
  const timeMonth = thisMonth.reduce((sum, a) => sum + a.moving_time, 0)
  const avgHrValues = thisMonth
    .map((a) => a.average_heartrate)
    .filter((v): v is number => typeof v === 'number')
  const avgHr =
    avgHrValues.length > 0
      ? Math.round(avgHrValues.reduce((s, v) => s + v, 0) / avgHrValues.length)
      : null

  const nextRace = races.find((r) => new Date(r.date) >= now)
  const daysToNext = nextRace
    ? Math.ceil((new Date(nextRace.date).getTime() - now.getTime()) / 86400000)
    : null

  const heroStats = [
    { value: metresToKm(kmMonth), label: 'km / mois', color: colors.cyan },
    { value: String(thisMonth.length), label: 'sorties mois', color: colors.green },
    { value: `+${Math.round(elevMonth)}`, label: 'D+ mois', color: colors.orange },
    { value: formatDuration(timeMonth), label: 'temps actif', color: colors.purple },
    { value: avgHr != null ? String(avgHr) : '—', label: 'FC moy.', color: colors.red },
    {
      value: nextRace && daysToNext != null ? `J-${daysToNext}` : '—',
      label: 'prochain objectif',
      color: colors.yellow,
    },
  ]

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void loadActivities()}
            tintColor={colors.cyan}
          />
        }
      >
        {/* Header */}
        <View style={s.pageHeader}>
          <View>
            <Text style={s.label}>Vorcelab · Running intelligence</Text>
            <Text style={s.pageTitle}>Dashboard</Text>
            {athleteName ? <Text style={s.athleteName}>{athleteName}</Text> : null}
          </View>
          <TouchableOpacity onPress={() => void signOut()} style={s.signOutBtn}>
            <Text style={s.signOutBtnText}>⏻</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        {/* Hero stats grid */}
        <View style={s.statsGrid}>
          {heroStats.map((cell) => (
            <View key={cell.label} style={s.statCell}>
              <Text style={[s.statValue, { color: cell.color }]}>{cell.value}</Text>
              <Text style={s.statLabel}>{cell.label}</Text>
            </View>
          ))}
        </View>

        {/* Latest activity */}
        {latest ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Dernière sortie</Text>
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle} numberOfLines={1}>
                  {latest.name}
                </Text>
                <Text style={s.cardMeta}>{formatDate(latest.start_date)}</Text>
              </View>
              <View style={s.cardRow}>
                <Text style={s.cardStat}>{metresToKm(latest.distance)} km</Text>
                <Text style={s.cardStat}>{speedToPace(latest.average_speed)}/km</Text>
                <Text style={s.cardStat}>+{Math.round(latest.total_elevation_gain)} m</Text>
                {latest.average_heartrate != null && (
                  <Text style={s.cardStat}>{Math.round(latest.average_heartrate)} bpm</Text>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {/* 7/30 days charge */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Charge récente</Text>
          <View style={s.rowCards}>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardBigValue}>{metresToKm(km7Days)} km</Text>
              <Text style={s.cardSubLabel}>7 derniers jours</Text>
              <Text style={s.cardMeta}>{last7Days.length} sorties</Text>
            </View>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardBigValue}>{metresToKm(km30Days)} km</Text>
              <Text style={s.cardSubLabel}>30 derniers jours</Text>
              <Text style={s.cardMeta}>{last30Days.length} sorties</Text>
            </View>
          </View>
        </View>

        {/* Next race */}
        {nextRace && daysToNext != null ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Prochain objectif</Text>
            <View style={s.card}>
              <Text style={[s.statValue, { color: colors.cyan }]}>{daysToNext}</Text>
              <Text style={s.cardSubLabel}>jours restants</Text>
              <Text style={s.cardTitle}>{nextRace.name}</Text>
              <Text style={s.cardMeta}>
                {[nextRace.distance && `${nextRace.distance} km`, nextRace.elevation && `+${nextRace.elevation} m D+`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Recent runs */}
        {runs.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Activités récentes</Text>
            {runs.slice(0, 10).map((a) => (
              <View key={a.id} style={[s.card, { marginBottom: 8 }]}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text style={s.cardMeta}>{formatDate(a.start_date)}</Text>
                </View>
                <View style={s.cardRow}>
                  <Text style={s.cardStat}>{metresToKm(a.distance)} km</Text>
                  <Text style={s.cardStat}>{speedToPace(a.average_speed)}/km</Text>
                  <Text style={s.cardStat}>+{Math.round(a.total_elevation_gain)} m</Text>
                  {a.average_heartrate != null && (
                    <Text style={s.cardStat}>{Math.round(a.average_heartrate)} bpm</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {loading && activities.length === 0 ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  connectContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  connectEmoji: { fontSize: 48, opacity: 0.4 },
  connectTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 1,
  },
  connectDesc: {
    fontSize: 14,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  stravaBtn: {
    backgroundColor: '#fc4c02',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    marginTop: 8,
  },
  stravaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  signOutLink: { marginTop: 8 },
  signOutText: { color: colors.text3, fontSize: 13 },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  label: { fontSize: 9, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.5 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2 },
  athleteName: { fontSize: 12, color: colors.text2, marginTop: 3 },
  signOutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border2,
  },
  signOutBtnText: { color: colors.text2, fontSize: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 20 },
  statCell: {
    width: '33.33%',
    padding: 4,
    backgroundColor: colors.bg2,
    borderWidth: 0,
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  statLabel: {
    fontSize: 9,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 3,
  },
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 9,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 4,
  },
  cardTitle: { fontWeight: '700', fontSize: 14, color: colors.text, flex: 1 },
  cardMeta: { fontSize: 11, color: colors.text3 },
  cardStat: { fontSize: 12, color: colors.text2, fontVariant: ['tabular-nums'] },
  cardBigValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  cardSubLabel: {
    fontSize: 9,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 3,
  },
  rowCards: { flexDirection: 'row', gap: 10 },
  errorText: { color: colors.red, fontSize: 12, marginBottom: 12, textAlign: 'center' },
})
