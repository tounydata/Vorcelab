// Purge périodique du payload Strava brut (API Policy §6.2 / §5.7).
//
// Réduit `strava_activities.raw_data` aux seules clés consommées par le produit dès
// qu'une activité dépasse la fenêtre de rétention (7 jours par défaut). Efface donc
// le tracé encodé et les points de départ/arrivée, que §5.7 interdit de conserver.
//
// Déclenchement : appel planifié (pg_cron, GitHub Actions ou tout ordonnanceur)
// présentant une clé de niveau SERVICE. Aucune session utilisateur n'est impliquée —
// la purge est globale et ne dépend d'aucun appelant.
//
//   curl -X POST "$SUPABASE_URL/functions/v1/purge-strava-raw" \
//        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
//
// L'autorisation passe par `requireServiceRole`, qui teste ce que la clé PEUT FAIRE
// plutôt que de la comparer à une chaîne : le projet possède deux générations de clés
// de service (`eyJ…` et `sb_secret_…`) qui ouvrent les mêmes droits, et une comparaison
// textuelle rejetait la seconde (panne du 2026-07-30 sur `engine-data-refresh`). Aucun
// secret supplémentaire à provisionner : un oubli de configuration mettrait la purge en
// panne silencieuse, or c'est une obligation de conformité.
//
// Idempotent : un second passage ne retouche aucune ligne.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AuthError, requireServiceRole } from '../_shared/auth.ts'

/** Fenêtre de rétention, en jours. §6.2 fixe le plafond à 7. */
const DEFAULT_RETENTION_DAYS = 7

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405)
  }

  try {
    await requireServiceRole(req)
  } catch (err) {
    if (err instanceof AuthError) return jsonResponse({ error: 'Forbidden' }, 403)
    throw err
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // La fenêtre reste paramétrable pour pouvoir la RESSERRER, jamais l'étendre :
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
