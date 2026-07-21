import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { captureException } from '../_shared/sentry.ts'
import {
  entitlementFromSubscription,
  isEntitlementEvent,
  shouldProcessEvent,
  type StripeSubscriptionLike,
} from '../_shared/stripeEntitlement.ts'

// Stripe webhook — reçoit les événements Stripe et accorde le PRO en base.
// Configurer dans Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Événements: checkout.session.completed, invoice.paid, invoice.payment_failed,
//     customer.subscription.created, customer.subscription.updated,
//     customer.subscription.deleted, charge.refunded
//   Secret webhook à stocker dans Supabase Secrets: STRIPE_WEBHOOK_SECRET
//
// Idempotence : chaque event est journalisé dans stripe_webhook_events (clé =
// event_id Stripe). Un event déjà `processed` est acké sans être rejoué ; seul
// un event en `error` peut être retenté (retries Stripe).
//
// Écritures :
//   - user_entitlements : SOURCE DE VÉRITÉ serveur (statut riche, période payée).
//   - profiles (plan_tier/plan_expires_at) : conservé en double-écriture pour les
//     lecteurs actuels (usePlanTier). Un event d'abonnement ne RÉTROGRADE jamais
//     profiles directement (les grants manuels admin doivent survivre) : la fin
//     d'accès passe par plan_expires_at, comme avant.
//
// Le grant s'écrit avec la clé service role : le RPC admin_grant_pro exige un
// appelant admin via auth.uid(), NULL pour un appel service role — il est
// réservé au dashboard admin.

// Marge après la fin de période payée avant de repasser en free : couvre les
// retards de webhook et les retries de paiement Stripe.
const GRACE_DAYS = 3

Deno.serve(async (req: Request) => {
  try {
    return await handleWebhook(req)
  } catch (err) {
    // Exception imprévue = paiement potentiellement non honoré → alerte Sentry.
    // Le 500 fait rejouer l'événement par Stripe (retries automatiques).
    console.error('stripe-webhook uncaught:', err)
    await captureException(err, { function: 'stripe-webhook' })
    return new Response('Internal error', { status: 500 })
  }
})

