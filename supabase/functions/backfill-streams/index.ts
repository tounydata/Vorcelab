// backfill-streams/index.ts
// Rattrapage : met en cache les tracés GPS (activity_streams) des sorties course à
// pied de l'utilisateur qui n'en ont pas encore. Idempotent, par LOTS (respecte les
// quotas Strava : ~100 req/15 min). N'ajoute que du cache — ne supprime jamais rien.
//
// Appeler en boucle jusqu'à `remaining = 0` (chaque appel traite un lot). S'arrête
// proprement si Strava renvoie 429 (quota) → relancer plus tard.

import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuth, getServiceClient } from '../_shared/auth.ts'
import { getValidStravaAccessToken, fetchAndCacheActivityStreams } from '../_shared/strava.ts'

const RUN_TYPES = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])
const DEFAULT_BATCH = 25
const MAX_BATCH = 75
const SLEEP_MS = 250

function isRun(a: { type?: string | null; sport_type?: string | null }): boolean {
  const t = (a.sport_type ?? a.type ?? '').toLowerCase()
  return RUN_TYPES.has(t)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)
  const cors = getCorsHeaders(req.headers.get('origin'))

  try {
    const user = await requireAuth(req)
    const supabase = getServiceClient()

    const body = (await req.json().catch(() => ({}))) as { limit?: number }
    const limit = Math.min(MAX_BATCH, Math.max(1, body.limit ?? DEFAULT_BATCH))

    // Sorties course à pied non supprimées, plus récentes d'abord (plus utiles).
    const { data: acts } = await supabase
      .from('strava_activities')
      .select('strava_activity_id,type,sport_type,distance')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gt('distance', 1000)
      .order('start_date', { ascending: false })

    // Tracés déjà en cache (y compris marqueurs vides) → à ne pas re-télécharger.
    const { data: cachedRows } = await supabase
      .from('activity_streams')
      .select('activity_id')
      .eq('user_id', user.id)
    const cachedSet = new Set((cachedRows ?? []).map((r: { activity_id: number }) => String(r.activity_id)))

    const uncached = (acts ?? [])
      .filter((a: { type?: string; sport_type?: string }) => isRun(a))
      .filter((a: { strava_activity_id: number }) => !cachedSet.has(String(a.strava_activity_id)))

    const remainingBefore = uncached.length
    const batch = uncached.slice(0, limit)

    if (batch.length === 0) {
      return json({ ok: true, cached: 0, empty: 0, notFound: 0, processed: 0, remaining: 0, rateLimited: false }, cors)
    }

    let accessToken: string
    try {
      accessToken = await getValidStravaAccessToken(supabase, user.id)
    } catch {
      return json({ error: 'No Strava connection' }, cors, 401)
    }

    let cached = 0, empty = 0, notFound = 0, processed = 0, rateLimited = false
    for (const a of batch as Array<{ strava_activity_id: number }>) {
      const res = await fetchAndCacheActivityStreams(supabase, user.id, accessToken, a.strava_activity_id)
      if (res === 'rate_limited') { rateLimited = true; break }
      processed++
      if (res === 'cached') cached++
      else if (res === 'empty') empty++
      else notFound++
      await sleep(SLEEP_MS)
    }

    return json({ ok: true, cached, empty, notFound, processed, remaining: remainingBefore - processed, rateLimited }, cors)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg === 'Unauthorized' ? 401 : 500
    if (status === 500) console.error('backfill-streams error:', msg)
    return json({ error: msg }, getCorsHeaders(req.headers.get('origin')), status)
  }
})

function json(payload: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
