import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// ── Inventaire des connexions Strava ──────────────────────────────────────────
// L'application Strava plafonne le nombre d'athlètes connectés. Cette carte
// répond à une seule question, sur données et pas de mémoire : si un jeton doit
// être libéré, lequel dort depuis le plus longtemps ?
// Lecture seule — la révocation reste derrière le flux d'assistance journalisé
// (onglet Assistance → « Déconnecter Strava »).

/**
 * Plafond d'athlètes de l'app Strava. À relever ici le jour où Strava augmente
 * la limite du compte développeur.
 */
const STRAVA_ATHLETE_LIMIT = 10

/**
 * Au-delà, un compte est considéré endormi. Le critère est la dernière ACTIVITÉ
 * Strava, pas la dernière connexion : un jeton sert à récupérer des activités,
 * donc quelqu'un qui ouvre l'app sans plus jamais courir occupe une place pour
 * rien — c'est exactement le compte qu'on cherche quand le quota est plein.
 */
const IDLE_DAYS = 30

interface StravaConnection {
  user_id: string
  email: string
  name: string | null
  is_admin: boolean
  athlete_id: number
  athlete_name: string | null
  scope: string | null
  /** Dernier rafraîchissement du jeton (la date de liaison n'existe pas en base). */
  token_updated_at: string | null
  last_sign_in_at: string | null
  last_sync_at: string | null
  last_activity_at: string | null
  activities_total: number
  activities_30d: number
  idle_since: string | null
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86_400_000)
}

/** « il y a 3 j » / « aujourd'hui » / « jamais » — l'unité qui compte ici est le jour. */
function since(iso: string | null): string {
  const d = daysSince(iso)
  if (d === null) return 'jamais'
  if (d <= 0) return "aujourd'hui"
  if (d === 1) return 'hier'
  if (d < 30) return `il y a ${d} j`
  const months = Math.floor(d / 30)
  return months < 12 ? `il y a ${months} mois` : `il y a ${Math.floor(d / 365)} an(s)`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

function Cell({ label, value, sub, dim }: { label: string; value: string; sub?: string; dim?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, letterSpacing: '.1em', color: 'var(--vl-text-3)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12.5, color: dim ? 'var(--vl-text-3)' : 'var(--vl-text)', marginTop: 3, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function StravaConnectionsCard() {
  const query = useQuery<StravaConnection[]>({
    queryKey: ['admin-strava-connections'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_strava_connections')
      if (error) throw error
      return (data ?? []) as unknown as StravaConnection[]
    },
  })

  const rows = query.data ?? []
  const used = rows.length
  const full = used >= STRAVA_ATHLETE_LIMIT
  const idleCount = rows.filter((r) => (daysSince(r.idle_since) ?? Infinity) >= IDLE_DAYS).length

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--vl-text-3)', textTransform: 'uppercase' }}>Connexions Strava</div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.35rem', fontWeight: 800, marginTop: 5 }}>
            Qui occupe un jeton athlète
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', marginTop: 4 }}>
            Trié du plus endormi au plus actif — l'ordre suit la dernière activité Strava, pas la dernière connexion.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: full ? 'var(--vl-ember)' : 'var(--vl-text)' }}>
            {used}<span style={{ color: 'var(--vl-text-3)', fontSize: '1.2rem' }}>/{STRAVA_ATHLETE_LIMIT}</span>
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: full ? 'var(--vl-ember)' : 'var(--vl-text-3)', marginTop: 5, letterSpacing: '.1em' }}>
            {full ? 'PLAFOND ATTEINT' : `${STRAVA_ATHLETE_LIMIT - used} PLACE(S)`}
          </div>
          {idleCount > 0 && (
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 3 }}>
              {idleCount} endormi(s) &gt; {IDLE_DAYS} j
            </div>
          )}
        </div>
      </div>

      {query.isLoading && <div className="mlabel">Chargement des connexions…</div>}
      {query.isError && <div style={{ color: 'var(--vl-status-bad, #d66)', fontSize: '.85rem' }}>Erreur : {(query.error as Error).message}</div>}
      {!query.isLoading && !query.isError && rows.length === 0 && (
        <div className="mlabel">Aucun compte Strava relié.</div>
      )}

      {rows.map((r) => {
        const idleDays = daysSince(r.idle_since)
        const idle = (idleDays ?? Infinity) >= IDLE_DAYS
        return (
          <div
            key={r.user_id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(160px, 1.6fr) repeat(4, minmax(90px, 1fr))',
              gap: 12,
              padding: '12px 4px',
              borderTop: '1px solid var(--vl-line)',
              alignItems: 'start',
              background: idle ? 'color-mix(in oklab, var(--vl-ember) 5%, transparent)' : 'transparent',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--vl-text)' }}>{r.name || r.athlete_name || '—'}</span>
                {idle && (
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, fontWeight: 700, letterSpacing: '.1em', color: 'var(--vl-ember)', border: '1px solid var(--vl-ember)', borderRadius: 999, padding: '1px 7px' }}>
                    ENDORMI
                  </span>
                )}
                {r.is_admin && (
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, color: 'var(--vl-text-3)', border: '1px solid var(--vl-line)', borderRadius: 999, padding: '1px 7px' }}>
                    ADMIN
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, color: 'var(--vl-text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.email}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 2 }}>
                Strava #{r.athlete_id} · jeton MAJ {fmtDate(r.token_updated_at)}
              </div>
            </div>
            <Cell label="Dernière connexion" value={since(r.last_sign_in_at)} sub={fmtDate(r.last_sign_in_at)} dim={!r.last_sign_in_at} />
            <Cell label="Dernière activité" value={since(r.last_activity_at)} sub={fmtDate(r.last_activity_at)} dim={!r.last_activity_at} />
            <Cell label="Dernière synchro" value={since(r.last_sync_at)} sub={fmtDate(r.last_sync_at)} dim={!r.last_sync_at} />
            <Cell label="Activités" value={`${r.activities_30d} / 30 j`} sub={`${r.activities_total} au total`} />
          </div>
        )
      })}

      {rows.length > 0 && (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 12, lineHeight: 1.6 }}>
          Lecture seule. Pour libérer un jeton : onglet Assistance → session sur le compte → « Déconnecter Strava »
          (révocation côté Strava + suppression du jeton, journalisée). L'historique déjà synchronisé reste intact
          et le coureur peut se reconnecter en un clic.
        </div>
      )}
    </div>
  )
}
