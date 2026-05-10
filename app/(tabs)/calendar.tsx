import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRaceStore, type Race, type RaceInsert } from '../../stores/useRaceStore'
import { colors } from '../../lib/colors'

const RACE_TYPES = ['Trail', 'Route', 'Ultra', 'Cross'] as const

function AddRaceForm({ onSaved }: { onSaved: () => void }) {
  const { addRace, loading } = useRaceStore()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [distance, setDistance] = useState('')
  const [elevation, setElevation] = useState('')
  const [type, setType] = useState<string>('Trail')
  const [goalTime, setGoalTime] = useState('')

  async function handleSave() {
    if (!name.trim() || !date.trim()) {
      Alert.alert('Champs requis', 'Le nom et la date sont obligatoires.')
      return
    }
    const raceData: RaceInsert = {
      name: name.trim(),
      date,
      distance: distance ? Number(distance) : null,
      elevation: elevation ? Number(elevation) : null,
      type,
      goal_time: goalTime || null,
    }
    await addRace(raceData)
    onSaved()
  }

  return (
    <View style={sf.formCard}>
      <Text style={sf.formTitle}>Nouvelle course</Text>
      <Field label="Nom *">
        <TextInput
          style={sf.input}
          value={name}
          onChangeText={setName}
          placeholder="Trail du Muguet"
          placeholderTextColor={colors.text3}
        />
      </Field>
      <Field label="Date * (YYYY-MM-DD)">
        <TextInput
          style={sf.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-09-15"
          placeholderTextColor={colors.text3}
          keyboardType="numbers-and-punctuation"
        />
      </Field>
      <View style={sf.row}>
        <View style={{ flex: 1 }}>
          <Field label="Distance (km)">
            <TextInput
              style={sf.input}
              value={distance}
              onChangeText={setDistance}
              placeholder="42"
              placeholderTextColor={colors.text3}
              keyboardType="decimal-pad"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="D+ (m)">
            <TextInput
              style={sf.input}
              value={elevation}
              onChangeText={setElevation}
              placeholder="1200"
              placeholderTextColor={colors.text3}
              keyboardType="number-pad"
            />
          </Field>
        </View>
      </View>
      <Field label="Type">
        <View style={sf.typeRow}>
          {RACE_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setType(t)}
              style={[sf.typeBtn, type === t && sf.typeBtnActive]}
            >
              <Text style={[sf.typeBtnText, type === t && sf.typeBtnTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Field>
      <Field label="Objectif (ex: 4:30:00)">
        <TextInput
          style={sf.input}
          value={goalTime}
          onChangeText={setGoalTime}
          placeholder="4:30:00"
          placeholderTextColor={colors.text3}
          keyboardType="numbers-and-punctuation"
        />
      </Field>
      <TouchableOpacity
        style={[sf.saveBtn, loading && sf.saveBtnDisabled]}
        onPress={() => void handleSave()}
        disabled={loading}
        activeOpacity={0.85}
      >
        <Text style={sf.saveBtnText}>{loading ? '…' : 'Enregistrer'}</Text>
      </TouchableOpacity>
    </View>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={sf.field}>
      <Text style={sf.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

function RaceItem({ race, onDelete }: { race: Race; onDelete: (id: string) => Promise<void> }) {
  const date = new Date(race.date)
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86400000)
  const upcoming = daysLeft > 0

  return (
    <View style={sr.item}>
      <View style={sr.dateBox}>
        <Text style={sr.dateDay}>{date.getDate()}</Text>
        <Text style={sr.dateMonth}>
          {date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
        </Text>
      </View>
      <View style={sr.info}>
        <Text style={sr.name} numberOfLines={1}>
          {race.name}
        </Text>
        <Text style={sr.meta}>
          {[race.distance && `${race.distance} km`, race.elevation && `+${race.elevation} m`, race.type]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {upcoming ? <Text style={sr.countdown}>J-{daysLeft}</Text> : null}
      </View>
      <TouchableOpacity
        onPress={() => {
          Alert.alert('Supprimer', `Supprimer "${race.name}" ?`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => void onDelete(race.id) },
          ])
        }}
        style={sr.deleteBtn}
      >
        <Text style={sr.deleteBtnText}>×</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function CalendarScreen() {
  const { races, loading, loadRaces, deleteRace } = useRaceStore()
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    void loadRaces()
  }, [])

  const now = new Date()
  const upcoming = races.filter((r) => new Date(r.date) >= now)
  const past = races.filter((r) => new Date(r.date) < now)

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={s.pageTitle}>Calendrier</Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setShowForm(!showForm)}
            activeOpacity={0.8}
          >
            <Text style={s.addBtnText}>{showForm ? '✕' : '+ Ajouter'}</Text>
          </TouchableOpacity>
        </View>

        {showForm ? (
          <AddRaceForm
            onSaved={() => {
              setShowForm(false)
              void loadRaces()
            }}
          />
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: 32 }} />
        ) : (
          <>
            {upcoming.length > 0 ? (
              <View style={s.section}>
                <Text style={s.sectionLabel}>À venir</Text>
                {upcoming.map((r) => (
                  <RaceItem key={r.id} race={r} onDelete={deleteRace} />
                ))}
              </View>
            ) : null}
            {past.length > 0 ? (
              <View style={[s.section, { opacity: 0.55 }]}>
                <Text style={s.sectionLabel}>Passées</Text>
                {past.map((r) => (
                  <RaceItem key={r.id} race={r} onDelete={deleteRace} />
                ))}
              </View>
            ) : null}
            {races.length === 0 ? (
              <Text style={s.empty}>Aucune course planifiée.\nAppuie sur + Ajouter.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  addBtn: {
    backgroundColor: colors.cyan,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 9,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  empty: { color: colors.text2, textAlign: 'center', marginTop: 40, lineHeight: 22 },
})

const sf = StyleSheet.create({
  formCard: {
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 14 },
  field: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 10,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  input: {
    backgroundColor: colors.bg4,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 10 },
  typeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  typeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.bg4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeBtnActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  typeBtnText: { fontSize: 12, color: colors.text2 },
  typeBtnTextActive: { color: '#000', fontWeight: '700' },
  saveBtn: {
    backgroundColor: colors.cyan,
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
})

const sr = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 13,
    marginBottom: 8,
  },
  dateBox: { alignItems: 'center', minWidth: 44 },
  dateDay: { fontSize: 22, fontWeight: '800', color: colors.text, lineHeight: 24 },
  dateMonth: { fontSize: 10, color: colors.text3, textTransform: 'uppercase' },
  info: { flex: 1 },
  name: { fontWeight: '600', fontSize: 14, color: colors.text, marginBottom: 3 },
  meta: { fontSize: 11, color: colors.text2 },
  countdown: { fontSize: 11, color: colors.cyan, marginTop: 3 },
  deleteBtn: { padding: 6 },
  deleteBtnText: { color: colors.text3, fontSize: 20, lineHeight: 22 },
})
