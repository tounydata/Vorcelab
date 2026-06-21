import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { estimate1RM, workingLoad, FORCE_MAX_SCHEME } from '@/lib/oneRepMax'
import { colors, radius } from '@/lib/theme'
import { Card, HButton, MLabel } from './ui'

// Test de force 1RM GUIDÉ et SÛR : jamais un vrai 1RM brut. On guide l'athlète pas
// à pas — échauffement en rampe (avec minuteur de repos) puis UNE série test de 3-6
// reps propres — et on ESTIME le 1RM (Brzycki ≤6 / Epley ≥7). Enregistré dans renfo_max_lifts.

const KEY_LIFTS: { id: string; label: string }[] = [
  { id: 'squat_lourd', label: 'Squat' },
  { id: 'deadlift', label: 'Soulevé de terre' },
  { id: 'hip_thrust', label: 'Hip thrust' },
  { id: 'rdl', label: 'Soulevé roumain' },
  { id: 'soleus_raise', label: 'Mollet (soléaire)' },
]

const WARMUP: { label: string; sub: string; rest: number }[] = [
  { label: 'Barre à vide / léger', sub: '8-10 reps faciles', rest: 60 },
  { label: 'Charge modérée', sub: '5 reps', rest: 75 },
  { label: 'Charge lourde', sub: '2-3 reps (prépa nerveuse)', rest: 120 },
]

type Step = 'setup' | 'warmup' | 'test' | 'result'

