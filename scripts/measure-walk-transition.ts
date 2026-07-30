// Mesure de la bascule COURSE → MARCHE en montée, sur les vrais tracés Supabase.
//
// LECTURE SEULE : ce script ne fait que des SELECT. Il ne modifie aucune projection et
// ne touche à aucun coefficient — il produit les CHIFFRES qui permettront de décider
// comment redécouper les seaux de pente du profil.
//
// Pourquoi : le seau le plus raide du profil est « ≥ 12 %, sans limite haute ». La
// bascule vers la marche se produit dans cette zone, si bien que du 12 % couru et du
// 30 % marché y sont moyennés ensemble. C'est le suspect nº 1 du défaut mesuré au banc
// (D+/km > 40 → MAPE 15 %, optimisme sur 100 % des cas).
//
// Usage :
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run measure:walk
//
// Sortie : tableau PSEUDONYMISÉ sur la sortie standard (A1, A2… ; aucune coordonnée
// GPS, aucun nom). Rien n'est écrit sur disque.

import {
  measureWalkTransition,
  toStepsPerMinute,
  WALK_CADENCE_THRESHOLD_SPM,
  GRADE_BIN_WIDTH,
  type WalkTransitionProfile,
  type WalkTransitionStreams,
} from '../src/lib/walkTransition'

const RUN_TYPES = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])

interface ActivityRow {
  user_id: string
  strava_activity_id: number
  sport_type: string | null
  type: string | null
  total_elevation_gain: number | null
  distance: number | null
}

function isRun(a: ActivityRow): boolean {
  return RUN_TYPES.has((a.sport_type ?? a.type ?? '').toLowerCase())
}

function fmt(n: number | null, digits = 0): string {
  return n == null ? '—' : n.toFixed(digits)
}

function renderProfile(label: string, p: WalkTransitionProfile, activities: number): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`### ${label} — ${activities} activité(s), ${(p.totalSeconds / 3600).toFixed(1)} h analysées`)
  lines.push('')
  // Cadence affichée en PAS PAR MINUTE. L'API Strava renvoie des FOULÉES :
  // brut, « 52 » se lit comme une anomalie, alors que 104 pas/min est une marche normale.
  lines.push('| Pente | Temps | Cadence (pas/min) | Vitesse | VAM | % marche |')
  lines.push('|---|--:|--:|--:|--:|--:|')
  for (const b of p.bins) {
    if (b.seconds < 30) continue // sous 30 s, la ligne n'informe pas
    lines.push(
      `| ${b.gradeMinPct}-${b.gradeMinPct + GRADE_BIN_WIDTH} % ` +
      `| ${(b.seconds / 60).toFixed(0)} min ` +
      `| ${fmt(toStepsPerMinute(b.meanCadence))} ` +
      `| ${fmt(b.meanSpeedKmH, 1)} km/h ` +
      `| ${fmt(b.meanVamMH)} m/h ` +
      `| ${Math.round(b.walkFraction * 100)} % |`,
    )
  }
  lines.push('')
  lines.push(
    p.transitionGradePct != null
      ? `**Bascule (50 % du temps en marche) : ${p.transitionGradePct} %**`
      : '**Bascule : non atteinte** (pas assez de terrain raide dans l’historique)',
  )
  return lines.join('\n')
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (lecture seule).')
  }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // 1. Activités de course à pied (résumés) — pagination par 1000.
  const activities: ActivityRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('strava_activities')
      .select('user_id,strava_activity_id,sport_type,type,total_elevation_gain,distance')
      .is('deleted_at', null)
      .range(from, from + 999)
    if (error) throw new Error(`strava_activities: ${error.message}`)
    if (!data || data.length === 0) break
    activities.push(...(data as ActivityRow[]))
    if (data.length < 1000) break
  }
  const runs = activities.filter(isRun)
  console.log(`[walk] ${runs.length} sorties à pied`)

  // 2. Streams, par lots. On ne charge que ce qui peut informer la bascule : une sortie
  //    sans dénivelé notable n'a aucun échantillon en montée raide, la charger serait du
  //    volume pur (les streams sont lourds).
  const withClimb = runs.filter(
    (a) => (a.total_elevation_gain ?? 0) > 100 && (a.distance ?? 0) > 2000,
  )
  console.log(`[walk] ${withClimb.length} avec dénivelé exploitable`)

  const byAthlete = new Map<string, { streams: WalkTransitionStreams[]; count: number }>()
  const ids = withClimb.map((a) => a.strava_activity_id)
  const ownerOf = new Map<number, string>(withClimb.map((a) => [a.strava_activity_id, a.user_id]))

  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25)
    const { data, error } = await sb
      .from('activity_streams')
      .select('activity_id,data')
      .in('activity_id', batch)
    if (error) throw new Error(`activity_streams: ${error.message}`)
    for (const r of (data ?? []) as { activity_id: number; data: WalkTransitionStreams }[]) {
      const owner = ownerOf.get(Number(r.activity_id))
      if (!owner || !r.data) continue
      const entry = byAthlete.get(owner) ?? { streams: [], count: 0 }
      entry.streams.push(r.data)
      entry.count++
      byAthlete.set(owner, entry)
    }
  }

  // 3. Pseudonymisation stable (A1, A2…) par volume décroissant.
  const ordered = [...byAthlete.entries()].sort((a, b) => b[1].count - a[1].count)

  console.log('')
  console.log('# Bascule course → marche (mesurée)')
  console.log('')
  console.log(
    `Seuil de marche : **${WALK_CADENCE_THRESHOLD_SPM} pas/min** (l’API Strava renvoie ` +
    'des FOULÉES, soit la moitié — l’application, elle, affiche bien des pas). Seuil posé au creux mesuré ' +
    'entre les deux populations de cadence, pas choisi par convention. Agrégation pondérée ' +
    'par le TEMPS. Pente calculée sur des segments d’au moins 40 m — sous cette distance, ' +
    'le bruit d’altitude domine le dénivelé réel.',
  )

  const all: WalkTransitionStreams[] = []
  ordered.forEach(([, entry], idx) => {
    all.push(...entry.streams)
    const p = measureWalkTransition(entry.streams)
    console.log(renderProfile(`A${idx + 1}`, p, entry.count))
  })

  console.log('')
  console.log('---')
  console.log(renderProfile('TOUS ATHLÈTES CONFONDUS', measureWalkTransition(all), all.length))
  console.log('')
  console.log(
    '_Aucune coordonnée GPS ni donnée nominative. Lecture seule : aucun coefficient ' +
    'moteur n’est modifié par ce script._',
  )
}

main().catch((err) => {
  console.error('[walk] échec :', err instanceof Error ? err.message : err)
  process.exit(1)
})
