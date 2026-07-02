import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Stripe webhook — reçoit les événements Stripe et accorde le PRO en base.
// Configurer dans Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Événements: checkout.session.completed, customer.subscription.deleted
// Secret webhook à stocker dans Supabase Secrets: STRIPE_WEBHOOK_SECRET

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  // Vérification de signature Stripe (HMAC-SHA256)
  let event: StripeEvent
  try {
    event = await verifyStripeWebhook(body, signature, webhookSecret)
  } catch (err) {
    console.error('Signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  console.log('Stripe event received:', event.type)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as CheckoutSession
    const userId = session.client_reference_id
    const mode = session.mode // 'subscription' | 'payment'

    if (!userId) {
      console.error('No client_reference_id in session:', session.id)
      return new Response('No user ID', { status: 400 })
    }

    // Durée selon le mode : abonnement mensuel = 1 mois, annuel = 12 mois
    // Le metadata.plan indique 'monthly' ou 'annual'
    const plan = session.metadata?.plan ?? 'monthly'
    const months = plan === 'annual' ? 12 : 1

    const { error } = await supabase.rpc('admin_grant_pro', {
      target_user_id: userId,
      months,
      note_text: `Stripe ${mode} — session ${session.id}`,
    })

    if (error) {
      console.error('admin_grant_pro failed:', error)
      return new Response('DB error', { status: 500 })
    }

    // Log dans user_events
    await supabase.from('user_events').insert({
      user_id: userId,
      event: 'plan_upgraded',
      meta: { stripe_session: session.id, plan, months },
    })

    console.log(`PRO granted to ${userId} for ${months} months`)
  }

  if (event.type === 'customer.subscription.deleted') {
    // Abonnement résilié → on ne révoque pas immédiatement (la période payée reste valide).
    // La date d'expiration en base couvre jusqu'à la fin de période — rien à faire ici.
    console.log('Subscription deleted (expiry date already set in DB)')
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Types Stripe minimaux ─────────────────────────────────────────────────────

interface StripeEvent {
  type: string
  data: { object: unknown }
}

interface CheckoutSession {
  id: string
  mode: string
  client_reference_id: string | null
  metadata: Record<string, string> | null
}

// ── Vérification signature HMAC-SHA256 (Web Crypto API) ───────────────────────

async function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string,
): Promise<StripeEvent> {
  const parts: Record<string, string> = {}
  for (const part of signature.split(',')) {
    const [k, v] = part.split('=')
    parts[k] = v
  }

  const timestamp = parts['t']
  const sig = parts['v1']
  if (!timestamp || !sig) throw new Error('Invalid signature format')

  // Vérifie que l'event n'est pas trop vieux (5 min max)
  const age = Date.now() / 1000 - parseInt(timestamp)
  if (age > 300) throw new Error(`Webhook too old: ${age}s`)

  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (expected !== sig) throw new Error('Signature mismatch')

  return JSON.parse(payload) as StripeEvent
}
