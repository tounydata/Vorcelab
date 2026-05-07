const STATIC_ORIGINS = new Set([
  'https://runner-os.com',
  'https://www.runner-os.com',
  'https://tounydata.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

const dynamicOrigins: string[] = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => normalizeOrigin(o))
  .filter((o): o is string => Boolean(o))

function resolveOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) {
    return 'http://localhost:5173'
  }

  const normalizedRequestOrigin = normalizeOrigin(requestOrigin)

  if (!normalizedRequestOrigin) {
    return 'http://localhost:5173'
  }

  if (
    STATIC_ORIGINS.has(normalizedRequestOrigin) ||
    dynamicOrigins.includes(normalizedRequestOrigin)
  ) {
    return normalizedRequestOrigin
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
