import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildStravaSupportAuthorizationUrl,
  parseAdminSupportAction,
} from '../supabase/functions/_shared/adminSupport'
import { isSupportSessionWindow } from '../src/lib/supportSession'

const migration = readFileSync(
  resolve('supabase/migrations/20260729121647_admin_support_mode.sql'),
  'utf8',
).toLowerCase()
const edgeFunction = readFileSync(
  resolve('supabase/functions/admin-support/index.ts'),
  'utf8',
)
const config = readFileSync(resolve('supabase/config.toml'), 'utf8')
const stravaOauth = readFileSync(
  resolve('supabase/functions/strava-oauth/index.ts'),
  'utf8',
)
const stravaAuth = readFileSync(
  resolve('supabase/functions/strava-auth/index.ts'),
  'utf8',
)
const adminPage = readFileSync(resolve('src/pages/AdminPage.tsx'), 'utf8')
const supabaseClient = readFileSync(resolve('src/lib/supabase.ts'), 'utf8')
const supportSessionPage = readFileSync(
  resolve('src/pages/SupportSessionPage.tsx'),
  'utf8',
)
const supportBanner = readFileSync(
  resolve('src/components/SupportSessionBanner.tsx'),
  'utf8',
)
const stravaConnection = readFileSync(
  resolve('src/components/StravaConnection.tsx'),
  'utf8',
)
const upgradeModal = readFileSync(resolve('src/components/UpgradeModal.tsx'), 'utf8')
const subscriptionCard = readFileSync(
  resolve('src/components/SubscriptionCard.tsx'),
  'utf8',
)
const settingsPage = readFileSync(resolve('src/pages/SettingsPage.tsx'), 'utf8')
const pagesPostbuild = readFileSync(resolve('scripts/pages-postbuild.mjs'), 'utf8')

