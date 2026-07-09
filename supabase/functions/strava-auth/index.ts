// Sign in / sign up WITH Strava (utilisateur NON encore authentifié).
// Contrairement à strava-oauth (qui LIE Strava à un compte déjà connecté), cette
// fonction PUBLIQUE (verify_jwt = false) échange le code OAuth, retrouve ou crée le
// compte Vorcelab lié à l'athlète Strava, puis forge une session (magic-link admin →
// token_hash renvoyé au client, qui appelle verifyOtp).
//
// Sécurité : la possession d'un `code` Strava VALIDE prouve que l'appelant vient de
// consentir sur strava.com pour NOTRE app (code à usage unique, court, lié à notre
// redirect_uri). C'est la base d'authentification — identique au « Sign in with X ».
//
// Strava ne fournit pas d'email → on crée les comptes Strava avec un email synthétique
// (email_confirm=true, jamais de mail envoyé) pour pouvoir générer le magic-link.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { syncStravaActivitiesForUser } from '../_shared/strava.ts'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
// Domaine synthétique pour les comptes créés via Strava (aucun mail n'y est envoyé).
const STRAVA_EMAIL_DOMAIN = Deno.env.get('STRAVA_EMAIL_DOMAIN') ?? 'strava.users.vorcelab.app'

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'))
  const fail = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return handleCors(req)
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  try {
    const body = (await req.json()) as { code?: string; scope?: string }
    const { code, scope = '' } = body
    if (!code || typeof code !== 'string') return fail('Missing OAuth code', 400)

    const clientId = Deno.env.get('STRAVA_CLIENT_ID')
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')
    if (!clientId || !clientSecret) return fail('Strava credentials not configured', 500)

    // 1. Échange du code → tokens + identité de l'athlète (prouve le consentement Strava).
    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
    })
    if (!tokenRes.ok) {
      console.error('Strava token exchange failed:', tokenRes.status, await tokenRes.text())
      return fail('Strava token exchange failed', 502)
    }
    const tokenData = (await tokenRes.json()) as {
      access_token: string; refresh_token: string; expires_at: number
      athlete: { id: number; firstname: string; lastname: string; profile_medium: string }
    }
    const { access_token, refresh_token, expires_at, athlete } = tokenData
    if (!athlete?.id) return fail('Strava athlete missing', 502)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2. Compte lié à cet athlète ? sinon on le crée.
    let userId: string | null = null
    const { data: existing, error: lookupErr } = await admin
      .from('strava_tokens').select('user_id').eq('strava_athlete_id', athlete.id).limit(1).maybeSingle()
    if (lookupErr) { console.error('strava_tokens lookup error:', lookupErr.message); return fail('Lookup failed', 500) }
    if (existing?.user_id) userId = existing.user_id as string

    const syntheticEmail = `strava_${athlete.id}@${STRAVA_EMAIL_DOMAIN}`
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: {
          provider: 'strava', strava_athlete_id: athlete.id,
          firstname: athlete.firstname, lastname: athlete.lastname, avatar: athlete.profile_medium,
        },
      })
      if (createErr || !created?.user) {
        // Course possible (double clic) : l'autre requête a peut-être déjà créé le lien.
        const { data: retry } = await admin.from('strava_tokens').select('user_id').eq('strava_athlete_id', athlete.id).limit(1).maybeSingle()
        if (retry?.user_id) userId = retry.user_id as string
        else { console.error('createUser failed:', createErr?.message); return fail('Account creation failed', 500) }
      } else {
        userId = created.user.id
      }
    }

    // 3. Stocke / rafraîchit les tokens Strava (clé = user_id).
    const { error: upsertErr } = await admin.from('strava_tokens').upsert({
      user_id: userId, strava_athlete_id: athlete.id,
      access_token, refresh_token, expires_at, scope,
      athlete_firstname: athlete.firstname, athlete_lastname: athlete.lastname,
      athlete_avatar: athlete.profile_medium, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (upsertErr) {
      // Course (double inscription simultanée) : l'index unique strava_athlete_id a rejeté
      // notre insert car un autre compte vient de réclamer cet athlète → on reprend LE compte
      // gagnant (garantit « un athlète = un compte », même en cas de clics quasi simultanés).
      const { data: winner } = await admin.from('strava_tokens').select('user_id').eq('strava_athlete_id', athlete.id).limit(1).maybeSingle()
      if (winner?.user_id) { userId = winner.user_id as string }
      else { console.error('strava_tokens upsert error:', upsertErr.message); return fail('Failed to store Strava connection', 500) }
    }

    // 4. Forge une session : magic-link admin → on renvoie le token_hash (le client verifyOtp).
    const { data: udata, error: getErr } = await admin.auth.admin.getUserById(userId)
    const linkEmail = udata?.user?.email
    if (getErr || !linkEmail) { console.error('getUserById error:', getErr?.message); return fail('Session mint failed', 500) }
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: linkEmail })
    const tokenHash = linkData?.properties?.hashed_token
    if (linkErr || !tokenHash) { console.error('generateLink error:', linkErr?.message); return fail('Session mint failed', 500) }

    // 5. Sync initial en tâche de fond (ne bloque pas la connexion).
    syncStravaActivitiesForUser(admin, userId, access_token, { full: true }).catch((e) =>
      console.error('Initial sync error:', (e as Error).message))

    return new Response(
      JSON.stringify({
        token_hash: tokenHash,
        athlete: { id: athlete.id, firstname: athlete.firstname, lastname: athlete.lastname, avatar: athlete.profile_medium },
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('strava-auth error:', err instanceof Error ? err.message : 'Unknown error')
    return fail('Internal server error', 500)
  }
})
