import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { computeRaceProjection, type GpxPoint, type ProjectionResult } from '@/lib/computeRaceProjection'
import { maybeLockProjectionSnapshot } from '@/lib/saveProjectionSnapshot'
import { RUNNER_PROFILE_SCHEMA_VERSION } from '@/lib/runnerProfileSchema'
import { fetchRaceForecast, computeWeatherImpact } from '@/lib/raceWeather'
import type { ConditionPenalties } from '@/lib/runnerProfile'
import { computeNutritionPlan } from '@/lib/nutritionPlan'
import { resolveNutritionProducts } from '@/lib/nutritionProducts'
import { extractGpxWaypointsRegex, parseGpxTrackPoints, type RavitoPoint, type UnclassifiedWaypoint } from '@/lib/crewPlan'
import type { RaceAnnotation } from '@/lib/raceDebrief'
import { getAthleteLabel } from '@/lib/athleteLabel'
import { fetchTerrainSurfaces } from '@/lib/terrain'
import { ENGINE_COLUMNS_SELECT, engineHistoryBounds } from '@/lib/engineHistory'
import CrewPlan from '@/components/races/CrewPlan'
import StrategyView from '@/components/races/strategy/StrategyView'
import RaceResult from '@/components/races/RaceResult'
import BrandedLoader from '@/components/BrandedLoader'
import { Card, CLabel, MLabel, HButton, PrimaryButton, BackLink, colors, radius, space } from '@/components/coach/ui'
import { GearIcon } from '@/components/coach/CoachIcons'
import ProGate from '@/components/ProGate'
import { usePlanTier } from '@/lib/usePlanTier'
import { useTrackEvent } from '@/lib/useTrackEvent'
import { useLoadEffect } from '@/lib/useLoadEffect'

interface Race {
  id: string; name: string; date: string; distance: number | null; elevation: number | null; type: string | null
  goal_time: string | null; start_time: string | null; gpx_data: unknown | null; last_projection: unknown | null
  share_token: string | null; ravitos: unknown | null; surfaces: unknown | null
  result_activity_id: string | null; result_annotations: unknown | null
}

const FR_MON = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function formatDate(iso: string) { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')} ${FR_MON[d.getMonth()]} ${d.getFullYear()}` }
function uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16) }) }

