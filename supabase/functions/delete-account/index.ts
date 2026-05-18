import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STATIC_ORIGINS = new Set([
  'https://tounydata.github.io',
  'https://runner-os.com',
  'https://www.runner-os.com',
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    // 1. Authentifier via JWT
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors(origin), 'Content-Type': 'application/json' }
    })

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors(origin), 'Content-Type': 'application/json' }
    })

    const userId = user.id
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 2. Récupérer strava_tokens pour révoquer + nettoyer webhook events
    const { data: tokenRow } = await admin
      .from('strava_tokens')
      .select('access_token, strava_athlete_id')
      .eq('user_id', userId)
      .maybeSingle()

    // 3. Révoquer Strava — best effort
    if (tokenRow?.access_token) {
      try {
        await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${tokenRow.access_token}` },
        })
      } catch { /* best effort, continue */ }
    }

    // 4. Supprimer webhook events liés à strava_athlete_id
    if (tokenRow?.strava_athlete_id) {
      await admin
        .from('strava_webhook_events')
        .delete()
        .eq('owner_id', tokenRow.strava_athlete_id)
    }

    // 5. Supprimer toutes les données utilisateur dans l'ordre
    const tables: { table: string; column: string }[] = [
      { table: 'renfo_exercise_log',  column: 'user_id' },
      { table: 'renfo_session_log',   column: 'user_id' },
      { table: 'renfo_max_lifts',     column: 'user_id' },
      { table: 'renfo_program',       column: 'user_id' },
      { table: 'renfo_profile',       column: 'user_id' },
      { table: 'race_calendar',       column: 'user_id' },
      { table: 'activities_history',  column: 'user_id' },
      { table: 'strava_activities',   column: 'user_id' },
      { table: 'strava_tokens',       column: 'user_id' },
      { table: 'profiles',            column: 'id'      },
    ]

    for (const { table, column } of tables) {
      const { error } = await admin.from(table).delete().eq(column, userId)
      if (error) console.error(`delete ${table} error:`, error.message)
    }

    // 6. Supprimer le compte Supabase Auth
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId)
    if (deleteAuthError) {
      console.error('deleteUser error:', deleteAuthError.message)
      return new Response(JSON.stringify({ error: 'Failed to delete auth user' }), {
        status: 500, headers: { ...cors(origin), 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200, headers: { ...cors(origin), 'Content-Type': 'application/json' }
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('delete-account error:', msg)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...cors(origin), 'Content-Type': 'application/json' }
    })
  }
})
