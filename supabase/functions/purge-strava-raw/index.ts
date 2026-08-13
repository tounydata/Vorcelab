// Purge périodique du payload Strava brut (API Policy §6.2 / §5.7).
//
// Réduit `strava_activities.raw_data` aux seules clés consommées par le produit dès
// qu'une activité dépasse la fenêtre de rétention (7 jours par défaut). Efface donc
// le tracé encodé et les points de départ/arrivée, que §5.7 interdit de conserver.
//
// Déclenchement : appel planifié (pg_cron, GitHub Actions ou tout ordonnanceur), avec
// le secret `PURGE_CRON_SECRET` en en-tête `x-cron-secret`. Aucune session utilisateur
// n'est impliquée — la purge est globale et ne dépend d'aucun appelant.
//
//   curl -X POST "$SUPABASE_URL/functions/v1/purge-strava-raw" \
//        -H "x-cron-secret: $PURGE_CRON_SECRET"
//
// Idempotent : un second passage ne retouche aucune ligne.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Fenêtre de rétention, en jours. §6.2 fixe le plafond à 7. */
const DEFAULT_RETENTION_DAYS = 7

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Comparaison à temps constant : évite qu'un appelant devine le secret en mesurant
 * le temps de réponse, octet par octet.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405)
  }

  const expected = Deno.env.get('PURGE_CRON_SECRET')
  if (!expected) {
    console.error('PURGE_CRON_SECRET is not configured')
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }

  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!safeEqual(provided, expected)) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }

  const admin = createClient(url, serviceKey)

  // La fenêtre reste paramétrable pour pouvoir la resserrer, jamais l'étendre :
  // au-delà de 7 jours on sortirait de ce que §6.2 autorise.
  const raw = Number(Deno.env.get('STRAVA_RAW_RETENTION_DAYS') ?? DEFAULT_RETENTION_DAYS)
  const days = Number.isFinite(raw)
    ? Math.min(Math.max(Math.trunc(raw), 0), DEFAULT_RETENTION_DAYS)
    : DEFAULT_RETENTION_DAYS

  const { data, error } = await admin.rpc('purge_expired_strava_raw', { p_days: days })
  if (error) {
    console.error('purge_expired_strava_raw failed:', error.message)
    return jsonResponse({ error: 'Purge failed' }, 500)
  }

  console.info('Strava raw payload purge:', JSON.stringify(data))
  return jsonResponse(data, 200)
})