// Entrée de menu d'actions — composant hoisté (les callbacks sont des props,
// pas des accès ref pendant le rendu → react-hooks/refs satisfait).
function MenuItem({ label, onPress, color = colors.text2 }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 11, paddingHorizontal: 14 }}>
      <Text style={{ color, fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export default function RaceStrategyScreen() {
  const { raceId } = useLocalSearchParams<{ raceId: string }>()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()

  const [race, setRace] = useState<Race | null>(null)
  const [raceLoading, setRaceLoading] = useState(true)
  const [raceError, setRaceError] = useState(false)
  const [activitiesData, setActivitiesData] = useState<Record<string, unknown>[] | null>(null)
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null)

  const [projection, setProjection] = useState<ProjectionResult | null>(null)
  const [baseEstTimeS, setBaseEstTimeS] = useState<number | undefined>()
  const [isComputing, setIsComputing] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [tab, setTab] = useState<'strategie' | 'assistance' | 'resultat'>('strategie')
  const [ravitos, setRavitos] = useState<RavitoPoint[]>([])
  const [unclassifiedWaypoints, setUnclassifiedWaypoints] = useState<UnclassifiedWaypoint[]>([])
  const [annotations, setAnnotations] = useState<RaceAnnotation[]>([])
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof fetchRaceForecast>> | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const [editName, setEditName] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editDistance, setEditDistance] = useState('')
  const [editElevation, setEditElevation] = useState('')
  const [editStartTime, setEditStartTime] = useState('')
  const [editGoalTime, setEditGoalTime] = useState('')

  const loadRace = useCallback(async () => {
    if (!raceId) return
    const { data, error } = await supabase
      .from('race_calendar')
      .select('id,name,date,distance,elevation,type,goal_time,start_time,gpx_data,last_projection,share_token,ravitos,surfaces,result_activity_id,result_annotations')
      .eq('id', raceId).single()
    if (error || !data) { setRaceError(true); setRaceLoading(false); return }
    setRace(data as Race)
    setRaceLoading(false)
  }, [raceId])

  useLoadEffect(loadRace, [loadRace])

  // ── Freemium gate : stratégie GPX limitée à 1 course sur le plan gratuit ──
  // (portage 1:1 du web RaceStrategyPage ; le refus est de toute façon appliqué
  // PAR LA BASE — trigger race_calendar, audit P0.4 — ceci est l'UX.)
  const { tier } = usePlanTier()
  const track = useTrackEvent()
  useEffect(() => { if (raceId) track('strategy_viewed', { race_id: raceId, platform: 'mobile' }) }, [raceId]) // eslint-disable-line react-hooks/exhaustive-deps -- event vue stratégie émis à chaque changement de course uniquement (track stable)
  // Activation (P0.3) : consultation du débrief post-course (par ouverture d'onglet). Parité web.
  useEffect(() => { if (tab === 'resultat') track('race_debrief_viewed', { race_id: raceId ?? null, platform: 'mobile' }) }, [tab, raceId, track])
  const [racesWithGpxCount, setRacesWithGpxCount] = useState(0)
  useEffect(() => {
    supabase.from('race_calendar').select('id', { count: 'exact', head: true }).not('gpx_data', 'is', null)
      .then(({ count, error }) => setRacesWithGpxCount(error ? 0 : (count ?? 0)))
  }, [userId])
  // Gated si : plan free + cette course n'a pas encore de GPX + au moins 1 autre course en a déjà un
  const isGated = tier !== 'pro' && !race?.gpx_data && racesWithGpxCount >= 1
  useEffect(() => {
    { const { asOfISO, sinceISO } = engineHistoryBounds()
      supabase.from('strava_activities').select(ENGINE_COLUMNS_SELECT).lt('start_date', asOfISO).gte('start_date', sinceISO).is('deleted_at', null).order('start_date', { ascending: false }).then(({ data }) => setActivitiesData((data ?? []) as unknown as Record<string, unknown>[])) }
    if (userId) supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => setProfileData((data ?? {}) as Record<string, unknown>))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effet de chargement/reset/timer légitime (Expo, aucun data-loader framework) ; règle conservée en erreur pour le reste du code
    else setProfileData({})
  }, [userId])

  const ravitosLoadedRef = useRef(false)
  const annotationsLoadedRef = useRef(false)
  useEffect(() => {
    if (!race) return
    if (!ravitosLoadedRef.current && Array.isArray(race.ravitos)) { setRavitos(race.ravitos as RavitoPoint[]); ravitosLoadedRef.current = true }
    if (!annotationsLoadedRef.current && Array.isArray(race.result_annotations)) { setAnnotations(race.result_annotations as RaceAnnotation[]); annotationsLoadedRef.current = true }
  }, [race])

  const runAnalysis = useCallback((pts: GpxPoint[], shouldSave: boolean, silentSync = false, terrain?: { surfaces: (string | null)[]; weather?: { precip?: number } } | null) => {
    if (!activitiesData || !profileData || !race) return
    setIsComputing(true)
    setTimeout(() => {
      try {
        const result = computeRaceProjection(pts, activitiesData, profileData, { type: race.type, goal_time: race.goal_time }, terrain ?? null, { smoothElevation: true })
        setProjection(result)
        // Activation (P0.3) : stratégie réellement générée (succès du calcul) + son
        // plan nutrition. Comptés 1×/user. Parité web.
        track('first_strategy_generated', { race_id: raceId ?? null, platform: 'mobile' })
        track('nutrition_plan_generated', { race_id: raceId ?? null, platform: 'mobile' })
        if (!terrain) setBaseEstTimeS(result.estTimeS)
        // Snapshot PROSPECTIF (§14) : fige une preuve immuable pour une course FUTURE.
        const raceStartAtMs = race?.date ? Date.parse(`${race.date.slice(0, 10)}T${race.start_time || '08:00'}`) : NaN
        if (race && raceId && Number.isFinite(raceStartAtMs) && raceStartAtMs > Date.now()) {
          const schemaVersion = (profileData?.runner_profile as { schemaVersion?: string } | undefined)?.schemaVersion ?? RUNNER_PROFILE_SCHEMA_VERSION
          void maybeLockProjectionSnapshot({
            raceId, raceStartAtMs,
            predictionCentralS: result.estTimeS, predictionPrudentS: result.timeMax, predictionAggressiveS: result.timeMin,
            raceDistanceM: (race.distance ?? 0) * 1000, raceDplusM: race.elevation ?? 0,
            activityCount: (activitiesData ?? []).length,
            usedPersonalFade: result.used_personal_fade, usedSteepnessCalibration: result.steepness_calibration_active,
            usedFallback: result.usedFallback, fallbackSources: result.fallbackSources ?? [],
            profileVersion: schemaVersion, profileSchemaVersion: schemaVersion,
          })
        }
        const fresh = { cible: Math.round(result.estTimeS), prudent: Math.round(result.timeMax), agressif: Math.round(result.timeMin), confidence: result.confidence, computedAt: new Date().toISOString() }
        const stored = race.last_projection as typeof fresh | null
        const drifted = !stored || stored.cible !== fresh.cible || stored.prudent !== fresh.prudent || stored.agressif !== fresh.agressif || stored.confidence !== fresh.confidence
        const staleStamp = !stored?.computedAt || Date.now() - new Date(stored.computedAt).getTime() > 24 * 3600_000
        if (shouldSave || (silentSync && (drifted || staleStamp))) {
          if (!silentSync) setSaveStatus('saving')
          supabase.from('race_calendar').update({ gpx_data: pts, last_projection: fresh }).eq('id', raceId!).then(() => { if (!silentSync) setSaveStatus('saved') })
        }
      } catch (err) { console.error('GPX projection error:', err) } finally { setIsComputing(false) }
    }, 0)
  }, [activitiesData, profileData, race, raceId, track])

  // Auto-projection depuis le GPX stocké.
  useEffect(() => {
    if (!race?.gpx_data || !activitiesData || !profileData || projection) return
    const pts = race.gpx_data as GpxPoint[]
    if (!Array.isArray(pts) || pts.length < 2) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effet de chargement/reset/timer légitime (Expo, aucun data-loader framework) ; règle conservée en erreur pour le reste du code
    runAnalysis(pts, false, true)
  }, [race, activitiesData, profileData, projection, runAnalysis])

  // Météo J-10.
  const startPt = projection?.points?.[0]
  useEffect(() => {
    if (!startPt || !race?.date || !baseEstTimeS) return
    fetchRaceForecast({ lat: startPt.lat, lon: startPt.lon, dateISO: race.date.slice(0, 10), startTime: race.start_time ?? null, estDurationS: baseEstTimeS }).then(setForecast).catch(() => {})
  }, [startPt, race?.date, race?.start_time, baseEstTimeS])
  const weather = forecast ? computeWeatherImpact(forecast, (profileData?.runner_profile as { conditionPenalties?: ConditionPenalties } | undefined)?.conditionPenalties) : null

  // Terrain → re-projection avec malus.
  const surfacesDoneRef = useRef(false)
  useEffect(() => {
    if (!projection || !race?.gpx_data || surfacesDoneRef.current) return
    surfacesDoneRef.current = true
    const pts = race.gpx_data as GpxPoint[]
    const w = forecast?.available && forecast.precipMm != null ? { precip: forecast.precipMm } : undefined
    const apply = (surfaces: (string | null)[]) => { if (surfaces.some((s) => s != null)) runAnalysis(pts, false, true, { surfaces, weather: w }) }
    const cached = race.surfaces
    if (Array.isArray(cached) && cached.length === projection.sections.length) { apply(cached as (string | null)[]); return }
    fetchTerrainSurfaces(pts, projection.sections).then((surfaces) => {
      supabase.from('race_calendar').update({ surfaces }).eq('id', raceId!).then(() => {})
      apply(surfaces)
    }).catch(() => {})
  }, [projection, race, forecast, runAnalysis, raceId])

  function updateRavitos(next: RavitoPoint[]) {
    const sorted = [...next].sort((a, b) => a.km - b.km)
    setRavitos(sorted)
    if (raceId) supabase.from('race_calendar').update({ ravitos: sorted }).eq('id', raceId).then(() => {})
  }
  function updateAnnotations(next: RaceAnnotation[]) {
    const sorted = [...next].sort((a, b) => a.km - b.km)
    setAnnotations(sorted)
    if (raceId) supabase.from('race_calendar').update({ result_annotations: sorted }).eq('id', raceId).then(() => {})
  }

  async function importGpx() {
    setMenuOpen(false)
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/gpx+xml', 'application/xml', 'text/xml', '*/*'], copyToCacheDirectory: true })
    if (res.canceled || !res.assets?.[0]) return
    try {
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri)
      const pts = parseGpxTrackPoints(text)
      if (pts.length < 2) return
      const { ravitos: gpxRavitos, unclassified } = extractGpxWaypointsRegex(text, pts)
      updateRavitos(gpxRavitos)
      setUnclassifiedWaypoints(unclassified)
      surfacesDoneRef.current = false
      if (raceId) await supabase.from('race_calendar').update({ surfaces: null }).eq('id', raceId)
      track('gpx_uploaded', { race_id: raceId, points: pts.length, platform: 'mobile' })
      runAnalysis(pts, true)
    } catch (err) { console.error('GPX import error:', err) }
  }

  async function handleRemoveGpx() {
    setMenuOpen(false)
    setProjection(null); setRavitos([]); setUnclassifiedWaypoints([]); surfacesDoneRef.current = false
    await supabase.from('race_calendar').update({ gpx_data: null, last_projection: null, ravitos: null, surfaces: null }).eq('id', raceId!)
    loadRace()
  }

  async function toggleShare() {
    if (!race) return
    setMenuOpen(false)
    const token = race.share_token ?? uuid()
    if (!race.share_token) await supabase.from('race_calendar').update({ share_token: token }).eq('id', raceId!)
    await Share.share({ message: `https://vorcelab.app/s/${token}` })
    // Activation (P0.3) : partage du plan d'assistance (équivalent natif de l'impression
    // assistance web — le partage natif remplace window.print).
    if (tab === 'assistance') track('crew_plan_shared', { race_id: raceId ?? null, via: 'share', platform: 'mobile' })
    loadRace()
  }
  async function stopShare() { setMenuOpen(false); await supabase.from('race_calendar').update({ share_token: null }).eq('id', raceId!); loadRace() }

  function openEdit() {
    if (!race) return
    setEditName(race.name); setEditDate(race.date?.slice(0, 10) ?? ''); setEditDistance(race.distance != null ? String(race.distance) : '')
    setEditElevation(race.elevation != null ? String(race.elevation) : ''); setEditStartTime(race.start_time ?? ''); setEditGoalTime(race.goal_time ?? '')
    setMenuOpen(false); setEditOpen(true)
  }
  async function saveEdit() {
    const km = parseFloat(editDistance.replace(',', '.'))
    await supabase.from('race_calendar').update({
      name: editName.trim(), date: editDate, distance: Number.isFinite(km) ? km : null,
      elevation: editElevation ? parseInt(editElevation, 10) : null, start_time: editStartTime || null, goal_time: editGoalTime.trim() || null,
    }).eq('id', raceId!)
    setEditOpen(false); setProjection(null); surfacesDoneRef.current = false; await loadRace()
  }

  async function linkResult(id: string | null) { await supabase.from('race_calendar').update({ result_activity_id: id }).eq('id', raceId!); loadRace() }

  const back = <BackLink label="← Dashboard" onPress={() => router.push('/')} />

  if (raceLoading) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}><View style={{ padding: space.lg }}>{back}</View><BrandedLoader /></SafeAreaView>
  if (raceError || !race) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}><ScrollView contentContainerStyle={{ padding: space.lg }}>{back}<MLabel>Course introuvable.</MLabel></ScrollView></SafeAreaView>

  const athleteName = getAthleteLabel(profileData ?? null)
  const now = new Date()
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isPast = !!race.date && race.date.slice(0, 10) <= todayLocal
  const nutritionRows = projection
    ? computeNutritionPlan(projection.totalDistM, projection.estTimeS, profileData?.nutrition_level as string | undefined, resolveNutritionProducts(profileData?.nutrition_products as string[] | undefined), profileData?.nutrition_no_caffeine === true, ravitos)
    : []


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        {back}

        {/* Header + gear */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontSize: 26, color: colors.text, marginBottom: 4, fontWeight: '700' }}>{race.name}</Text>
            <Text style={{ fontSize: 12, color: colors.text3 }}>
              {formatDate(race.date)}{race.distance != null ? ` · ${race.distance} km` : ''}{race.elevation != null ? ` · ↑${race.elevation} m` : ''}{race.type ? ` · ${race.type}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => setMenuOpen(true)} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 6, padding: 8 }}>
            <GearIcon size={16} color={colors.text2} />
          </Pressable>
        </View>

        {isComputing ? <BrandedLoader label="Calcul de la stratégie…" fullScreen={false} /> : null}

        {!projection && !isComputing ? (
          isGated ? (
            <ProGate feature="les stratégies GPX illimitées" />
          ) : (
            <Card style={{ alignItems: 'center', padding: 32 }}>
              <CLabel style={{ marginBottom: 16 }}>CHARGER LE GPX</CLabel>
              <MLabel style={{ marginBottom: 20, textAlign: 'center' }}>Importez le fichier GPX de la course pour générer votre stratégie personnalisée</MLabel>
              <HButton label="Sélectionner un fichier .gpx" onPress={importGpx} />
            </Card>
          )
        ) : null}

        {saveStatus === 'saving' ? <MLabel style={{ marginVertical: 8 }}>Sauvegarde…</MLabel> : null}
        {saveStatus === 'saved' ? <MLabel style={{ marginVertical: 8, color: colors.growth }}>GPX sauvegardé</MLabel> : null}

        {projection ? (
          <>
            {/* Tabs */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {([['strategie', 'STRATÉGIE'], ['assistance', 'PLAN ASSISTANCE'], ...(isPast ? [['resultat', 'RÉSULTAT'] as const] : [])] as [typeof tab, string][]).map(([k, lbl]) => (
                <Pressable key={k} onPress={() => setTab(k)} hitSlop={4} style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: tab === k ? colors.ember : colors.line2, backgroundColor: tab === k ? colors.ember : colors.surf2 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.84, color: tab === k ? colors.bg : colors.text2 }}>{lbl}</Text>
                </Pressable>
              ))}
            </View>

            {tab === 'strategie' ? (
              <StrategyView projection={projection} race={race} athleteName={athleteName} nutritionRows={nutritionRows} ravitos={ravitos} forecast={forecast ?? null} weather={weather} />
            ) : null}

            {tab === 'assistance' ? (
              <CrewPlan
                projection={projection} nutritionRows={nutritionRows} ravitos={ravitos} unclassifiedWaypoints={unclassifiedWaypoints}
                onAddRavito={(r) => updateRavitos([...ravitos.filter((x) => x.km !== r.km), r])}
                onRemoveRavito={(km) => updateRavitos(ravitos.filter((r) => r.km !== km))}
                onPromoteWaypoint={(w) => { updateRavitos([...ravitos.filter((x) => x.km !== w.km), { km: w.km, label: w.label, source: 'gpx' as const }]); setUnclassifiedWaypoints((prev) => prev.filter((u) => u.km !== w.km)) }}
                athleteName={athleteName} startTime={race.start_time}
              />
            ) : null}

            {tab === 'resultat' && isPast ? (
              <RaceResult projection={projection} activities={activitiesData ?? []} resultActivityId={race.result_activity_id} raceDateISO={race.date} fcMax={(profileData?.fc_max as number | undefined) ?? null} annotations={annotations} onChangeAnnotations={updateAnnotations} ravitos={ravitos} onLink={(id) => linkResult(id)} onUnlink={() => linkResult(null)} />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* Menu d'actions */}
      <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable onPress={() => setMenuOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 70, paddingRight: 16 }}>
          <Pressable onPress={() => {}} style={{ minWidth: 230, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: 'hidden' }}>
            {isPast && projection ? <><MenuItem label="Lier l'activité réalisée" onPress={() => { setTab('resultat'); setMenuOpen(false) }} color={colors.ember} /><View style={{ height: 1, backgroundColor: colors.line }} /></> : null}
            <MenuItem label="Modifier la course" onPress={openEdit} />
            <View style={{ height: 1, backgroundColor: colors.line }} />
            {!projection && isGated ? null : <MenuItem label={projection ? 'Changer de GPX' : 'Importer un GPX'} onPress={() => importGpx()} />}
            {projection ? <MenuItem label="Supprimer le GPX" onPress={() => handleRemoveGpx()} color={colors.ember} /> : null}
            <View style={{ height: 1, backgroundColor: colors.line }} />
            {race.share_token ? <><MenuItem label="Partager le lien" onPress={toggleShare} color={colors.growth} /><MenuItem label="Arrêter le partage" onPress={stopShare} /></> : <MenuItem label="Partager cette stratégie" onPress={toggleShare} />}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modale édition */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable onPress={() => setEditOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,10,12,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420 }}>
            <Card style={{ borderTopWidth: 3, borderTopColor: colors.ember }}>
              <Text style={{ fontSize: 21, fontWeight: '800', color: colors.text, marginBottom: 14 }}>Modifier la course</Text>
              <View style={{ gap: 14 }}>
                {([['Nom', editName, setEditName, 'default'], ['Date (AAAA-MM-JJ)', editDate, setEditDate, 'numbers-and-punctuation']] as const).map(([lbl, val, set, kb]) => (
                  <View key={lbl}><MLabel style={{ marginBottom: 5 }}>{lbl}</MLabel><TextInput value={val} onChangeText={set} keyboardType={kb as never} autoCapitalize={lbl === 'Nom' ? 'sentences' : 'none'} style={editInput} placeholderTextColor={colors.text3} /></View>
                ))}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}><MLabel style={{ marginBottom: 5 }}>Distance (km)</MLabel><TextInput value={editDistance} onChangeText={setEditDistance} keyboardType="decimal-pad" style={editInput} /></View>
                  <View style={{ flex: 1 }}><MLabel style={{ marginBottom: 5 }}>D+ (m)</MLabel><TextInput value={editElevation} onChangeText={setEditElevation} keyboardType="number-pad" style={editInput} /></View>
                </View>
                <View><MLabel style={{ marginBottom: 5 }}>Heure de départ (HH:MM)</MLabel><TextInput value={editStartTime} onChangeText={setEditStartTime} keyboardType="numbers-and-punctuation" placeholder="08:00" placeholderTextColor={colors.text3} style={editInput} /></View>
                <View><MLabel style={{ marginBottom: 5 }}>Objectif (optionnel)</MLabel><TextInput value={editGoalTime} onChangeText={setEditGoalTime} placeholder="ex. 3h30" placeholderTextColor={colors.text3} style={editInput} /></View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <HButton label="Annuler" onPress={() => setEditOpen(false)} />
                <PrimaryButton label="Enregistrer" onPress={saveEdit} style={{ width: 140, height: 38 }} disabled={!editName.trim() || !editDate} />
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const editInput = { backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, color: colors.text, fontSize: 15 } as const
