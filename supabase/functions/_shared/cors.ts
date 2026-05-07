const STATIC_ORIGINS = new Set([
  'https://runner-os.com',
  'https://www.runner-os.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

const dynamicOrigins: string[] = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function resolveOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) return 'http://localhost:5173'
  if (STATIC_ORIGINS.has(requestOrigin) || dynamicOrigins.includes(requestOrigin)) {
    return requestOrigin
  }
  return 'http://localhost:5173'
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export function handleCors(req?: Request): Response {
  const origin = req?.headers.get('origin') ?? null
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  })
}
