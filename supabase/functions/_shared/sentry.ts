// Capture d'erreurs vers Sentry depuis les Edge Functions — sans SDK, via
// l'API envelope (un simple POST). No-op tant que le secret SENTRY_DSN n'est
// pas configuré (voir docs/sentry-setup.md). Ne jette jamais : le monitoring
// ne doit pas faire échouer la fonction qu'il surveille.
const SENTRY_DSN = Deno.env.get('SENTRY_DSN')

export async function captureException(
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!SENTRY_DSN) return
  try {
    const dsn = new URL(SENTRY_DSN)
    const projectId = dsn.pathname.replace(/\//g, '')
    const endpoint = `https://${dsn.host}/api/${projectId}/envelope/?sentry_key=${dsn.username}&sentry_version=7`

    const e = err instanceof Error ? err : new Error(String(err))
    const event = {
      platform: 'javascript',
      level: 'error',
      environment: 'edge',
      timestamp: Date.now() / 1000,
      exception: { values: [{ type: e.name, value: e.message }] },
      tags: { runtime: 'supabase-edge', function: String(context.function ?? 'unknown') },
      extra: { ...context, stack: e.stack },
    }

    // Envelope Sentry = 3 lignes JSON (header, item header, event)
    const body = `${JSON.stringify({ sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`
    await fetch(endpoint, { method: 'POST', body })
  } catch (sendErr) {
    console.error('Sentry capture failed (ignoré):', sendErr)
  }
}
