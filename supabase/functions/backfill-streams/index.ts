// backfill-streams/index.ts
// Rattrapage du cache des tracés GPS (activity_streams) — MODE SERVICE, AUTONOME.
//
// Met en cache, par LOTS, les tracés des sorties course à pied encore absentes du
// cache, pour TOUS les athlètes connectés, sur une fenêtre glissante (6 mois par
// défaut : au-delà, la forme du jour n'est plus impactée — cf. CTL 42 j). Idempotent,
// n'ajoute que du cache (aucune suppression). Conçu pour être appelé en boucle (cron
// ~toutes les 15 min) jusqu'à `remaining = 0`. S'arrête net sur quota Strava (429).
//
// Autonome (helpers Strava inline, volontairement dupliqués depuis _shared/strava.ts)
// pour un déploiement fiable en un seul fichier. Réservé au SERVICE : exige la clé
// service_role en Bearer (la clé anon publique est refusée) — endpoint de maintenance.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_ACTIVITY_URL = 'https://www.strava.com/api/v3/activities'
const STREAM_KEYS = 'time,distance,altitude,heartrate,velocity_smooth,cadence,latlng'

const RUN_TYPES = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])
// Fenêtre de CONSERVATION du cache = légèrement plus large que la fenêtre MOTEUR
// (ENGINE_HISTORY_DAYS=183, définie côté app dans src/lib/engineHistory.ts). La marge
// (~1 semaine) garantit une couverture complète des six mois moteur sans jamais
// supprimer d'anciens streams — la fenêtre de six mois concerne les données ALIMENTANT
// le moteur, pas la conservation en base. Deno ne peut pas importer la constante TS ;
// cette valeur est volontairement un SUR-ensemble, pas un doublon de la fenêtre moteur.
const DEFAULT_SINCE_DAYS = 190 // ≥ 183 (six mois moteur) + marge
// Fenêtre MOTEUR (= ENGINE_HISTORY_DAYS dans src/lib/engineHistory.ts). Deno ne peut
// pas importer la constante TS ; gardée synchrone avec l'app (source unique côté app).
const ENGINE_HISTORY_DAYS = 183
const MAX_CALLS_PER_RUN = 80   // marge sous le quota Strava (100 / 15 min)
const SLEEP_MS = 250

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function isRun(a: { type?: string | null; sport_type?: string | null }): boolean {
  return RUN_TYPES.has((a.sport_type ?? a.type ?? '').toLowerCase())
}

