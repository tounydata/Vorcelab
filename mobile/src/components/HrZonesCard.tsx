import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  computeHrZones, defaultZoneConfig, sanitizeBounds, missingInputFor,
  MODEL_LABEL, DEFAULT_BOUNDS,
  type HrZoneConfig, type HrZoneModel, type HrZoneInputs,
} from '@/lib/hrZones'
import { Card, HButton, colors, radius } from '@/components/coach/ui'

const MODELS: HrZoneModel[] = ['fcmax', 'hrr', 'lthr']
const MISSING_LABEL: Record<'fcMax' | 'restingHr' | 'lthr', string> = {
  fcMax: 'ta FCmax (onglet Profil)', restingHr: 'ta FC de repos (ci-dessous)', lthr: 'ta FC au seuil (ci-dessous)',
}

/** Carte ZONES FC — modèle au choix (%FCmax / Karvonen / LTHR) + bornes ajustables. */
export default function HrZonesCard({ config, inputs, saving, onSave }: {
  config: HrZoneConfig | null
  inputs: HrZoneInputs
  saving: boolean
  onSave: (cfg: HrZoneConfig) => void
}) {
  const effective = config ?? defaultZoneConfig('fcmax')
  const [editing, setEditing] = useState(false)
  const [model, setModel] = useState<HrZoneModel>(effective.model)
  const [pcts, setPcts] = useState<string[]>(effective.bounds.map((b) => String(Math.round(b * 100))))
  const [restingHr, setRestingHr] = useState(effective.restingHr ? String(effective.restingHr) : '')
  const [lthr, setLthr] = useState(effective.lthr != null ? String(effective.lthr) : (inputs.lthr ? String(inputs.lthr) : ''))

  function startEdit() {
    setModel(effective.model)
    setPcts(effective.bounds.map((b) => String(Math.round(b * 100))))
    setRestingHr(effective.restingHr ? String(effective.restingHr) : '')
    setLthr(effective.lthr != null ? String(effective.lthr) : (inputs.lthr ? String(inputs.lthr) : ''))
    setEditing(true)
  }
  function pickModel(m: HrZoneModel) { setModel(m); setPcts(DEFAULT_BOUNDS[m].map((b) => String(Math.round(b * 100)))) }
  function buildConfig(): HrZoneConfig {
    const bounds = sanitizeBounds(pcts.map((p) => (parseInt(p, 10) || 0) / 100), model)
    const cfg: HrZoneConfig = { model, bounds }
    if (model === 'hrr') cfg.restingHr = restingHr ? parseInt(restingHr, 10) : null
    if (model === 'lthr') cfg.lthr = lthr ? parseInt(lthr, 10) : null
    return cfg
  }
  const previewCfg = editing ? buildConfig() : effective
  const zones = computeHrZones(previewCfg, inputs)
  const missing = missingInputFor(previewCfg, inputs)
  const numInput = { width: 56, paddingVertical: 5, paddingHorizontal: 6, backgroundColor: colors.surf2, color: colors.text, borderWidth: 1, borderColor: colors.line2, borderRadius: 5, fontSize: 12 } as const

  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.68, fontWeight: '600' }}>ZONES FC · {MODEL_LABEL[previewCfg.model]}</Text>
        {!editing ? (
          <Pressable onPress={startEdit} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: colors.text3, fontSize: 10, letterSpacing: 0.4 }}>✏ Modifier</Text>
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {MODELS.map((m) => (
              <Pressable key={m} onPress={() => pickModel(m)} style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 5, borderWidth: 1, borderColor: model === m ? colors.ember : colors.line2, backgroundColor: model === m ? colors.ember : colors.surf2 }}>
                <Text style={{ fontSize: 11, color: model === m ? colors.bg : colors.text2 }}>{MODEL_LABEL[m]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 6 }}>
            {pcts.map((p, i) => (
              <View key={i}>
                <Text style={{ fontSize: 10, color: colors.text3, marginBottom: 2 }}>Z{i + 1}/Z{i + 2}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput value={p} onChangeText={(t) => setPcts((arr) => arr.map((x, j) => (j === i ? t : x)))} keyboardType="number-pad" style={numInput} />
                  <Text style={{ marginLeft: 2, color: colors.text3 }}>%</Text>
                </View>
              </View>
            ))}
          </View>
          {model === 'hrr' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: colors.text2 }}>FC de repos</Text>
              <TextInput value={restingHr} onChangeText={setRestingHr} keyboardType="number-pad" placeholder="50" placeholderTextColor={colors.text3} style={{ ...numInput, width: 70 }} />
              <Text style={{ fontSize: 11, color: colors.text2 }}>bpm</Text>
            </View>
          ) : null}
          {model === 'lthr' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: colors.text2 }}>FC au seuil (LTHR)</Text>
              <TextInput value={lthr} onChangeText={setLthr} keyboardType="number-pad" placeholder="170" placeholderTextColor={colors.text3} style={{ ...numInput, width: 70 }} />
              <Text style={{ fontSize: 11, color: colors.text2 }}>bpm</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 5 }}>
        {zones.map((z) => (
          <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: z.color }} />
            <Text style={{ flex: 1, color: colors.text2, fontSize: 12 }}>{z.label}</Text>
            <Text style={{ fontSize: 11, color: colors.text3 }}>{z.fromBpm == null ? '<' : `${z.fromBpm}–`}{z.toBpm == null ? `${z.fromBpm}+` : `${z.toBpm} bpm`}</Text>
          </View>
        ))}
      </View>

      {missing ? <Text style={{ fontSize: 10.5, color: colors.amber, marginTop: 8 }}>Renseigne {MISSING_LABEL[missing]} pour afficher les zones en bpm.</Text> : null}

      {editing ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <HButton label={saving ? 'Enregistrement…' : '💾 Enregistrer'} disabled={saving} onPress={() => { onSave(buildConfig()); setEditing(false) }} style={{ flex: 1, backgroundColor: colors.ember, borderColor: colors.ember, opacity: saving ? 0.6 : 1 }} textStyle={{ color: colors.bg }} />
          <HButton label="↺ Défaut" onPress={() => pickModel(model)} style={{ flex: 1 }} />
          <HButton label="Annuler" onPress={() => setEditing(false)} style={{ flex: 1 }} />
        </View>
      ) : null}
    </Card>
  )
}
