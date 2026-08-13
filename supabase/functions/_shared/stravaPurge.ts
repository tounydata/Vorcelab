/**
 * Surface minimale requise du client Supabase : seul `rpc` est utilisé. Un type
 * structurel évite d'imposer aux appelants le client strictement typé (le webhook
 * utilise volontairement un client permissif).
 */
interface RpcCapableClient {
  rpc(
    fn: string,
    params: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/**
 * Compteurs retournés par `public.purge_strava_data`.
 * `renfo_unlinked` = séances conservées dont le lien Strava a été coupé.
 */
export interface StravaPurgeResult {
  user_id: string
  purged_at: string
  tokens: number
  activities: number
  streams: number
  weather: number
  snapshots: number
  webhook_events: number
  renfo_unlinked: number
}

/**
 * Purge les Strava Data et toutes les données qui en dérivent pour un utilisateur.
 *
 * Strava API Policy §7.4 (b) : la révocation d'autorisation oblige à supprimer, sous
 * 30 jours, l'intégralité des Strava Data et des Personal Data dérivées. Les deux
 * chemins de révocation passent ici — déconnexion depuis Vorcelab
 * (`strava-disconnect`) et désautorisation depuis Strava (`strava-webhook`) — pour
 * qu'il n'existe qu'une seule définition de « tout supprimer ».
 *
 * La suppression est transactionnelle côté SQL : en cas d'échec, rien n'est
 * supprimé et l'appel peut être rejoué (la fonction est idempotente).
 *
 * Requiert un client service role : la fonction SQL est révoquée pour `authenticated`.
 */
export async function purgeStravaData(
  admin: RpcCapableClient,
  userId: string,
): Promise<StravaPurgeResult> {
  const { data, error } = await admin.rpc('purge_strava_data', { p_user_id: userId })
  if (error) {
    throw new Error(`Strava purge failed: ${error.message}`)
  }
  return data as StravaPurgeResult
}