describe('mode assistance administrateur', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('limite chaque intervention à un admin, une cible serveur et une durée', () => {
    expect(migration).toContain('create table if not exists public.admin_support_sessions')
    expect(migration).toContain("expires_at timestamptz not null default (now() + interval '45 minutes')")
    expect(migration).toContain('user_present boolean not null default true check (user_present is true)')
    expect(migration).toContain('is_admin is true')
    expect(migration).toContain('s.admin_user_id = caller_id')
    expect(migration).toContain('s.expires_at > now()')
  })

  it('garde les tables privées derrière RLS et des RPC explicitement accordées', () => {
    expect(migration).toContain('alter table public.admin_support_sessions enable row level security')
    expect(migration).toContain('alter table public.admin_support_action_log enable row level security')
    expect(migration).toContain(
      'revoke all on table public.admin_support_sessions from public, anon, authenticated',
    )
    expect(migration).toContain(
      'grant execute on function public.admin_get_support_context(uuid)\n  to authenticated',
    )
  })

  it('interdit les secrets dans le journal et ne les expose pas dans le contexte admin', () => {
    expect(migration).toContain('admin_support_action_log_no_secrets')
    expect(migration).toContain(
      'access_token|refresh_token|password|client_secret|authorization|token_hash|hashed_token|otp',
    )

    const contextFunction = migration.slice(
      migration.indexOf('create or replace function public.admin_get_support_context'),
      migration.indexOf('create or replace function public.admin_update_user_support_profile'),
    )
    expect(contextFunction).not.toContain('st.access_token')
    expect(contextFunction).not.toContain('st.refresh_token')
  })

  it('dérive toujours la cible de la session support, jamais du corps de requête', () => {
    const requestInterface = edgeFunction.slice(
      edgeFunction.indexOf('interface SupportRequest'),
      edgeFunction.indexOf('interface SupportSession'),
    )
    expect(requestInterface).not.toContain('targetUserId')
    expect(requestInterface).not.toContain('target_user_id')
    expect(edgeFunction).toContain('.eq(\'admin_user_id\', adminUserId)')
    expect(edgeFunction).toContain('session.target_user_id')
  })

  it('exige le JWT au gateway puis revalide le rôle admin côté serveur', () => {
    expect(config).toMatch(/\[functions\.admin-support\]\s+verify_jwt = true/)
    expect(edgeFunction).toContain('const user = await requireAuth(req)')
    expect(edgeFunction).toContain("profile?.is_admin !== true")
  })

  it('construit une réautorisation forcée avec les deux scopes requis', () => {
    const url = new URL(buildStravaSupportAuthorizationUrl('161609'))
    expect(url.origin + url.pathname).toBe('https://www.strava.com/oauth/authorize')
    expect(url.searchParams.get('approval_prompt')).toBe('force')
    expect(url.searchParams.get('scope')).toBe('read,activity:read_all')
    expect(url.searchParams.get('redirect_uri')).toBe('https://vorcelab.app/')
    expect(url.searchParams.get('state')).toBe('vl_strava')
  })

  it('refuse les actions non prévues', () => {
    expect(parseAdminSupportAction('strava_sync_full')).toBe('strava_sync_full')
    expect(parseAdminSupportAction('start_vorcelab_impersonation')).toBe(
      'start_vorcelab_impersonation',
    )
    expect(parseAdminSupportAction('read_tokens')).toBeNull()
    expect(parseAdminSupportAction({ action: 'strava_sync_full' })).toBeNull()
  })

  it('fait foi du scope renvoyé par Strava et protège l’athlète déjà lié', () => {
    for (const source of [stravaOauth, stravaAuth]) {
      expect(source).toContain("const grantedScope = tokenData.scope ?? ''")
      expect(source).toContain('hasRequiredStravaActivityScope(grantedScope)')
      expect(source).not.toContain('const { code, scope')
    }
    expect(stravaOauth).toContain('Number(currentToken.strava_athlete_id) !== athlete.id')
  })

  it('ouvre une vraie session cible avec un OTP à usage unique, sans mot de passe', () => {
    const impersonationCase = edgeFunction.slice(
      edgeFunction.indexOf("case 'start_vorcelab_impersonation'"),
      edgeFunction.indexOf("case 'send_password_reset'"),
    )
    expect(impersonationCase).toContain('admin.auth.admin.generateLink')
    expect(impersonationCase).toContain("type: 'magiclink'")
    expect(impersonationCase).toContain('properties?.hashed_token')
    expect(impersonationCase).toContain('token_hash: tokenHash')
    expect(impersonationCase).not.toContain('password')
    expect(impersonationCase).toContain(
      "{ isolated_window: true, expires_at: session.expires_at }",
    )
  })

  it('isole la session assistée de la session admin et efface le fragment avant vérification', () => {
    expect(supabaseClient).toContain('storage: window.sessionStorage')
    expect(supabaseClient).toContain('storageKey: SUPPORT_AUTH_STORAGE_KEY')
    expect(supabaseClient).toContain('detectSessionInUrl: false')

    const clearIndex = supportSessionPage.indexOf(
      "window.history.replaceState({}, '', '/support-session/')",
    )
    const verifyIndex = supportSessionPage.indexOf('supabase.auth.verifyOtp')
    expect(clearIndex).toBeGreaterThan(-1)
    expect(verifyIndex).toBeGreaterThan(clearIndex)
    expect(supportSessionPage).toContain("type: 'magiclink'")
    expect(supportSessionPage).toContain('data.user.id !== payload.targetUserId')
  })

  it('matérialise la route privée sur GitHub Pages sans l’indexer', () => {
    expect(adminPage).toContain("new URL('/support-session/', window.location.origin)")
    expect(pagesPostbuild).toContain("const PRIVATE_SPA_ROUTES = ['support-session']")
    expect(pagesPostbuild).toContain('noindex,nofollow')

    vi.stubGlobal('window', {
      location: { pathname: '/support-session/' },
      sessionStorage: { getItem: () => null },
    })
    expect(isSupportSessionWindow()).toBe(true)
  })

  it('vérifie et termine la fenêtre assistée uniquement pour la cible authentifiée', () => {
    expect(migration).toContain('create or replace function public.support_validate_assisted_session')
    expect(migration).toContain('create or replace function public.support_end_assisted_session')
    expect(migration.match(/s\.target_user_id = caller_id/g)?.length).toBeGreaterThanOrEqual(2)
    expect(migration.match(/s\.expires_at > now\(\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(supportBanner).toContain("'support_validate_assisted_session'")
    expect(supportBanner).toContain("'support_end_assisted_session'")
    expect(supportBanner).toContain("signOut({ scope: 'local' })")
  })

  it('met le bouton réel sur chaque profil et exige présence plus accord explicite', () => {
    expect(adminPage).toContain('ASSISTER CE COMPTE')
    expect(adminPage).toContain("action: 'start_vorcelab_impersonation'")
    expect(adminPage).toContain("consent_mode: 'verbal'")
    expect(adminPage).toContain('user_present: true')
    expect(adminPage).toContain('tu attestes')
    expect(adminPage).toContain('sans pouvoir vérifier la conversation Teams')
    expect(migration).toContain(
      'vorcelab ne vérifie ni n’enregistre la conversation externe',
    )
    expect(adminPage).not.toContain('Vue en tant que')
  })

  it('bloque les actions de sécurité, paiement et OAuth dans la fenêtre assistée', () => {
    expect(settingsPage).toContain(
      'Changement de mot de passe bloqué pendant une session assistée.',
    )
    expect(upgradeModal).toContain(
      'const effectivePreviewMode = previewMode || isSupportSessionWindow()',
    )
    expect(subscriptionCard).toContain('paiement, factures et carte bancaire restent bloqués')
    expect(stravaConnection).toContain('disabled={supportWindow}')
    expect(stravaConnection).toContain('À VALIDER SUR SON APPAREIL')
  })
})
