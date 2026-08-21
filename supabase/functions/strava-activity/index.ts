// strava-activity — streams d'une activité, CACHE D'ABORD.
//
// Cet endpoint est le seul chemin INTERACTIF vers l'API Strava (un athlète ouvre une
// sortie). Il consommait auparavant un appel Strava à CHAQUE ouverture, y compris pour
// une activité déjà en cache : le cache `activity_streams` n'était consulté que par le
// navigateur, donc jamais quand l'appel arrivait d'ailleurs (mobile, cache vidé,
// rechargement dur). Les streams d'une activité terminée sont IMMUABLES — les
// redemander est un appel gaspillé, exactement ce que Strava reproche sous
// « API usage is not optimized for the requests being made ».
//
// Désormais :
//   1. lecture de `activity_streams` (y compris le marqueur `{}` des activités sans
//      tracé : elles ne sont plus jamais redemandées) ;
//   2. à défaut seulement, un appel Strava — refusé d'avance si le budget de quota du
//      fond/interactif est déjà consommé (arrêt PRÉVENTIF, jamais de 429 subi) ;
//   3. l'appel écrit le cache côté SERVEUR, donc l'appel suivant, quel que soit le
//      client, n'en refait pas un.

import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuth, getServiceClient } from '../_shared/auth.ts'
import {
  fetchAndCacheActivityStreams,
  getStravaRateLimit,
  getValidStravaAccessToken,
  isStravaQuotaExhausted,
} from '../_shared/strava.ts'

/** Un identifiant d'activité Strava est un entier positif — rien d'autre n'est accepté. */
function parseActivityId(raw: unknown): string | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null
  const s = String(raw).trim()
  return /^\d{1,20}$/.test(s) ? s : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)
  const json = { ...cors, 'Content-Type': 'application/json' }

  try {
    const user = await requireAuth(req)
    const body = (await req.json().catch(() => ({}))) as { activityId?: unknown }
    const activityId = parseActivityId(body.activityId)

    if (!activityId) {
      return new Response(JSON.stringify({ error: 'Missing or invalid activityId' }), {
        status: 400,
        headers: json,
      })
    }

    const supabase = getServiceClient()

    // ── 1. Cache ──────────────────────────────────────────────────────────────
    // Le propriétaire est filtré ici : un athlète ne peut lire que SES streams,
    // même en présentant l'identifiant d'une activité qui ne lui appartient pas.
    const { data: cached } = await supabase
      .from('activity_streams')
      .select('data')
      .eq('user_id', user.id)
      .eq('activity_id', activityId)
      .maybeSingle()

    if (cached?.data) {
      // `{}` est le MARQUEUR d'une activité sans tracé exploitable (privée, 404,
      // vide). Le renvoyer tel quel est volontaire : c'est ce qui empêche le client
      // de relancer un appel Strava en boucle pour une activité qui n'en a pas.
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { ...json, 'X-Vorcelab-Cache': 'hit' },
      })
    }

    // ── 2. Budget de quota ────────────────────────────────────────────────────
    if (isStravaQuotaExhausted(user.id)) {
      return new Response(
        JSON.stringify({
          error: 'Strava rate limit budget reached, retry later',
          rate_limit: getStravaRateLimit(user.id),
        }),
        { status: 429, headers: { ...json, 'Retry-After': '900' } },
      )
    }

    let accessToken: string
    try {
      accessToken = await getValidStravaAccessToken(supabase, user.id)
    } catch {
      return new Response(JSON.stringify({ error: 'No Strava connection' }), {
        status: 401,
        headers: json,
      })
    }

    // ── 3. Appel Strava + mise en cache SERVEUR ───────────────────────────────
    // Les clés demandées sont fixes (`STRAVA_STREAM_KEYS`) : un jeu de clés choisi par
    // le client fragmenterait le cache — deux appels pour la même activité — et
    // laisserait une entrée utilisateur atteindre l'URL Strava.
    const result = await fetchAndCacheActivityStreams(supabase, user.id, accessToken, activityId)

    if (result === 'rate_limited') {
      return new Response(
        JSON.stringify({
          error: 'Strava rate limit reached, retry later',
          rate_limit: getStravaRateLimit(user.id),
        }),
        { status: 429, headers: { ...json, 'Retry-After': '900' } },
      )
    }

    const { data: fresh } = await supabase
      .from('activity_streams')
      .select('data')
      .eq('user_id', user.id)
      .eq('activity_id', activityId)
      .maybeSingle()

    return new Response(JSON.stringify(fresh?.data ?? {}), {
      status: 200,
      headers: { ...json, 'X-Vorcelab-Cache': 'miss' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg === 'Unauthorized' ? 401 : 500
    if (status === 500) console.error('strava-activity error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status, headers: json })
  }
})
