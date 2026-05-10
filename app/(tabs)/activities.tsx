import { useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useStravaStore, type StravaActivity } from '../../stores/useStravaStore'
import { colors } from '../../lib/colors'
import { metresToKm, speedToPace, formatDuration, formatDate } from '../../utils/pace'

const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun']

function ActivityCard({ item }: { item: StravaActivity }) {
  const typeColors: Record<string, string> = {
    TrailRun: colors.green,
    VirtualRun: colors.purple,
    Run: colors.cyan,
  }
  const accent = typeColors[item.type] ?? colors.cyan

  return (
    <View style={s.card}>
      <View style={[s.accent, { backgroundColor: accent }]} />
      <View style={s.cardInner}>
        <View style={s.cardTop}>
          <Text style={s.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={s.cardDate}>{formatDate(item.start_date)}</Text>
        </View>
        <View style={s.cardStats}>
          <Stat value={`${metresToKm(item.distance)} km`} />
          <Stat value={`${speedToPace(item.average_speed)}/km`} />
          <Stat value={formatDuration(item.moving_time)} />
          <Stat value={`+${Math.round(item.total_elevation_gain)} m`} />
          {item.average_heartrate != null ? (
            <Stat value={`${Math.round(item.average_heartrate)} bpm`} />
          ) : null}
        </View>
      </View>
    </View>
  )
}

function Stat({ value }: { value: string }) {
  return <Text style={s.stat}>{value}</Text>
}

export default function ActivitiesScreen() {
  const { activities, loading, error, connected, connectStrava, loadActivities, refreshActivities } =
    useStravaStore()

  useEffect(() => {
    void loadActivities()
  }, [])

  const runs = activities.filter((a) => RUN_TYPES.includes(a.type))

  if (!connected && !loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🏃</Text>
          <Text style={s.emptyTitle}>Aucune activité</Text>
          <Text style={s.emptyDesc}>Connecte ton compte Strava.</Text>
          <TouchableOpacity
            style={s.stravaBtn}
            onPress={() => void connectStrava()}
            activeOpacity={0.85}
          >
            <Text style={s.stravaBtnText}>Connecter Strava</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.container}>
      <FlatList
        data={runs}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <ActivityCard item={item} />}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Text style={s.pageTitle}>Activités</Text>
            <View style={s.headerRight}>
              {error ? <Text style={s.error}>{error}</Text> : null}
              <TouchableOpacity
                style={s.refreshBtn}
                onPress={() => void refreshActivities()}
                disabled={loading}
              >
                <Text style={s.refreshBtnText}>↻ Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.cyan} style={{ marginTop: 40 }} />
          ) : (
            <Text style={s.emptyText}>Aucune course.</Text>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void loadActivities()}
            tintColor={colors.cyan}
          />
        }
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 32 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { color: colors.red, fontSize: 11 },
  refreshBtn: {
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  refreshBtnText: { color: colors.cyan, fontSize: 12, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  accent: { width: 3 },
  cardInner: { flex: 1, padding: 12 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardName: { fontWeight: '700', fontSize: 14, color: colors.text, flex: 1, marginRight: 8 },
  cardDate: { fontSize: 11, color: colors.text3 },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { fontSize: 12, color: colors.text2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyEmoji: { fontSize: 40, opacity: 0.3 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 14, color: colors.text2 },
  stravaBtn: {
    backgroundColor: '#fc4c02',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  stravaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyText: { color: colors.text3, textAlign: 'center', marginTop: 40 },
})