async function handleWebhook(req: Request): Promise<Response> {
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

  if (!event.id) {
    return new Response('Missing event id', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  console.log('Stripe event received:', event.type, event.id)

  // Les événements sans effet sur l'entitlement sont ackés sans journalisation.
  if (!isEntitlementEvent(event.type)) {
    return ok({ received: true, ignored: event.type })
  }

  // ── Idempotence : registre stripe_webhook_events ────────────────────────────
  const { data: prior, error: priorErr } = await supabase
    .from('stripe_webhook_events')
    .select('status, attempts')
    .eq('event_id', event.id)
    .maybeSingle()
  if (priorErr) {
    // Registre illisible → on préfère un retry Stripe à un double traitement muet.
    console.error('ledger read failed:', priorErr)
    return new Response('Ledger error', { status: 500 })
  }
  if (!shouldProcessEvent(prior)) {
    console.log(`Event ${event.id} already ${prior!.status} — acked without replay`)
    return ok({ received: true, duplicate: true })
  }

  const { error: ledgerErr } = await supabase.from('stripe_webhook_events').upsert({
    event_id: event.id,
    event_type: event.type,
    status: 'received',
    attempts: (prior?.attempts ?? 0) + 1,
    payload_hash: await sha256Hex(body),
  })
  if (ledgerErr) {
    console.error('ledger write failed:', ledgerErr)
    return new Response('Ledger error', { status: 500 })
  }

  try {
    await processEvent(supabase, event)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase.from('stripe_webhook_events').update({
      status: 'error',
      error: message,
    }).eq('event_id', event.id)
    console.error(`Event ${event.id} failed:`, message)
    await captureException(err, { function: 'stripe-webhook', eventId: event.id, type: event.type })
    return new Response('Processing error', { status: 500 })
  }

  await supabase.from('stripe_webhook_events').update({
    status: 'processed',
    processed_at: new Date().toISOString(),
    error: null,
  }).eq('event_id', event.id)

  return ok({ received: true })
}

// ── Traitement par type d'événement ──────────────────────────────────────────

async function processEvent(supabase: SupabaseClient, event: StripeEvent): Promise<void> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as CheckoutSession
    const userId = session.client_reference_id
    if (!userId) throw new Error(`No client_reference_id in session ${session.id}`)

    // Durée selon le plan (metadata.plan = 'monthly' | 'annual') ; les
    // renouvellements suivants sont couverts par invoice.paid.
    const plan = session.metadata?.plan ?? 'monthly'
    const months = plan === 'annual' ? 12 : 1
    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + months)

    const customerId = typeof session.customer === 'string' ? session.customer : null
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null

    await grantProProfiles(supabase, userId, withGrace(periodEnd),
      `Stripe ${session.mode} — session ${session.id}`, customerId)
    await upsertEntitlement(supabase, userId, {
      plan_tier: 'pro',
      status: 'active',
      source: 'stripe',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    })

    await supabase.from('user_events').insert({
      user_id: userId,
      event: 'plan_upgraded',
      meta: { stripe_session: session.id, plan, months },
    })
    console.log(`PRO granted to ${userId} until ${periodEnd.toISOString()}`)
    return
  }

  if (event.type === 'invoice.paid') {
    // Renouvellement d'abonnement : pas de client_reference_id ici — on
    // retrouve l'utilisateur via le customer stocké au premier checkout.
    const invoice = event.data.object as Invoice
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
    if (!customerId) {
      console.log(`No customer on invoice ${invoice.id} — nothing to do`)
      return
    }

    const userId = await findUserByCustomer(supabase, customerId)
    if (!userId) {
      // Premier paiement : checkout.session.completed (qui porte le user_id)
      // gère le grant et enregistre le customer — rien à faire ici.
      console.log(`No profile for customer ${customerId} (first invoice handled by checkout)`)
      return
    }

    // Fin de période payée = max des périodes des lignes de la facture.
    const periodEndS = Math.max(0, ...(invoice.lines?.data ?? []).map((l) => l.period?.end ?? 0))
    const periodEnd = periodEndS > 0 ? new Date(periodEndS * 1000) : new Date()
    if (periodEndS === 0) periodEnd.setMonth(periodEnd.getMonth() + 1)

    await grantProProfiles(supabase, userId, withGrace(periodEnd),
      `Stripe renouvellement — facture ${invoice.id}`, customerId)
    await upsertEntitlement(supabase, userId, {
      plan_tier: 'pro',
      status: 'active',
      source: 'stripe',
      stripe_customer_id: customerId,
      current_period_end: periodEnd.toISOString(),
    })
    console.log(`PRO renewed for ${userId} until ${periodEnd.toISOString()}`)
    return
  }

  if (event.type === 'invoice.payment_failed') {
    // Impayé : l'accès reste ouvert jusqu'à current_period_end (effectiveTier) ;
    // on marque le statut pour l'observabilité et les relances futures.
    const invoice = event.data.object as Invoice
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : null
    const userId = customerId ? await findUserByCustomer(supabase, customerId) : null
    if (!userId) {
      console.log(`payment_failed: no user for customer ${customerId ?? '∅'}`)
      return
    }
    await upsertEntitlement(supabase, userId, {
      status: 'past_due',
      source: 'stripe',
      stripe_customer_id: customerId,
    })
    console.log(`Entitlement past_due for ${userId}`)
    return
  }

  if (event.type.startsWith('customer.subscription.')) {
    // created / updated / deleted : l'objet subscription porte l'état exact
    // (statut, fin de période réelle, cancel_at_period_end).
    const sub = event.data.object as StripeSubscriptionLike
    const patch = entitlementFromSubscription(sub)
    const userId =
      (patch.stripe_customer_id && await findUserByCustomer(supabase, patch.stripe_customer_id)) ||
      (await findUserBySubscription(supabase, sub.id))
    if (!userId) {
      console.log(`subscription event: no user for customer ${patch.stripe_customer_id ?? '∅'}`)
      return
    }

    await upsertEntitlement(supabase, userId, { ...patch })

    // Double-écriture profiles UNIQUEMENT quand l'événement confirme/étend le PRO.
    // Jamais de rétrogradation directe ici (grants manuels admin préservés) :
    // l'expiration passe par plan_expires_at, comme avant.
    if (patch.plan_tier === 'pro' && patch.current_period_end) {
      await grantProProfiles(supabase, userId, withGrace(new Date(patch.current_period_end)),
        `Stripe subscription ${sub.id} (${patch.status})`, patch.stripe_customer_id)
    }
    console.log(`Entitlement ${patch.status} for ${userId} (sub ${sub.id})`)
    return
  }

  if (event.type === 'charge.refunded') {
    // Remboursement : décision produit au cas par cas (dashboard admin) — on
    // journalise sans révoquer automatiquement.
    console.log('charge.refunded acked (no automatic revoke)')
    return
  }
}

