// detect-races/index.ts
// Qualification des COMPÉTITIONS dans l'historique — MODE SERVICE, AUTONOME.
//
// Pourquoi : la détection automatique livrée en 2026.07-11 ne tourne qu'en mémoire, au
// moment de la projection. Son verdict n'est écrit nulle part, donc invisible. Mesuré en
// prod le 2026-07-30 : 3 739 activités, 12 seulement étiquetées « course » ; trois
// athlètes ont 501, 662 et 677 sorties à pied et ZÉRO course. Ce job écrit le verdict
// pour qu'il soit comptable, auditable, et exploitable par le banc de validation.
//
// N'INFLUENCE AUCUNE PROJECTION : le moteur continue de recalculer sa décision en
// mémoire (cf. `raceDetectionPersistence.ts`). `ENGINE_VERSION` est inchangé.
//
// Réutilise le cœur pur partagé (`_shared/runner-core`, synchronisé depuis `src/lib`) :
// aucune règle de détection n'est ré-implémentée ici — cette fonction ne fait que de l'IO.
//
// Idempotent : n'écrit QUE les lignes dont le verdict ou la règle a changé (un second
// passage sans nouveauté touche 0 ligne). Ne supprime jamais rien. Conçu pour être appelé
// en boucle jusqu'à `remaining = 0`. Réservé au SERVICE : exige la clé service_role en
// Bearer (la clé anon publique est refusée) — endpoint de maintenance.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceRole } from '../_shared/auth.ts'
import {
  buildRaceDetectionRows,
  changedRows,
  summarizeRaceDetection,
  RACE_DETECTION_VERSION,
  type DetectionActivity,
} from '../_shared/runner-core/raceDetectionPersistence.ts'

const RUN_SPORTS = ['Run', 'TrailRun', 'Trail Run', 'Running', 'VirtualRun']
/** Distance minimale d'une course (miroir de MIN_RACE_DISTANCE_M, en mètres). */
const MIN_CANDIDATE_DISTANCE_M = 3000
/** Pagination PostgREST (limite serveur par défaut : 1 000 lignes). */
const PAGE_SIZE = 1000
/** Athlètes traités par exécution — borne la durée d'un run d'Edge Function. */
const MAX_ATHLETES_PER_RUN = 5
/** Lignes envoyées par appel RPC (un seul statement SQL par lot). */
const WRITE_BATCH = 500

/**
 * Toutes les lignes d'une requête paginée (PostgREST plafonne à 1 000 lignes par appel :
 * sans pagination, un athlète à 1 134 activités serait silencieusement tronqué).
 *
 * Le client Supabase n'est pas typé sur le schéma ici (pas de types générés côté Edge) :
 * la forme des lignes est donc affirmée par l'appelant via `T`, ce que le `select` juste
 * au-dessus rend vérifiable en revue.
 */
async function fetchAllPages<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    out.push(...page)
    if (page.length < PAGE_SIZE) return out
  }
}

interface AthleteOutcome {
  analysed: number
  confirmed: number
  confirmedUnlabeled: number
  pending: number
  rejected: number
  written: number
}

