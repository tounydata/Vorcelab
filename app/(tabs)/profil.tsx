import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useProfileStore } from '../../stores/useProfileStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useStravaStore } from '../../stores/useStravaStore'
import { colors } from '../../lib/colors'

export default function ProfilScreen() {
  const { profile, loading, updateProfile, loadProfile } = useProfileStore()
  const { signOut } = useAuthStore()
  const { connected, athleteName, refreshActivities } = useStravaStore()
  const [fcMax, setFcMax] = useState('')
  const [lactate, setLactate] = useState('')
  const [weight, setWeight] = useState('')
  const [vo2max, setVo2max] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void loadProfile()
  }, [])

  useEffect(() => {
    if (profile) {
      setFcMax(profile.fc_max?.toString() ?? '')
      setLactate(profile.lactate_threshold?.toString() ?? '')
      setWeight(profile.weight?.toString() ?? '')
      setVo2max(profile.vo2max?.toString() ?? '')
    }
  }, [profile])

  async function handleSave() {
    await updateProfile({
      fc_max: fcMax ? Number(fcMax) : null,
      lactate_threshold: lactate ? Number(lactate) : null,
      weight: weight ? Number(weight) : null,
      vo2max: vo2max ? Number(vo2max) : null,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.pageTitle}>Profil athlète</Text>

          {/* Strava status */}
          <View style={s.stravaCard}>
            <View style={[s.dot, { backgroundColor: connected ? colors.green : colors.text3 }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.stravaLabel}>Strava</Text>
              {athleteName ? <Text style={s.athleteName}>{athleteName}</Text> : null}
            </View>
            {connected ? (
              <TouchableOpacity
                style={s.syncBtn}
                onPress={() => void refreshActivities()}
                activeOpacity={0.8}
              >
                <Text style={s.syncBtnText}>↻ Sync</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Profile form */}
          <View style={s.formCard}>
            <Text style={s.formTitle}>Données physiologiques</Text>
            <View style={s.row}>
              <Field label="FC max (bpm)">
                <TextInput
                  style={s.input}
                  value={fcMax}
                  onChangeText={setFcMax}
                  placeholder="185"
                  placeholderTextColor={colors.text3}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="Seuil lactique (bpm)">
                <TextInput
                  style={s.input}
                  value={lactate}
                  onChangeText={setLactate}
                  placeholder="165"
                  placeholderTextColor={colors.text3}
                  keyboardType="number-pad"
                />
              </Field>
            </View>
            <View style={s.row}>
              <Field label="Poids (kg)">
                <TextInput
                  style={s.input}
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="70"
                  placeholderTextColor={colors.text3}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="VO2max">
                <TextInput
                  style={s.input}
                  value={vo2max}
                  onChangeText={setVo2max}
                  placeholder="55"
                  placeholderTextColor={colors.text3}
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
            <TouchableOpacity
              style={[s.saveBtn, loading && s.saveBtnDisabled]}
              onPress={() => void handleSave()}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={s.saveBtnText}>
                {saved ? '✓ Enregistré' : loading ? '…' : 'Enregistrer'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={s.signOutBtn}
            onPress={() => void signOut()}
            activeOpacity={0.8}
          >
            <Text style={s.signOutBtnText}>Déconnexion</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 20 },
  stravaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stravaLabel: { fontSize: 13, color: colors.text2, fontWeight: '600' },
  athleteName: { fontSize: 11, color: colors.text3, marginTop: 2 },
  syncBtn: {
    backgroundColor: colors.bg4,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  syncBtnText: { color: colors.cyan, fontSize: 12, fontWeight: '600' },
  formCard: {
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  formTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  field: { flex: 1, marginBottom: 14 },
  fieldLabel: {
    fontSize: 10,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bg4,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: colors.cyan,
    borderRadius: 9,
    padding: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  signOutBtn: {
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
  },
  signOutBtnText: { color: colors.text2, fontSize: 14 },
})
