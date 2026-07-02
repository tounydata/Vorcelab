import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Stripe webhook — reçoit les événements Stripe et accorde le PRO en base.
// Configurer dans Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Événements: checkout.session.completed, invoice.paid, customer.subscription.deleted
// Secret webhook à stocker dans Supabase Secrets: STRIPE_WEBHOOK_SECRET
//
// Le grant s'écrit directement dans profiles avec la clé service role :
// le RPC admin_grant_pro exige un appelant admin via auth.uid(), qui est NULL
// pour un appel service role — il est réservé au dashboard admin.

// Marge après la fin de période payée avant de repasser en free : couvre les
// retards de webhook et les retries de paiement Stripe.
const GRACE_DAYS = 3

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

    if (!userId) {
      console.error('No client_reference_id in session:', session.id)
      return new Response('No user ID', { status: 400 })
    }

    // Durée selon le plan (metadata.plan = 'monthly' | 'annual') ; les
    // renouvellements suivants sont couverts par invoice.paid.
    const plan = session.metadata?.plan ?? 'monthly'
    const months = plan === 'annual' ? 12 : 1
    const expires = new Date()
    expires.setMonth(expires.getMonth() + months)
    expires.setDate(expires.getDate() + GRACE_DAYS)

    const customerId = typeof session.customer === 'string' ? session.customer : null
    const granted = await grantPro(supabase, userId, expires, customerId,
      `Stripe ${session.mode} — session ${session.id}`)
    if (!granted) return new Response('DB error', { status: 500 })

    await supabase.from('user_events').insert({
      user_id: userId,
      event: 'plan_upgraded',
      meta: { stripe_session: session.id, plan, months },
    })

    console.log(`PRO granted to ${userId} until ${expires.toISOString()}`)
  }

  if (event.type === 'invoice.paid') {
    // Renouvellement d'abonnement : pas de client_reference_id ici — on
    // retrouve l'utilisateur via le customer stocké au premier checkout.
    const invoice = event.data.object as Invoice
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
    if (!customerId) {
      console.error('No customer on invoice:', invoice.id)
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()

    if (!profile) {
      // Premier paiement : checkout.session.completed (qui porte le user_id)
      // gère le grant et enregistre le customer — rien à faire ici.
      console.log(`No profile for customer ${customerId} (first invoice handled by checkout)`)
      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }

    // Fin de période payée = max des périodes des lignes de la facture.
    const periodEndS = Math.max(0, ...(invoice.lines?.data ?? []).map((l) => l.period?.end ?? 0))
    const expires = periodEndS > 0 ? new Date(periodEndS * 1000) : new Date()
    if (periodEndS === 0) expires.setMonth(expires.getMonth() + 1)
    expires.setDate(expires.getDate() + GRACE_DAYS)

    const granted = await grantPro(supabase, profile.id, expires, customerId,
      `Stripe renouvellement — facture ${invoice.id}`)
    if (!granted) return new Response('DB error', { status: 500 })

    console.log(`PRO renewed for ${profile.id} until ${expires.toISOString()}`)
  }

  if (event.type === 'customer.subscription.deleted') {
    // Abonnement résilié → on ne révoque pas immédiatement (la période payée reste
    // valide). plan_expires_at couvre jusqu'à la fin de période, puis usePlanTier
    // repasse le compte en free automatiquement.
    console.log('Subscription deleted (expiry date already set in DB)')
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// Grant PRO en direct (service role, bypass RLS) + trace dans plan_grants
// (granted_by = l'acheteur lui-même : c'est son achat).
async function grantPro(
  supabase: SupabaseClient,
  userId: string,
  expires: Date,
  customerId: string | null,
  note: string,
): Promise<boolean> {
  const update: Record<string, unknown> = {
    plan_tier: 'pro',
    plan_expires_at: expires.toISOString(),
    plan_note: note,
  }
  if (customerId) update.stripe_customer_id = customerId

  const { error } = await supabase.from('profiles').update(update).eq('id', userId)
  if (error) {
    console.error('profiles update failed:', error)
    return false
  }

  const { error: grantErr } = await supabase.from('plan_grants').insert({
    user_id: userId,
    granted_by: userId,
    plan_tier: 'pro',
    expires_at: expires.toISOString(),
    note,
  })
  if (grantErr) console.error('plan_grants insert failed (non bloquant):', grantErr)

  return true
}

// ── Types Stripe minimaux ─────────────────────────────────────────────────────

interface StripeEvent {
  type: string
  data: { object: unknown }
}

interface CheckoutSession {
  id: string
  mode: string
  client_reference_id: string | null
  customer: string | { id: string } | null
  metadata: Record<string, string> | null
}

interface Invoice {
  id: string
  customer: string | { id: string } | null
  lines?: { data: Array<{ period?: { end?: number } }> }
}

// ── Vérification signature HMAC-SHA256 (Web Crypto API) ───────────────────────

async function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string,
): Promise<StripeEvent> {
  let timestamp = ''
  const sigs: string[] = []
  for (const part of signature.split(',')) {
    const [k, v] = part.split('=')
    if (k === 't') timestamp = v
    // Stripe peut envoyer plusieurs v1 (rotation de secret) — toutes candidates.
    if (k === 'v1') sigs.push(v)
  }

  if (!timestamp || sigs.length === 0) throw new Error('Invalid signature format')

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

  if (!sigs.includes(expected)) throw new Error('Signature mismatch')

  return JSON.parse(payload) as StripeEvent
}
