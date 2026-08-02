import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/20260802000000_admin_strava_connections.sql'),
  'utf8',
).toLowerCase()

// Le SQL exécuté, commentaires retirés : une mention de « access_token » en
// commentaire ne doit pas passer pour une fuite, ni en masquer une.
const sql = migration.replace(/--[^\n]*/g, '')

const card = readFileSync(
  resolve('src/components/admin/StravaConnectionsCard.tsx'),
  'utf8',
)

describe('inventaire des connexions Strava (admin)', () => {
  it('contrôle le rôle admin côté serveur', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = public, pg_temp')
    expect(migration).toContain('is_admin is true')
    expect(migration).toContain("raise exception 'forbidden'")
  })

  it('retire l’exécution à anon et PUBLIC, l’accorde au seul rôle authenticated', () => {
    expect(migration).toContain(
      'revoke all on function public.admin_list_strava_connections()\n  from anon, public',
    )
    expect(migration).toContain(
      'grant execute on function public.admin_list_strava_connections()\n  to authenticated',
    )
  })

  it('ne renvoie jamais de secret de connexion ou de paiement', () => {
    expect(sql).not.toContain('access_token')
    expect(sql).not.toContain('refresh_token')
    expect(sql).not.toContain('stripe_customer_id')
    expect(sql).not.toContain('raw_data')
  })

  it('expose la dernière connexion, la dernière activité et la dernière synchro', () => {
    expect(migration).toContain('u.last_sign_in_at')
    expect(migration).toContain('max(sa.start_date) as last_activity_at')
    expect(migration).toContain('st.last_sync_at')
    // Les activités supprimées ne doivent pas faire passer un compte pour actif.
    expect(migration).toContain('sa.deleted_at is null')
  })

  it('classe les comptes les plus endormis en tête', () => {
    expect(migration).toContain('asc nulls first')
  })

  it('la carte admin ne déclenche aucune déconnexion : lecture seule', () => {
    // La révocation Strava reste derrière le flux d'assistance journalisé
    // (action strava_disconnect), jamais derrière un bouton de liste.
    expect(card).not.toContain('strava_disconnect')
    expect(card).not.toContain('.delete()')
    expect(card).toContain("supabase.rpc('admin_list_strava_connections')")
  })
})
