import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors(origin), 'Content-Type': 'application/json' } })

    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error } = await authClient.auth.getUser(token)
    if (error || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors(origin), 'Content-Type': 'application/json' } })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: row } = await admin
      .from('strava_tokens')
      .select('athlete_firstname, athlete_lastname, athlete_avatar, last_sync_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!row) return new Response(JSON.stringify({ connected: false }), { status: 200, headers: { ...cors(origin), 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({
      connected: true,
      athlete_firstname: row.athlete_firstname ?? null,
      athlete_lastname: row.athlete_lastname ?? null,
      athlete_avatar: row.athlete_avatar ?? null,
      last_sync_at: row.last_sync_at ?? null,
    }), { status: 200, headers: { ...cors(origin), 'Content-Type': 'application/json' } })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors(origin), 'Content-Type': 'application/json' } })
  }
})
