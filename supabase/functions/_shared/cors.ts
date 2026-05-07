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

/** Returns CORS headers for the given request origin. */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Static CORS headers using null origin (falls back to localhost).
 * Spread-safe: { ...corsHeaders, 'Content-Type': 'application/json' }
 */
export const corsHeaders: Record<string, string> = getCorsHeaders(null)

export function handleCors(req?: Request): Response {
  const origin = req?.headers.get('origin') ?? null
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  })
}
