import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { captureException } from '../_shared/sentry.ts'

// Suppression de compte RGPD. Depuis la migration 20260712000000, toutes les FK
// de données utilisateur vers auth.users sont ON DELETE CASCADE : supprimer le
// compte Auth efface TOUTES les données en une seule transaction (atomique). On
// ne fait plus de suppression table par table « best effort » qui pouvait laisser
// un état partiel. Restent en best-effort (tracés) : la révocation Strava, le
// nettoyage des événements webhook Strava (clé = athlete_id, sans FK) et les
// avatars de stockage.

const STATIC_ORIGINS = new Set([
  'https://vorcelab.app',
  'https://www.vorcelab.app',
  'https://tounydata.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

function resolveOrigin(origin: string | null): string {
  if (!origin) return 'https://tounydata.github.io'
  try {
    const normalized = new URL(origin.trim()).origin
    return STATIC_ORIGINS.has(normalized) ? normalized : 'https://tounydata.github.io'
  } catch { return 'https://tounydata.github.io' }
}

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const jsonHeaders = { ...cors(origin), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })

    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })

    const userId = user.id
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Récupère le token Strava avant suppression (best-effort).
    const { data: tokenRow } = await admin
      .from('strava_tokens')
      .select('access_token, strava_athlete_id')
      .eq('user_id', userId)
      .maybeSingle()

    // Révocation Strava — best effort, mais tracée (ne doit pas être silencieuse).
    if (tokenRow?.access_token) {
      try {
        const resp = await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenRow.access_token}` },
        })
        if (!resp.ok) {
          await captureException(new Error(`Strava deauthorize HTTP ${resp.status}`),
            { function: 'delete-account', step: 'strava-revoke', userId })
        }
      } catch (err) {
        await captureException(err, { function: 'delete-account', step: 'strava-revoke', userId })
      }
    }

    // Événements webhook Strava (clé = athlete_id, pas de FK vers auth.users).
    if (tokenRow?.strava_athlete_id) {
      const { error } = await admin.from('strava_webhook_events').delete().eq('owner_id', tokenRow.strava_athlete_id)
      if (error) await captureException(new Error(error.message),
        { function: 'delete-account', step: 'strava-webhook-cleanup', userId })
    }

    // Avatars de stockage — best effort (pas de cascade sur le bucket).
    try {
      const { data: files } = await admin.storage.from('avatars').list(userId)
      if (files?.length) {
        await admin.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`))
      }
    } catch (err) {
      await captureException(err, { function: 'delete-account', step: 'avatar-cleanup', userId })
    }

    // Suppression du compte Auth → CASCADE sur toutes les tables de données.
    // Atomique : en cas d'échec, aucune donnée n'est supprimée partiellement.
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId)
    if (deleteAuthError) {
      await captureException(new Error(deleteAuthError.message),
        { function: 'delete-account', step: 'delete-auth-user', userId })
      return new Response(JSON.stringify({ error: 'Failed to delete account' }), { status: 500, headers: jsonHeaders })
    }

    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: jsonHeaders })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('delete-account error:', msg)
    await captureException(err, { function: 'delete-account' })
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...cors(origin), 'Content-Type': 'application/json' } })
  }
})
