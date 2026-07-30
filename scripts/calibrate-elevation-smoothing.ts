// Calibration des réglages du LISSAGE ALTIMÉTRIQUE, sur les vrais tracés Supabase.
//
// LECTURE SEULE : uniquement des SELECT. Ne modifie aucun coefficient — il produit les
// chiffres qui permettront de choisir les réglages, au lieu de les deviner.
//
// ── Le problème, mesuré au banc ───────────────────────────────────────────────────
// Le lissage divise systématiquement par deux le dénivelé des parcours ROULANTS :
//   D+ réel 66 m → 18 lissé · 52 → 24 · 37 → 21 · 22 → 12
// Ce n'est pas du bruit, c'est un BIAIS : toujours dans le même sens. Le banc a chiffré
// ce que ça coûte — en donnant au moteur le D+ exact, l'erreur sur route passe de 10,9 %
// à 8,8 %. Deux points entiers, le plus gros gain identifié restant.
//
// Deux réglages gouvernent le lissage :
//   • la fenêtre de moyenne glissante (défaut 50 m) ;
//   • le seuil vertical d'accumulation (défaut 3 m) — une montée ne compte que si elle
//     dépasse cette amplitude. C'est lui qui efface les vraies ondulations d'un semi.
//
// ── Pourquoi ce n'est pas trivial ─────────────────────────────────────────────────
// Le seuil existe pour tuer le bruit GPS. Sur le plat, les vraies bosses ET le bruit ont
// la même amplitude — baisser le seuil récupère les bosses mais réintroduit le bruit.
// D'où ce balayage : on cherche le couple qui minimise l'écart au D+ de référence,
// SÉPARÉMENT par type de terrain, pour voir si un réglage unique peut convenir aux deux
// ou s'il faut le rendre adaptatif.
//
// ── Ce qui sert de référence, et ses limites ──────────────────────────────────────
// Le D+ Strava. Il n'est PAS une vérité absolue : sur le plat, quatre athlètes sur le
// même semi affichent de 39 à 66 m (±70 %). Mais il n'est pas biaisé pour autant, et
// c'est la seule référence disponible. On l'utilise donc en AGRÉGAT sur beaucoup de
// tracés — le bruit se compense, le biais systématique reste visible. Le rapport publie
// l'erreur SIGNÉE (le biais) et l'erreur absolue (la dispersion) pour ne pas confondre
// les deux.
//
// Usage : SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run calibrate:elevation

import { smoothElevationProfile } from '../src/lib/elevationProfile'
import { reconstructGpx } from '../src/lib/gpxReconstruct'

const RUN_TYPES = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])

/** Couples (fenêtre, seuil) balayés. Le premier est le réglage ACTUEL. */
const GRID: Array<{ windowM: number; thresholdM: number }> = []
for (const windowM of [30, 50, 80]) {
  for (const thresholdM of [1, 1.5, 2, 3]) GRID.push({ windowM, thresholdM })
}

interface Row {
  storedDplus: number
  distanceKm: number
  /** Écart relatif au D+ Strava, par réglage (clé = "window/threshold"). */
  errByConfig: Map<string, number>
}

const key = (c: { windowM: number; thresholdM: number }) => `${c.windowM}/${c.thresholdM}`

function terrainOf(r: Row): 'roulant' | 'vallonné' | 'montagneux' {
  const dPerKm = r.storedDplus / Math.max(0.1, r.distanceKm)
  if (dPerKm < 15) return 'roulant'
  if (dPerKm < 35) return 'vallonné'
  return 'montagneux'
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function main() {
  const url = process.env.SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !sbKey) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (lecture seule).')
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, sbKey, { auth: { persistSession: false } })

  const acts: Array<{ strava_activity_id: number; sport_type: string | null; type: string | null; total_elevation_gain: number | null; distance: number | null }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('strava_activities')
      .select('strava_activity_id,sport_type,type,total_elevation_gain,distance')
      .is('deleted_at', null)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    acts.push(...(data as typeof acts))
    if (data.length < 1000) break
  }

  const usable = acts.filter(
    (a) =>
      RUN_TYPES.has((a.sport_type ?? a.type ?? '').toLowerCase()) &&
      (a.distance ?? 0) > 3000 &&
      (a.total_elevation_gain ?? 0) > 0,
  )
  console.log(`[calib] ${usable.length} sorties candidates`)

  const byId = new Map(usable.map((a) => [a.strava_activity_id, a]))
  const rows: Row[] = []
  const ids = [...byId.keys()]

  for (let i = 0; i < ids.length; i += 25) {
    const { data, error } = await sb
      .from('activity_streams')
      .select('activity_id,data')
      .in('activity_id', ids.slice(i, i + 25))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as Array<{ activity_id: number; data: Record<string, unknown> }>) {
      const a = byId.get(Number(r.activity_id))
      if (!a || !r.data) continue
      // Tracé lat/lon/alt reconstruit depuis les streams — même chemin que le banc.
      const gpx = reconstructGpx(r.data as never)
      if (!gpx?.points?.length || gpx.points.length < 20) continue

      const errByConfig = new Map<string, number>()
      for (const c of GRID) {
        const out = smoothElevationProfile({
          points: gpx.points,
          smoothingDistanceM: c.windowM,
          minVerticalM: c.thresholdM,
        })
        const stored = a.total_elevation_gain ?? 0
        if (stored <= 0) continue
        errByConfig.set(key(c), (out.finalGainM - stored) / stored)
      }
      if (errByConfig.size === GRID.length) {
        rows.push({
          storedDplus: a.total_elevation_gain ?? 0,
          distanceKm: (a.distance ?? 0) / 1000,
          errByConfig,
        })
      }
    }
  }

  console.log(`[calib] ${rows.length} tracés exploités`)
  console.log('')
  console.log('# Calibration du lissage altimétrique')
  console.log('')
  console.log(
    'Écart au D+ Strava, par réglage et par terrain. **Biais** = erreur signée médiane ' +
    '(négatif = le lissage rabote) ; **Dispersion** = erreur absolue médiane. Un bon ' +
    'réglage a un biais proche de zéro ET une dispersion faible — le biais compte le plus, ' +
    'car il se répercute systématiquement sur toutes les projections.',
  )

  for (const terrain of ['roulant', 'vallonné', 'montagneux'] as const) {
    const sub = rows.filter((r) => terrainOf(r) === terrain)
    if (sub.length < 3) continue
    console.log('')
    console.log(`### Terrain ${terrain} — ${sub.length} tracés`)
    console.log('')
    console.log('| Fenêtre | Seuil | Biais médian | Dispersion médiane |')
    console.log('|---|--:|--:|--:|')
    for (const c of GRID) {
      const errs = sub.map((r) => r.errByConfig.get(key(c))!).filter(Number.isFinite)
      const bias = median(errs)
      const disp = median(errs.map(Math.abs))
      const current = c.windowM === 50 && c.thresholdM === 3 ? ' ← **actuel**' : ''
      console.log(
        `| ${c.windowM} m | ${c.thresholdM} m | ${(bias * 100).toFixed(1)} % | ${(disp * 100).toFixed(1)} %${current} |`,
      )
    }
  }

  console.log('')
  console.log('_Lecture seule : aucun coefficient moteur n’est modifié par ce script._')
}

main().catch((err) => {
  console.error('[calib] échec :', err instanceof Error ? err.message : err)
  process.exit(1)
})