function mmss(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export default function OneRMTestPopup({ open, onClose, onSaved }: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [step, setStep] = useState<Step>('setup')
  const [exId, setExId] = useState(KEY_LIFTS[0].id)
  const [wuIdx, setWuIdx] = useState(0)
  const [rest, setRest] = useState<number | null>(null)
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('5')
  const [savedRm, setSavedRm] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Réinitialise à chaque ouverture.
  useEffect(() => {
    if (open) { setStep('setup'); setWuIdx(0); setRest(null); setWeight(''); setReps('5'); setSavedRm(null) }
  }, [open])

  function advanceWarmup() {
    setWuIdx((i) => {
      if (i < WARMUP.length - 1) return i + 1
      setStep('test')
      return i
    })
  }

  // Minuteur de repos d'échauffement → auto-avance à la fin.
  useEffect(() => {
    if (rest == null) return
    if (rest <= 0) { setRest(null); advanceWarmup(); return }
    timer.current = setTimeout(() => setRest((r) => (r == null ? null : r - 1)), 1000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [rest]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(oneRm: number) {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('renfo_max_lifts').upsert({
      user_id: userId, exercise_id: exId, one_rm: oneRm,
      is_estimated: true, recorded_at: new Date().toISOString(),
    })
    setSaving(false)
    if (!error) { setSavedRm(oneRm); onSaved?.() }
  }

  if (!open) return null

  const lift = KEY_LIFTS.find((l) => l.id === exId)!
  const w = parseFloat(weight.replace(',', '.'))
  const r = parseInt(reps, 10)
  const valid = Number.isFinite(w) && w > 0 && Number.isFinite(r) && r >= 1 && r <= 12
  const oneRm = valid ? estimate1RM(w, r) : null

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 440, maxHeight: '92%' }}>
          <Card style={{ padding: 20, borderLeftWidth: 4, borderLeftColor: colors.ember }}>
            <ScrollView>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <Text style={{ fontWeight: '700', fontSize: 18, color: colors.text }}>Test de force · {lift.label}</Text>
                <HButton label="Fermer" onPress={onClose} style={{ paddingVertical: 3, paddingHorizontal: 8 }} />
              </View>

              {/* ── ÉTAPE 1 : choix du mouvement ── */}
              {step === 'setup' ? (
                <>
                  <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 19, marginBottom: 12 }}>
                    On <Text style={{ fontWeight: '700' }}>ne teste jamais</Text> un 1RM brut (risque de blessure). Je te guide :
                    échauffement en rampe, puis <Text style={{ fontWeight: '700' }}>une série de 3-6 reps propres</Text> — on estime ton 1RM (±5 %).
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.text2, marginBottom: 4 }}>Mouvement</Text>
                  <View style={{ gap: 6 }}>
                    {KEY_LIFTS.map((l) => {
                      const on = l.id === exId
                      return (
                        <Pressable key={l.id} onPress={() => setExId(l.id)}
                          style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: on ? colors.ember : colors.line2, backgroundColor: on ? colors.ember : colors.surf2 }}>
                          <Text style={{ color: on ? colors.bg : colors.text2, fontSize: 13, fontWeight: on ? '700' : '400' }}>{l.label}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <HButton label="Commencer l'échauffement →" onPress={() => { setWuIdx(0); setStep('warmup') }}
                    style={{ marginTop: 16, backgroundColor: colors.ember, borderColor: colors.ember }} textStyle={{ color: colors.bg }} />
                </>
              ) : null}

              {/* ── ÉTAPE 2 : échauffement guidé en rampe ── */}
              {step === 'warmup' ? (
                <>
                  <MLabel style={{ marginBottom: 8 }}>ÉCHAUFFEMENT · SÉRIE {wuIdx + 1}/{WARMUP.length}</MLabel>
                  <View style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 21, fontWeight: '800', color: colors.text }}>{WARMUP[wuIdx].label}</Text>
                    <Text style={{ fontSize: 13, color: colors.text2, marginTop: 4 }}>{WARMUP[wuIdx].sub}</Text>
                  </View>
                  {rest != null ? (
                    <View style={{ alignItems: 'center' }}>
                      <MLabel style={{ color: colors.text3, marginBottom: 4 }}>REPOS</MLabel>
                      <Text style={{ fontSize: 38, fontWeight: '800', color: colors.ember }}>{mmss(rest)}</Text>
                      <HButton label="Passer le repos →" onPress={() => { setRest(null); advanceWarmup() }} style={{ marginTop: 8 }} />
                    </View>
                  ) : (
                    <HButton label={`Série faite · démarrer le repos (${WARMUP[wuIdx].rest}s)`} onPress={() => setRest(WARMUP[wuIdx].rest)}
                      style={{ backgroundColor: colors.ember, borderColor: colors.ember }} textStyle={{ color: colors.bg }} />
                  )}
                  <HButton label="Passer à la série test →" onPress={() => { setRest(null); setStep('test') }} style={{ marginTop: 10 }} />
                </>
              ) : null}

              {/* ── ÉTAPE 3 : série test ── */}
              {step === 'test' ? (
                <>
                  <Text style={{ fontSize: 13, color: colors.text2, lineHeight: 20, marginBottom: 12 }}>
                    <Text style={{ fontWeight: '700' }}>Série test</Text> : prends une charge <Text style={{ fontWeight: '700' }}>difficile mais propre</Text> et fais
                    <Text style={{ fontWeight: '700' }}> 3 à 6 reps à fond</Text>. <Text style={{ color: colors.ember }}>Arrête-toi si la technique casse</Text> ou en cas de douleur.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: colors.text2, marginBottom: 4 }}>Charge (kg)</Text>
                      <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="ex. 80" placeholderTextColor={colors.text3}
                        style={{ padding: 10, backgroundColor: colors.surf2, color: colors.text, borderWidth: 1, borderColor: colors.line2, borderRadius: 6, fontSize: 14 }} />
                    </View>
                    <View style={{ width: 110 }}>
                      <Text style={{ fontSize: 12, color: colors.text2, marginBottom: 4 }}>Reps faites</Text>
                      <TextInput value={reps} onChangeText={setReps} keyboardType="number-pad"
                        style={{ padding: 10, backgroundColor: colors.surf2, color: colors.text, borderWidth: 1, borderColor: colors.line2, borderRadius: 6, fontSize: 14 }} />
                    </View>
                  </View>
                  <HButton label="Voir mon 1RM →" disabled={!valid} onPress={() => setStep('result')}
                    style={{ marginTop: 16, backgroundColor: valid ? colors.ember : colors.surf2, borderColor: valid ? colors.ember : colors.line2 }}
                    textStyle={{ color: valid ? colors.bg : colors.text3 }} />
                </>
              ) : null}

              {/* ── ÉTAPE 4 : résultat ── */}
              {step === 'result' && oneRm != null ? (
                <>
                  <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 12 }}>
                    <MLabel style={{ color: colors.text3 }}>1RM estimé · {lift.label}</MLabel>
                    <Text style={{ fontSize: 38, fontWeight: '800', color: colors.ember }}>{oneRm} kg</Text>
                  </View>
                  <View style={{ gap: 4, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.line }}>
                    <MLabel style={{ marginBottom: 2 }}>TES CHARGES DE TRAVAIL</MLabel>
                    {FORCE_MAX_SCHEME.map((s) => (
                      <Text key={s.label} style={{ fontSize: 12, color: colors.text2 }}>
                        {s.label} · {s.sets}×{s.reps} @ <Text style={{ fontWeight: '700' }}>{workingLoad(oneRm, s.pct)} kg</Text> <Text style={{ color: colors.text3 }}>({Math.round(s.pct * 100)} %)</Text>
                      </Text>
                    ))}
                  </View>
                  {savedRm === oneRm ? (
                    <Text style={{ marginTop: 12, fontSize: 12.5, color: colors.growth }}>✓ Enregistré. Tes séances de force lourde s'en serviront.</Text>
                  ) : (
                    <HButton label={saving ? 'Enregistrement…' : 'Enregistrer ce 1RM'} disabled={saving} onPress={() => save(oneRm)}
                      style={{ marginTop: 14, backgroundColor: colors.ember, borderColor: colors.ember, opacity: saving ? 0.6 : 1 }} textStyle={{ color: colors.bg }} />
                  )}
                  <HButton label="Tester un autre mouvement" onPress={() => { setStep('setup'); setSavedRm(null) }} style={{ marginTop: 10 }} />
                </>
              ) : null}
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
