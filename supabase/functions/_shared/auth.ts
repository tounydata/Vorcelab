import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export interface AuthUser {
  id: string
  email?: string
}

export async function requireAuth(req: Request): Promise<AuthUser> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) throw new Error('Unauthorized')

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const client = createClient(url, anonKey)

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token)
  if (error || !user) throw new Error('Unauthorized')

  return { id: user.id, email: user.email }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Exige que l'appelant présente une clé de niveau SERVICE (endpoints de maintenance :
 * cron, jobs admin). Lève `AuthError` sinon — l'appelant répond 403.
 *
 * Pourquoi une vérification de POUVOIRS et non une comparaison de texte : le projet
 * possède désormais DEUX générations de clés (ancienne `eyJ…` JWT et nouvelle
 * `sb_secret_…`), qui ouvrent les mêmes droits. Le runtime Supabase injecte l'ANCIENNE
 * dans `SUPABASE_SERVICE_ROLE_KEY` ; un appelant configuré avec la nouvelle échouait donc
 * un `auth !== Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` — refusé alors qu'il
 * était parfaitement légitime (panne du 2026-07-30 sur `engine-data-refresh`).
 *
 * On teste donc ce que la clé PEUT FAIRE : lister les utilisateurs est réservé au rôle
 * service. Une clé anon ou publishable échoue, quelle que soit sa génération.
 */
export async function requireServiceRole(req: Request): Promise<void> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() ?? ''
  if (!token) throw new AuthError('Forbidden')
  const client = createClient(Deno.env.get('SUPABASE_URL')!, token, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (error) throw new AuthError('Forbidden')
}
