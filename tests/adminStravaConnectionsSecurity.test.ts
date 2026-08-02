import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// La migration CORRECTIVE fait foi : c'est elle qui décrit la fonction telle
// qu'elle tourne en production (cf. 20260802010000, qui remplace la première
// version — celle-ci référençait une colonne absente du schéma réel).
const migration = readFileSync(
  resolve('supabase/migrations/20260802010000_fix_admin_strava_connections.sql'),
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

  it('n’utilise que des colonnes réellement présentes en production', () => {
    // strava_tokens n'a PAS de created_at en base : la première version de la
    // fonction levait « column st.created_at does not exist » à chaque appel.
    expect(sql).not.toContain('st.created_at')
    expect(sql).toContain('st.updated_at')
  })

  it('expose la dernière connexion, la dernière activité et la dernière synchro', () => {
    expect(migration).toContain('u.last_sign_in_at')
    expect(migration).toContain('max(sa.start_date) as last_activity_at')
    expect(migration).toContain('st.last_sync_at')
    // Les activités supprimées ne doivent pas faire passer un compte pour actif.
    expect(migration).toContain('sa.deleted_at is null')
  })

  it('mesure l’inactivité sur l’usage Strava, pas sur l’ouverture de l’app', () => {
    // Un jeton sert à récupérer des activités : c'est la dernière activité qui
    // dit si la place est occupée pour rien, pas la dernière connexion.
    expect(sql).toContain('order by act.last_activity_at asc nulls first')
    expect(sql).not.toContain('greatest(u.last_sign_in_at')
  })

  it('la carte admin ne déclenche aucune déconnexion : lecture seule', () => {
    // La révocation Strava reste derrière le flux d'assistance journalisé
    // (action strava_disconnect), jamais derrière un bouton de liste.
    expect(card).not.toContain('strava_disconnect')
    expect(card).not.toContain('.delete()')
    expect(card).toContain("supabase.rpc('admin_list_strava_connections')")
    expect(card).toContain('token_updated_at')
  })
})