// ── Token Strava (refresh si expiré) — copie fidèle de _shared/strava.ts ──────
async function getValidStravaAccessToken(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: row, error } = await supabase
    .from('strava_tokens').select('access_token, refresh_token, expires_at').eq('user_id', userId).single()
  if (error || !row) throw new Error('No Strava connection')
  const nowSec = Math.floor(Date.now() / 1000)
  if ((row.expires_at as number) > nowSec + 300) return row.access_token as string
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'), client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token', refresh_token: row.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`)
  const d = (await res.json()) as { access_token: string; refresh_token: string; expires_at: number }
  await supabase.from('strava_tokens').update({
    access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
  return d.access_token
}

// Fetch Strava avec retries sur erreurs TRANSITOIRES (réseau, 5xx). Ni 429 (quota,
// géré à part), ni 4xx (définitif : 404/privé) ne sont réessayés.
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init)
      if (res.status >= 500 && i < attempts - 1) { await sleep(400 * (i + 1)); continue }
      return res
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) { await sleep(400 * (i + 1)); continue }
    }
  }
  throw lastErr ?? new Error('fetch failed')
}

type CacheResult = 'cached' | 'empty' | 'not_found' | 'rate_limited'
async function fetchAndCacheStreams(supabase: SupabaseClient, userId: string, token: string, activityId: number): Promise<CacheResult> {
  let res: Response
  try {
    res = await fetchWithRetry(`${STRAVA_ACTIVITY_URL}/${activityId}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } })
  } catch { return 'not_found' } // erreur réseau persistante → on n'écrit pas de marqueur (retentable plus tard)
  if (res.status === 429) return 'rate_limited'
  if (res.status >= 500) return 'not_found' // 5xx persistant : pas de marqueur, retentable
  let data: Record<string, unknown> = {}
  let ok = res.ok
  if (ok) { try { data = (await res.json()) as Record<string, unknown> } catch { ok = false } }
  const hasData = ok && data && typeof data === 'object' && Object.keys(data).length > 0
  await supabase.from('activity_streams').upsert(
    { user_id: userId, activity_id: activityId, data: hasData ? data : {}, cached_at: new Date().toISOString() },
    { onConflict: 'user_id,activity_id' })
  return hasData ? 'cached' : ok ? 'empty' : 'not_found'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  // Sécurité : endpoint de MAINTENANCE réservé au service (cron/admin). La clé anon
  // étant publique, on exige une clé de niveau service.
  //
  // Vérification de POUVOIRS, pas comparaison de texte : le projet a deux générations de
  // clés (ancienne `eyJ…` JWT, nouvelle `sb_secret_…`) aux droits identiques mais de
  // formats différents, et le runtime n'injecte que l'ancienne dans
  // `SUPABASE_SERVICE_ROLE_KEY`. L'égalité stricte refusait donc un appelant légitime
  // configuré avec la nouvelle clé (panne du 2026-07-30 sur `engine-data-refresh`).
  // Lister les utilisateurs est réservé au rôle service : une clé anon ou publishable
  // échoue, quelle que soit sa génération. Miroir de `_shared/auth.ts:requireServiceRole`,
  // inline par la convention d'autonomie de ce fichier (cf. en-tête).
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const presented = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  if (!serviceKey || !presented) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }
  {
    const prober = createClient(Deno.env.get('SUPABASE_URL')!, presented, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await prober.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // Les écritures passent par la clé du RUNTIME, pas par celle de l'appelant : la clé
  // présentée sert à prouver l'autorisation, pas à opérer.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  try {
    const body = (await req.json().catch(() => ({}))) as { sinceDays?: number; maxCalls?: number }
    // Fenêtre de CACHE (rattrapage des streams) : 190 j par défaut, avec marge.
    const sinceDays = Math.max(30, body.sinceDays ?? DEFAULT_SINCE_DAYS)
    const budget = Math.min(MAX_CALLS_PER_RUN, Math.max(1, body.maxCalls ?? MAX_CALLS_PER_RUN))
    const cutoffISO = new Date(Date.now() - sinceDays * 86_400_000).toISOString()

    // Fenêtre MOTEUR (six mois = ENGINE_HISTORY_DAYS dans src/lib/engineHistory.ts,
    // non importable en Deno) : le DIAGNOSTIC de couverture doit refléter ce que le
    // moteur consomme réellement (183 j), pas la fenêtre de cache plus large (190 j).
    // Bornée par la fenêtre réellement chargée si `sinceDays` est plus court.
    const engineWindowDays = Math.min(ENGINE_HISTORY_DAYS, sinceDays)
    const engineCutoffISO = new Date(Date.now() - engineWindowDays * 86_400_000).toISOString()

    const { data: tokenRows } = await supabase.from('strava_tokens').select('user_id')
    const userIds = (tokenRows ?? []).map((r: { user_id: string }) => r.user_id)

    type Work = { userId: string; activityId: number; date: string; isRace: boolean }
    const work: Work[] = []
    let raceWork = 0
    // Diagnostic de couverture de la FENÊTRE MOTEUR (183 j, comptage LECTURE SEULE).
    let sixMonthAll = 0, sixMonthRunning = 0, sixMonthOther = 0, sixMonthRunsWithStreams = 0
    for (const userId of userIds) {
      const { data: acts } = await supabase.from('strava_activities')
        .select('strava_activity_id,type,sport_type,start_date')
        .eq('user_id', userId).is('deleted_at', null).gt('distance', 1000).gte('start_date', cutoffISO)
      const { data: cachedRows } = await supabase.from('activity_streams').select('activity_id').eq('user_id', userId)
      const cachedSet = new Set((cachedRows ?? []).map((r: { activity_id: number }) => String(r.activity_id)))
      for (const a of (acts ?? []) as Array<{ strava_activity_id: number; type?: string; sport_type?: string; start_date: string }>) {
        const cached = cachedSet.has(String(a.strava_activity_id))
        // Le RATTRAPAGE couvre toute la fenêtre de cache (190 j) : streams running non
        // encore en cache → à récupérer (marge incluse).
        if (isRun(a) && !cached) work.push({ userId, activityId: a.strava_activity_id, date: a.start_date, isRace: false })
        // Le DIAGNOSTIC ne compte que la fenêtre MOTEUR (183 j) : couverture honnête.
        if (a.start_date < engineCutoffISO) continue
        sixMonthAll++
        if (isRun(a)) {
          sixMonthRunning++
          if (cached) sixMonthRunsWithStreams++
        } else {
          // Les autres sports restent exploitables via leurs résumés (streams non requis).
          sixMonthOther++
        }
      }

      // ── COMPÉTITIONS CONFIRMÉES : hors fenêtre glissante, à TOUTE date ─────────
      // La fenêtre de 190 j sert la FORME DU JOUR (CTL 42 j) : au-delà, une sortie
      // d'entraînement n'apprend plus rien au profil. Une COURSE, elle, garde toute sa
      // valeur : c'est un point de mesure « projection vs réel » pour le banc, et il ne
      // se périme pas. Sans tracé GPS, le banc ne peut pas rejouer le parcours et exclut
      // la course (`no_latlng`) — 9 des 24 courses du run du 2026-07-30 ont été perdues
      // ainsi, dont les plus anciennes.
      //
      // On ne pouvait pas faire ce ciblage avant : rien n'identifiait une course en base.
      // C'est précisément ce que `race_detection_status` débloque.
      const { data: raceActs } = await supabase.from('strava_activities')
        .select('strava_activity_id,type,sport_type,start_date')
        .eq('user_id', userId).is('deleted_at', null)
        .eq('race_detection_status', 'confirmed')
        .lt('start_date', cutoffISO) // les plus récentes sont déjà couvertes ci-dessus
      for (const a of (raceActs ?? []) as Array<{ strava_activity_id: number; type?: string; sport_type?: string; start_date: string }>) {
        if (!isRun(a) || cachedSet.has(String(a.strava_activity_id))) continue
        work.push({ userId, activityId: a.strava_activity_id, date: a.start_date, isRace: true })
        raceWork++
      }
    }
    const sixMonthStreamCoveragePct = sixMonthRunning > 0
      ? +((sixMonthRunsWithStreams / sixMonthRunning) * 100).toFixed(1)
      : 0
    // Les COURSES d'abord (valeur pour le banc, et elles sont peu nombreuses), puis les
    // entraînements du plus récent au plus ancien. Le quota Strava est la ressource rare :
    // il doit servir en priorité ce qui ne peut pas être rattrapé autrement.
    work.sort((a, b) => (a.isRace !== b.isRace ? (a.isRace ? -1 : 1) : a.date < b.date ? 1 : -1))
    const remainingBefore = work.length
    const batch = work.slice(0, budget)

    let cached = 0, empty = 0, notFound = 0, processed = 0, rateLimited = false
    const tokenCache = new Map<string, string>()
    for (const w of batch) {
      let token = tokenCache.get(w.userId)
      if (!token) { try { token = await getValidStravaAccessToken(supabase, w.userId); tokenCache.set(w.userId, token) } catch { continue } }
      const res = await fetchAndCacheStreams(supabase, w.userId, token, w.activityId)
      if (res === 'rate_limited') { rateLimited = true; break }
      processed++
      if (res === 'cached') cached++; else if (res === 'empty') empty++; else notFound++
      await sleep(SLEEP_MS)
    }

    return new Response(JSON.stringify({
      ok: true, users: userIds.length, cached, empty, notFound, processed,
      remaining: remainingBefore - processed, rateLimited,
      // Courses confirmées hors fenêtre encore sans tracé (priorité haute, cf. tri).
      confirmed_races_pending: raceWork,
      // Fenêtres : cache (rattrapage, marge) vs moteur (diagnostic de couverture).
      cache_window_days: sinceDays,
      engine_history_days: engineWindowDays,
      // Couverture de la FENÊTRE MOTEUR (183 j ; streams priorisés running/trail).
      six_month_activities_count: sixMonthAll,
      six_month_running_activities_count: sixMonthRunning,
      six_month_other_sport_activities_count: sixMonthOther,
      six_month_runs_with_streams: sixMonthRunsWithStreams,
      six_month_stream_coverage_pct: sixMonthStreamCoveragePct,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('backfill-streams error:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
