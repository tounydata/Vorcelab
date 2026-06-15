import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import { computeCoPerioWarnings, type SessionLog } from '../../lib/renfoUtils'
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../../lib/renfoData'

// Détail d'une séance RENFO depuis le menu de la semaine : la séance suggérée pour
// ce créneau + toutes les catégories (excentrique, tronc, mobilité…) avec les
// badges « recommandé / à éviter cette semaine » issus de la co-périodisation.
// L'athlète choisit librement, puis LANCE la séance (page renfo dédiée).

const FORCE_FOCUSES = ['force_lourde', 'pliometrie', 'excentrique', 'tronc'] as const
const MOBILITE_FOCUSES = ['haut_corps', 'yoga_coureur', 'pilates_coureur', 'stretching'] as const

function fmtLastDate(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return "aujourd'hui"
  if (diff === 1) return 'hier'
  return `il y a ${diff}j`
}

export default function RenfoDetail({ slotFocus }: { slotFocus: string }) {
  const { user } = useVLStore()

  // Charge récente (3 j) → co-périodisation (quoi privilégier / éviter cette semaine).
  const { data: activities = [] } = useQuery({
    queryKey: ['activities-copério'],
    enabled: !!user,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('strava_activities')
        .select('start_date_local,type,sport_type,distance,moving_time,total_elevation_gain')
        .gte('start_date_local', cutoff)
        .order('start_date_local', { ascending: false })
      return data ?? []
    },
  })

  // Dernières séances renfo (7 j) → « il y a Xj » par focus.
  const { data: sessionLogs = [] } = useQuery<SessionLog[]>({
    queryKey: ['renfo-session-logs-7d'],
    enabled: !!user,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_session_log')
        .select('id,focus,duration_min,session_date,source')
        .eq('user_id', user!.id)
        .gte('session_date', cutoff)
        .order('session_date', { ascending: false })
      return (data ?? []) as SessionLog[]
    },
  })

  const warnings = computeCoPerioWarnings(activities as Parameters<typeof computeCoPerioWarnings>[0])
  const preferred = new Set(warnings.flatMap((w) => w.prefer))
  const avoided = new Set(warnings.flatMap((w) => w.avoid))
  const lastDateByFocus: Record<string, string> = {}
  for (const s of sessionLogs) {
    if (s.focus && s.session_date && !lastDateByFocus[s.focus]) lastDateByFocus[s.focus] = s.session_date
  }

  const suggestMeta = FOCUS_META[slotFocus]

  function renderFocus(focus: string) {
    const meta = FOCUS_META[focus]
    if (!meta) return null
    const color = RENFO_FOCUS_COLORS[focus] ?? 'var(--color-renfo)'
    const lastDate = lastDateByFocus[focus]
    const isPreferred = preferred.has(focus)
    const isAvoided = avoided.has(focus)
    return (
      <Link key={focus} to={`/renfo/session/${focus}`} style={{ textDecoration: 'none' }}>
        <div className="rfoc" style={{ borderTop: `3px solid ${color}`, opacity: isAvoided ? 0.45 : 1 }}>
          <div className="rfoc-n" style={{ color }}>{meta.label}</div>
          <div className="rfoc-m">{meta.duration_min} min{lastDate ? ` · ${fmtLastDate(lastDate)}` : ' · jamais'}</div>
          {isPreferred && <span className="rfoc-rec">★ Recommandé</span>}
          {isAvoided && <span className="rfoc-avoid">évité cette semaine</span>}
        </div>
      </Link>
    )
  }

  return (
    <div>
      {/* Séance suggérée pour ce créneau */}
      {suggestMeta && (
        <div className="rsuggest" style={{ marginTop: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rsuggest-l">Suggéré pour ce créneau</div>
            <div className="rsuggest-n">{suggestMeta.label}</div>
            <div className="rsuggest-d">{suggestMeta.duration_min} min{preferred.has(slotFocus) ? ' · privilégié par la co-périodisation' : ''}</div>
          </div>
          <span className="rsuggest-alt">…ou choisis une autre catégorie ↓</span>
          <Link to={`/renfo/session/${slotFocus}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
            <button className="hbtn hbtn-go">Démarrer</button>
          </Link>
        </div>
      )}

      {/* Catégories — choix libre */}
      <div className="rcat-h">Force &amp; puissance</div>
      <div className="rfocgrid">{FORCE_FOCUSES.map(renderFocus)}</div>
      <div className="rcat-h">Mobilité &amp; prévention</div>
      <div className="rfocgrid">{MOBILITE_FOCUSES.map(renderFocus)}</div>

      <div style={{ marginTop: '0.9rem' }}>
        <Link to="/renfo/library"><button className="hbtn">BIBLIOTHÈQUE COMPLÈTE</button></Link>
      </div>
    </div>
  )
}
