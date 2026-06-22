import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { vmaFromHalfCooperM, CS_TO_VMA } from '@/lib/criticalSpeed'
import { colors, radius } from '@/lib/theme'

// Carte de calibrage VMA (test demi-Cooper) — endroit PERMANENT (Profil › LABO) où
// l'athlète peut faire/refaire le test quand il veut.

const FR_MON = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${FR_MON[d.getMonth()]} ${d.getFullYear()}`
}

export default function CalibrationCard({ onSaved }: { onSaved?: () => void }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [dist, setDist] = useState('')
  const [saving, setSaving] = useState(false)
  const [demi, setDemi] = useState<{ distanceM?: number | null; dateISO?: string | null } | null>(null)

  const load = () => {
    if (!userId) return
    supabase.from('profiles').select('demi_cooper').eq('id', userId).maybeSingle()
      .then(({ data }) => setDemi((data?.demi_cooper ?? null) as { distanceM?: number | null; dateISO?: string | null } | null))
  }
  useEffect(load, [userId])

  const m = parseInt(dist, 10)
  const valid = Number.isFinite(m) && m >= 800 && m <= 3000
  const vmaKmh = valid ? +(vmaFromHalfCooperM(m) * 3.6).toFixed(1) : null
  const csKmh = vmaKmh != null ? +(vmaKmh * CS_TO_VMA).toFixed(1) : null
  const savedM = demi?.distanceM ?? null

  async function save() {
    if (!valid || !userId) return
    setSaving(true)
    await supabase.from('profiles').update({ demi_cooper: { distanceM: m, dateISO: new Date().toISOString().slice(0, 10) } }).eq('id', userId)
    setSaving(false); setDist(''); load(); onSaved?.()
  }

  return (
    <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: colors.status.peak, borderRadius: radius.md, padding: 16, marginBottom: 16 }}>
      <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.68, fontWeight: '600', marginBottom: 6 }}>TEST VMA · DEMI-COOPER</Text>
      <Text style={{ fontSize: 13, color: colors.text2, lineHeight: 19, marginBottom: 10 }}>
        6 min à fond après échauffement, puis entre la distance couverte. Ça cale ta VMA / vitesse seuil et fiabilise toutes tes allures. À refaire quand ta forme évolue.
      </Text>
      {savedM ? (
        <Text style={{ fontSize: 11.5, color: colors.growth, marginBottom: 10 }}>
          Dernier test : <Text style={{ fontWeight: '700' }}>{savedM} m</Text>{demi?.dateISO ? ` · ${fmtDate(demi.dateISO)}` : ''} — ≈ VMA {(vmaFromHalfCooperM(savedM) * 3.6).toFixed(1)} km/h
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TextInput value={dist} onChangeText={setDist} keyboardType="number-pad" placeholder="Distance en 6 min (m)" placeholderTextColor={colors.text3}
          style={{ width: 170, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: colors.surf2, color: colors.text, borderWidth: 1, borderColor: colors.line2, borderRadius: 6, fontSize: 13 }} />
        <Pressable onPress={save} disabled={!valid || saving}
          style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: valid ? colors.ember : colors.surf2, opacity: saving ? 0.6 : 1 }}>
          <Text style={{ color: valid ? colors.bg : colors.text3, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.84 }}>{saving ? 'Enregistrement…' : savedM ? 'Mettre à jour' : 'Enregistrer le test'}</Text>
        </Pressable>
      </View>
      {csKmh != null ? <Text style={{ fontSize: 11.5, color: colors.text3, marginTop: 8 }}>≈ VMA {vmaKmh} km/h · CS (allure ~60 min) {csKmh} km/h</Text> : null}
    </View>
  )
}