async function processAthlete(supabase: SupabaseClient, userId: string): Promise<AthleteOutcome> {
  // Distribution de FC : TOUTES les sorties à pied de l'athlète (le rang personnel est ce
  // qui rend le critère d'intensité indépendant d'une `fc_max` saisie à la main).
  const hrSamples = await fetchAllPages<DetectionActivity>((from, to) =>
    supabase
      .from('strava_activities')
      .select('strava_activity_id,type,sport_type,average_heartrate')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('sport_type', RUN_SPORTS)
      .range(from, to),
  )

  // Candidates : sorties à pied d'au moins 3 km. Inutile de qualifier (ni d'écrire) les
  // milliers d'activités qu'aucune règle ne pourrait retenir — elles restent à NULL.
  const candidates = await fetchAllPages<DetectionActivity>((from, to) =>
    supabase
      .from('strava_activities')
      .select(
        'strava_activity_id,name,type,sport_type,start_date,distance,moving_time,elapsed_time,' +
          'average_heartrate,is_race,raw_data,deleted_at,race_detection_status,race_detection_version',
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('sport_type', RUN_SPORTS)
      .gte('distance', MIN_CANDIDATE_DISTANCE_M)
      .range(from, to),
  )

  const rows = buildRaceDetectionRows(candidates, hrSamples)
  const summary = summarizeRaceDetection(rows)
  const toWrite = changedRows(candidates, rows)

  let written = 0
  for (let i = 0; i < toWrite.length; i += WRITE_BATCH) {
    const batch = toWrite.slice(i, i + WRITE_BATCH).map((r) => ({
      user_id: userId,
      strava_activity_id: Number(r.stravaActivityId),
      status: r.status,
      reasons: r.reasons,
      version: r.version,
    }))
    const { data, error } = await supabase.rpc('apply_race_detection', { rows: batch })
    if (error) throw error
    written += typeof data === 'number' ? data : 0
  }

  return {
    analysed: summary.analysed,
    confirmed: summary.confirmed,
    confirmedUnlabeled: summary.confirmedUnlabeled,
    pending: summary.pending,
    rejected: summary.rejected,
    written,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  // Sécurité : endpoint de MAINTENANCE réservé au service (cron/admin). La clé anon
  // étant publique, on exige une clé de niveau service — vérifiée sur ses POUVOIRS, pas
  // comparée à un texte (cf. `requireServiceRole` : les deux générations de clés
  // Supabase sont valides et n'ont pas le même format).
  try {
    await requireServiceRole(req)
  } catch {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Les écritures passent par la clé du RUNTIME, pas par celle de l'appelant : la clé
  // présentée sert à prouver l'autorisation, pas à opérer.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = (await req.json().catch(() => ({}))) as { maxAthletes?: number; userId?: string }
    const budget = Math.min(MAX_ATHLETES_PER_RUN, Math.max(1, body.maxAthletes ?? MAX_ATHLETES_PER_RUN))

    // Athlètes à traiter : ceux dont au moins une candidate n'a pas encore été qualifiée
    // sous la règle courante. Comptage par athlète (`head`, aucune ligne rapatriée). La
    // liste RÉTRÉCIT à mesure que le job avance → `remaining` atteint 0 et la boucle
    // d'appel s'arrête.
    const { data: tokenRows } = await supabase.from('strava_tokens').select('user_id')
    const pendingAthletes: string[] = []
    for (const { user_id: userId } of (tokenRows ?? []) as Array<{ user_id: string }>) {
      const { count } = await supabase
        .from('strava_activities')
        .select('strava_activity_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('deleted_at', null)
        .in('sport_type', RUN_SPORTS)
        .gte('distance', MIN_CANDIDATE_DISTANCE_M)
        .or(`race_detection_version.is.null,race_detection_version.neq.${RACE_DETECTION_VERSION}`)
      if ((count ?? 0) > 0) pendingAthletes.push(userId)
    }
    const batch = pendingAthletes.slice(0, budget)

    const totals: AthleteOutcome = {
      analysed: 0, confirmed: 0, confirmedUnlabeled: 0, pending: 0, rejected: 0, written: 0,
    }
    let processed = 0
    const failures: string[] = []
    for (const userId of batch) {
      try {
        const r = await processAthlete(supabase, userId)
        totals.analysed += r.analysed
        totals.confirmed += r.confirmed
        totals.confirmedUnlabeled += r.confirmedUnlabeled
        totals.pending += r.pending
        totals.rejected += r.rejected
        totals.written += r.written
        processed++
      } catch (e) {
        // Un athlète en échec ne doit pas faire tomber le lot ; il sera retenté au
        // passage suivant (il reste « stale »). Aucune donnée personnelle journalisée.
        failures.push(e instanceof Error ? e.message : 'error')
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        detection_version: RACE_DETECTION_VERSION,
        athletes_pending_before: pendingAthletes.length,
        athletes_processed: processed,
        remaining: Math.max(0, pendingAthletes.length - processed),
        failures,
        ...totals,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('detect-races error:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
