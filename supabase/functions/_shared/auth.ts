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
