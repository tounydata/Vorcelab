import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Crée une session du Portail Client Stripe pour l'utilisateur connecté.
// Le portail (hébergé par Stripe) permet de résilier, changer de carte et voir
// les factures — obligation légale de résiliation facile côté client.
//
// Prérequis :
//   - Secret Supabase STRIPE_SECRET_KEY (clé sk_live_… du compte Stripe)
//   - Portail activé dans Stripe : Réglages → Facturation → Portail client
//
// Appelé depuis le front via supabase.functions.invoke('stripe-portal').

const RETURN_URL = 'https://vorcelab.app/profile/settings'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) {
    console.error('STRIPE_SECRET_KEY not configured')
    return json({ error: 'not_configured' }, 500)
  }

  // Identité de l'appelant via son JWT (header Authorization transmis par invoke()).
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const authed = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userErr } = await authed.auth.getUser()
  if (userErr || !user) return json({ error: 'unauthorized' }, 401)

  // Lecture du customer Stripe en service role (indépendant de la RLS).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  const customerId = profile?.stripe_customer_id
  if (!customerId) {
    // Aucun paiement Stripe rattaché (ex. PRO accordé manuellement) → pas de portail.
    return json({ error: 'no_customer' }, 404)
  }

  // Création de la session portail via l'API Stripe (form-urlencoded).
  const body = new URLSearchParams({ customer: customerId, return_url: RETURN_URL })
  const resp = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!resp.ok) {
    const detail = await resp.text()
    console.error('Stripe portal error:', resp.status, detail)
    // Portail non configuré dans Stripe → message dédié pour guider l'admin.
    return json({ error: resp.status === 400 ? 'portal_not_configured' : 'stripe_error' }, 502)
  }

  const session = await resp.json() as { url?: string }
  if (!session.url) return json({ error: 'stripe_error' }, 502)

  return json({ url: session.url }, 200)
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
