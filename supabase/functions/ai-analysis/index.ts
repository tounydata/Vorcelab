Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || 'https://tounydata.github.io'
  const allowed = new Set([
    'https://vorcelab.app',
    'https://www.vorcelab.app',
    'https://tounydata.github.io',
    'http://localhost:5173',
    'http://localhost:4173',
  ])

  let allowOrigin = 'https://tounydata.github.io'
  try {
    const normalized = new URL(origin).origin
    if (allowed.has(normalized)) allowOrigin = normalized
  } catch {}

  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  return new Response(
    JSON.stringify({ error: 'External analysis is disabled. Vorcelab uses local deterministic analysis only.' }),
    { status: 410, headers }
  )
})
