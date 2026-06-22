import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import type { ProjectionResult } from '@/lib/computeRaceProjection'
import type { NutritionRow } from '@/lib/nutritionPlan'
import type { RavitoPoint, UnclassifiedWaypoint, CrewCheckpoint } from '@/lib/crewPlan'
import { generateCrewPlan } from '@/lib/crewPlan'
import { Card, CLabel, MLabel, HButton, colors, radius } from '@/components/coach/ui'

interface Props {
  projection: ProjectionResult
  nutritionRows: NutritionRow[]
  ravitos: RavitoPoint[]
  unclassifiedWaypoints: UnclassifiedWaypoint[]
  onAddRavito: (r: RavitoPoint) => void
  onRemoveRavito: (km: number) => void
  onPromoteWaypoint: (w: UnclassifiedWaypoint) => void
  athleteName: string
  startTime?: string | null
}

export default function CrewPlan({ projection, nutritionRows, ravitos, unclassifiedWaypoints, onAddRavito, onRemoveRavito, onPromoteWaypoint, athleteName, startTime }: Props) {
  const [newKm, setNewKm] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const totalKm = projection.totalDistM / 1000
  const checkpoints: CrewCheckpoint[] = generateCrewPlan(projection, nutritionRows, ravitos, startTime)
  const hasClock = checkpoints.some((c) => c.clockCible)

  function handleAddRavito() {
    const km = parseFloat(newKm.replace(',', '.'))
    if (isNaN(km) || km <= 0 || km >= totalKm) return
    onAddRavito({ km, label: newLabel || `Ravito ${km} km`, source: 'manual' })
    setNewKm(''); setNewLabel('')
  }

  const input = { backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, color: colors.text, fontSize: 13 } as const

  return (
    <View>
      {/* Ravitos */}
      <Card style={{ marginBottom: 16 }}>
        <CLabel style={{ marginBottom: 8 }}>RAVITAILLEMENTS</CLabel>
        {ravitos.length === 0 && unclassifiedWaypoints.length === 0 ? (
          <Text style={{ marginBottom: 12, color: colors.text2, fontStyle: 'italic', fontSize: 12.5, lineHeight: 18 }}>
            Renseignez les emplacements des ravitaillements (km de course) pour personnaliser votre plan assistance.
          </Text>
        ) : null}

        {ravitos.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            {ravitos.map((r) => (
              <View key={r.km} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <Text style={{ flex: 1, fontSize: 12, color: colors.text2 }}>
                  {r.source === 'gpx' ? <Text style={{ color: colors.growth, fontSize: 10 }}>GPX </Text> : null}{r.label}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: colors.text2 }}>{r.km.toFixed(1)} km</Text>
                  <HButton label="✕" onPress={() => onRemoveRavito(r.km)} style={{ paddingVertical: 2, paddingHorizontal: 8 }} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {unclassifiedWaypoints.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11, color: colors.text3, marginBottom: 6, letterSpacing: 1 }}>WAYPOINTS NON CLASSÉS</Text>
            {unclassifiedWaypoints.map((w) => (
              <View key={w.km} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: 0.8 }}>
                <Text style={{ flex: 1, fontSize: 12, color: colors.text2 }}><Text style={{ color: colors.text3 }}>? </Text>{w.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, color: colors.text3 }}>{w.km.toFixed(1)} km</Text>
                  <HButton label="+ Ravito" onPress={() => onPromoteWaypoint(w)} style={{ paddingVertical: 2, paddingHorizontal: 8, borderColor: colors.growth }} textStyle={{ color: colors.growth }} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Ajout manuel */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontSize: 10, color: colors.text3, marginBottom: 3, letterSpacing: 0.8 }}>KM (0–{totalKm.toFixed(0)})</Text>
            <TextInput value={newKm} onChangeText={setNewKm} keyboardType="decimal-pad" placeholder="ex: 15" placeholderTextColor={colors.text3} style={[input, { width: 80 }]} />
          </View>
          <View>
            <Text style={{ fontSize: 10, color: colors.text3, marginBottom: 3, letterSpacing: 0.8 }}>NOM (optionnel)</Text>
            <TextInput value={newLabel} onChangeText={setNewLabel} placeholder="ex: Col du Galibier" placeholderTextColor={colors.text3} style={[input, { width: 160 }]} />
          </View>
          <HButton label="+ Ajouter" onPress={handleAddRavito} />
        </View>
      </Card>

      {/* Plan assistance */}
      {checkpoints.length > 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <CLabel style={{ marginBottom: hasClock ? 6 : 12 }}>PLAN ASSISTANCE — {athleteName.toUpperCase()}</CLabel>
          {hasClock ? (
            <Text style={{ fontSize: 11, color: colors.text3, marginBottom: 12, lineHeight: 16 }}>
              Heure d'arrivée estimée au ravito — fourchette agressif → prudent. Temps écoulé indiqué en dessous.
            </Text>
          ) : null}
          {checkpoints.map((cp, i) => (
            <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: cp.kind === 'ravito' ? colors.surf2 : 'transparent', borderRadius: cp.kind === 'ravito' ? 6 : 0, paddingHorizontal: cp.kind === 'ravito' ? 8 : 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, color: colors.text, fontWeight: cp.kind === 'ravito' ? '700' : '400', width: 42 }}>{cp.km.toFixed(1)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 12, color: cp.kind === 'ravito' ? colors.growth : colors.text2 }} numberOfLines={1}>{cp.label}</Text>
                    <Text style={{ fontSize: 9, color: cp.kind === 'ravito' ? colors.growth : colors.text3, letterSpacing: 0.7 }}>{cp.kind === 'ravito' ? 'RAVITO' : 'CHECKPOINT ESTIMÉ'}</Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                <Time label="Agressif" main={cp.clockAgressif ?? cp.timeAgressif} sub={cp.clockAgressif ? cp.timeAgressif : undefined} color={colors.growth} />
                <Time label="Cible" main={cp.clockCible ?? cp.timeCible} sub={cp.clockCible ? cp.timeCible : undefined} color={colors.text} bold />
                <Time label="Prudent" main={cp.clockPrudent ?? cp.timePrudent} sub={cp.clockPrudent ? cp.timePrudent : undefined} color={colors.text2} />
              </View>
              {cp.nutritionToGive ? <Text style={{ fontSize: 11, color: colors.text2, marginTop: 6 }}>À donner : <Text style={{ color: colors.text }}>{cp.nutritionToGive}</Text></Text> : null}
              {cp.vigilance ? <Text style={{ fontSize: 11, color: colors.ember, marginTop: 3 }}>⚠ {cp.vigilance}</Text> : null}
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <MLabel style={{ textTransform: 'none', letterSpacing: 0 }}>Ajoutez au moins un ravito ou une course de plus de 15 km pour générer le plan assistance.</MLabel>
        </Card>
      )}
    </View>
  )
}

function Time({ label, main, sub, color, bold }: { label: string; main: string; sub?: string; color: string; bold?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 8.5, color: colors.text3, letterSpacing: 0.6 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 13, color, fontWeight: bold ? '700' : '400' }}>{main}</Text>
      {sub ? <Text style={{ fontSize: 9, color: colors.text3 }}>{sub}</Text> : null}
    </View>
  )
}