// ── Écritures base ───────────────────────────────────────────────────────────

/** Grant PRO dans profiles (lecteurs actuels) + trace dans plan_grants. */
async function grantProProfiles(
  supabase: SupabaseClient,
  userId: string,
  expires: Date,
  note: string,
  customerId: string | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    plan_tier: 'pro',
    plan_expires_at: expires.toISOString(),
    plan_note: note,
  }
  if (customerId) update.stripe_customer_id = customerId

  const { error } = await supabase.from('profiles').update(update).eq('id', userId)
  if (error) {
    // Échec du grant PRO après paiement : l'alerte la plus importante de l'app.
    await captureException(new Error(`grant PRO failed: ${error.message}`),
      { function: 'stripe-webhook', step: 'profiles-update', userId, note })
    throw new Error(`profiles update failed: ${error.message}`)
  }

  const { error: grantErr } = await supabase.from('plan_grants').insert({
    user_id: userId,
    granted_by: userId, // l'acheteur lui-même : c'est son achat
    plan_tier: 'pro',
    expires_at: expires.toISOString(),
    note,
  })
  if (grantErr) console.error('plan_grants insert failed (non bloquant):', grantErr)
}

/** Upsert user_entitlements — seules les colonnes fournies sont écrasées. */
async function upsertEntitlement(
  supabase: SupabaseClient,
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('user_entitlements').upsert(
    { user_id: userId, ...fields },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`user_entitlements upsert failed: ${error.message}`)
}

async function findUserByCustomer(supabase: SupabaseClient, customerId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles')
    .select('id').eq('stripe_customer_id', customerId).maybeSingle()
  if (data?.id) return data.id
  const { data: ent } = await supabase.from('user_entitlements')
    .select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
  return ent?.user_id ?? null
}

async function findUserBySubscription(supabase: SupabaseClient, subscriptionId: string): Promise<string | null> {
  const { data } = await supabase.from('user_entitlements')
    .select('user_id').eq('stripe_subscription_id', subscriptionId).maybeSingle()
  return data?.user_id ?? null
}

function withGrace(periodEnd: Date): Date {
  const d = new Date(periodEnd)
  d.setDate(d.getDate() + GRACE_DAYS)
  return d
}

function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Types Stripe minimaux ─────────────────────────────────────────────────────

interface StripeEvent {
  id: string
  type: string
  data: { object: unknown }
}

interface CheckoutSession {
  id: string
  mode: string
  client_reference_id: string | null
  customer: string | { id: string } | null
  subscription?: string | { id: string } | null
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

  // Comparaison en temps constant : pas de court-circuit dépendant des données.
  if (!sigs.some((s) => timingSafeEqualHex(s, expected))) {
    throw new Error('Signature mismatch')
  }

  return JSON.parse(payload) as StripeEvent
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
