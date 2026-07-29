import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useUpgradeModal } from '../../lib/useUpgradeModal'
import { useVLStore } from '../../store/vlStore'
import CalibrationPopup from '../coach/CalibrationPopup'
import OneRMTestPopup from '../coach/OneRMTestPopup'
import PostRaceModal from '../races/PostRaceModal'
import ShareStickers from '../ShareStickers'
import StravaActivityPermissionModal from '../StravaActivityPermissionModal'
import Onboarding from '../onboarding/Onboarding'

interface LabUser {
  id: string
  email: string
  name: string | null
  plan_tier: string
  plan_expires_at: string | null
  is_admin: boolean
}

interface SupportSnapshot {
  identity: {
    id: string
    email: string
    joined_at: string | null
    last_sign_in_at: string | null
  }
  profile: Record<string, unknown>
  strava: {
    connected: boolean
    athlete_id?: number
    athlete_firstname?: string
    athlete_lastname?: string
    scope?: string
    last_sync_at?: string
    token_expires_at?: string
  }
  counts: {
    activities: number
    races: number
    renfo_sessions: number
    coach_feedbacks: number
  }
  activities: Array<Record<string, unknown>>
  races: Array<Record<string, unknown>>
  coach_sessions: Array<Record<string, unknown>>
  renfo: {
    profile: Record<string, unknown> | null
    max_lifts: Array<Record<string, unknown>>
    recent_sessions: Array<Record<string, unknown>>
  }
  projection_validation: Array<Record<string, unknown>>
}

interface AccessLog {
  id: string
  admin_email: string
  target_email: string
  reason: string
  accessed_at: string
}

type PopupKey = 'strava' | 'calibration' | 'one-rm' | 'post-race' | 'share' | 'onboarding' | null

const POPUPS: Array<{ key: Exclude<PopupKey, null> | 'upgrade'; title: string; description: string }> = [
  { key: 'strava', title: 'Autorisation Strava', description: 'Blocage obligatoire si le scope activités manque.' },
  { key: 'upgrade', title: 'Conversion PRO', description: 'Offre PRO chiffrée, sans ouvrir Stripe en mode test.' },
  { key: 'calibration', title: 'Calibrage VMA', description: 'Demi-Cooper, validation et calcul des allures.' },
  { key: 'one-rm', title: 'Test de force 1RM', description: 'Parcours complet, sauvegarde simulée.' },
  { key: 'post-race', title: 'Retour de course', description: 'Activité détectée et accès au débrief.' },
  { key: 'share', title: 'Partage story', description: 'Stickers statistiques, tracé, profil et rendu 3D.' },
  { key: 'onboarding', title: 'Onboarding complet', description: 'Toutes les étapes sans écrire le profil admin.' },
]

const ROUTES = [
  { path: '/', label: 'Dashboard', check: 'KPI, cartes, alertes et dernier entraînement' },
  { path: '/activities', label: 'Activités', check: 'Liste, filtres et ouverture d’une activité' },
  { path: '/coach', label: 'Coach', check: 'Plan, restrictions FREE/PRO et adaptation' },
  { path: '/race', label: 'Courses', check: 'Calendrier, ajout et stratégie GPX' },
  { path: '/renfo/library', label: 'Bibliothèque renfo', check: 'Exercices, médias et prescriptions' },
  { path: '/profile', label: 'Profil athlète', check: 'Runner Matrix, données et calibrages' },
  { path: '/profile/settings', label: 'Réglages', check: 'Strava, abonnement et suppression de compte' },
  { path: '/demo', label: 'Démo publique', check: 'Rendu visiteur sans authentification' },
]

const cardStyle = {
  padding: '16px',
  border: '1px solid var(--vl-line)',
  borderRadius: 12,
  background: 'var(--vl-surf)',
} as const

function fmtDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtNumber(value: unknown, digits = 0): string {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '—'
}

function DataLine({ label, value }: { label: string; value: unknown }) {
  const rendered = value == null || value === ''
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, .8fr) minmax(0, 1.4fr)', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--vl-line)' }}>
      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label.replaceAll('_', ' ')}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)' }}>{rendered}</span>
    </div>
  )
}

function SnapshotView({ snapshot }: { snapshot: SupportSnapshot }) {
  const activities = snapshot.activities ?? []
  const races = snapshot.races ?? []
  const coach = snapshot.coach_sessions ?? []
  const renfoSessions = snapshot.renfo?.recent_sessions ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <div style={cardStyle}>
          <div className="clabel">IDENTITÉ</div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>{snapshot.profile?.name as string || 'Sans nom'}</div>
          <div style={{ marginTop: 3, fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', overflowWrap: 'anywhere' }}>{snapshot.identity.email}</div>
          <div style={{ marginTop: 8, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>Dernière connexion · {fmtDate(snapshot.identity.last_sign_in_at)}</div>
        </div>
        <div style={cardStyle}>
          <div className="clabel">STRAVA</div>
          <div style={{ marginTop: 8, color: snapshot.strava.connected ? 'var(--vl-growth)' : 'var(--vl-ember)', fontWeight: 700 }}>
            {snapshot.strava.connected ? '● Connecté' : '○ Non connecté'}
          </div>
          {snapshot.strava.connected ? (
            <>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--vl-text-2)' }}>{[snapshot.strava.athlete_firstname, snapshot.strava.athlete_lastname].filter(Boolean).join(' ')}</div>
              <div style={{ marginTop: 6, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>Scope · {snapshot.strava.scope || '—'}</div>
              <div style={{ marginTop: 3, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>Sync · {fmtDate(snapshot.strava.last_sync_at)}</div>
            </>
          ) : null}
        </div>
        {Object.entries(snapshot.counts ?? {}).map(([key, value]) => (
          <div key={key} style={cardStyle}>
            <div className="clabel">{key.replaceAll('_', ' ')}</div>
            <div style={{ marginTop: 8, fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--vl-ember)' }}>{value}</div>
          </div>
        ))}
      </div>

      <details open style={cardStyle}>
        <summary style={{ cursor: 'pointer', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>Profil et paramètres réels</summary>
        <div style={{ marginTop: 10 }}>
          {Object.entries(snapshot.profile ?? {}).map(([key, value]) => <DataLine key={key} label={key} value={value} />)}
        </div>
      </details>

      <details open style={cardStyle}>
        <summary style={{ cursor: 'pointer', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>20 dernières activités ({activities.length})</summary>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ color: 'var(--vl-text-3)', textAlign: 'left' }}>
                {['Date', 'Nom', 'Type', 'Distance', 'D+', 'Durée', 'FC moy.'].map((h) => <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--vl-line)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => (
                <tr key={String(activity.id)} style={{ color: 'var(--vl-text-2)' }}>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--vl-line)' }}>{fmtDate(activity.start_date)}</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--vl-line)', color: 'var(--vl-text)' }}>{String(activity.name ?? '—')}</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--vl-line)' }}>{String(activity.sport_type ?? activity.type ?? '—')}</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--vl-line)' }}>{fmtNumber(Number(activity.distance) / 1000, 1)} km</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--vl-line)' }}>{fmtNumber(activity.total_elevation_gain)} m</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--vl-line)' }}>{fmtNumber(Number(activity.moving_time) / 60)} min</td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--vl-line)' }}>{fmtNumber(activity.average_heartrate)} bpm</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!activities.length ? <div style={{ padding: 12, color: 'var(--vl-text-3)' }}>Aucune activité.</div> : null}
        </div>
      </details>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <details open style={cardStyle}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>Courses ({races.length})</summary>
          <div style={{ marginTop: 8 }}>
            {races.map((race) => (
              <div key={String(race.id)} style={{ padding: '8px 0', borderBottom: '1px solid var(--vl-line)' }}>
                <div style={{ fontWeight: 600 }}>{String(race.name ?? 'Course')}</div>
                <div style={{ marginTop: 3, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
                  {fmtDate(race.date)} · {fmtNumber(race.distance, 1)} km · +{fmtNumber(race.elevation)} m · GPX {race.has_gpx ? 'oui' : 'non'}
                </div>
              </div>
            ))}
            {!races.length ? <div style={{ paddingTop: 8, color: 'var(--vl-text-3)' }}>Aucune course.</div> : null}
          </div>
        </details>

        <details open style={cardStyle}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>Retours coach ({coach.length})</summary>
          <div style={{ marginTop: 8 }}>
            {coach.map((session) => (
              <div key={String(session.id)} style={{ padding: '8px 0', borderBottom: '1px solid var(--vl-line)' }}>
                <div style={{ fontWeight: 600 }}>{String(session.verdict ?? 'Séance')}</div>
                <div style={{ marginTop: 3, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
                  {fmtDate(session.created_at)} · RPE {String(session.rpe ?? '—')} · ressenti {String(session.feeling ?? '—')} · douleur {String(session.pain ?? '—')}
                </div>
              </div>
            ))}
            {!coach.length ? <div style={{ paddingTop: 8, color: 'var(--vl-text-3)' }}>Aucun retour de séance.</div> : null}
          </div>
        </details>

        <details open style={cardStyle}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>Renforcement ({renfoSessions.length} récents)</summary>
          <div style={{ marginTop: 8 }}>
            {renfoSessions.map((session) => (
              <div key={String(session.id)} style={{ padding: '8px 0', borderBottom: '1px solid var(--vl-line)' }}>
                <div style={{ fontWeight: 600 }}>{String(session.focus ?? session.day_key ?? 'Renfo')}</div>
                <div style={{ marginTop: 3, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
                  {fmtDate(session.session_date)} · {fmtNumber(session.duration_min)} min · {String(session.source ?? 'manuel')}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
              1RM enregistrés · {snapshot.renfo?.max_lifts?.length ?? 0}
            </div>
          </div>
        </details>

        <details open style={cardStyle}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>Validations moteur ({snapshot.projection_validation?.length ?? 0})</summary>
          <div style={{ marginTop: 8 }}>
            {(snapshot.projection_validation ?? []).map((validation) => (
              <div key={String(validation.id)} style={{ padding: '8px 0', borderBottom: '1px solid var(--vl-line)' }}>
                <div style={{ fontWeight: 600 }}>{String(validation.engine_version ?? 'Moteur')}</div>
                <div style={{ marginTop: 3, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
                  {fmtDate(validation.created_at)} · statut {String(validation.status ?? '—')} · prédiction {fmtNumber(Number(validation.prediction_central_s) / 60)} min
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      <details style={cardStyle}>
        <summary style={{ cursor: 'pointer', fontFamily: 'var(--vl-display)', fontWeight: 700 }}>Instantané JSON assaini</summary>
        <pre style={{ maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '12px 0 0', fontSize: 10, color: 'var(--vl-text-2)' }}>
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </details>
    </div>
  )
}

export default function AdminLabTab({ users }: { users: LabUser[] }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const setViewAs = useVLStore((state) => state.setViewAs)
  const openPreviewModal = useUpgradeModal((state) => state.openPreviewModal)
  const [popup, setPopup] = useState<PopupKey>(null)
  const [stravaMessage, setStravaMessage] = useState<string | null>(null)
  const [targetUserId, setTargetUserId] = useState('')
  const [reason, setReason] = useState('Diagnostic technique et contrôle qualité')
  const [snapshot, setSnapshot] = useState<SupportSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState('')
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)

  const selectedUser = users.find((user) => user.id === targetUserId) ?? null
  const athleteUsers = users.filter((user) => !user.is_admin)

  const shareData = useMemo(() => {
    const distance = Array.from({ length: 60 }, (_, index) => index * 250)
    const altitude = distance.map((_, index) => 380 + Math.sin(index / 6) * 95 + index * 2)
    const latlng = distance.map((_, index) => [
      47.742 + Math.sin(index / 9) * .018,
      7.336 + index * .0015,
    ] as [number, number])
    return { movingTimeS: 6842, distanceM: 15200, dplusM: 740, distance, altitude, latlng }
  }, [])

  const logsQuery = useQuery<AccessLog[]>({
    queryKey: ['admin-data-access-log'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_data_access_log', { limit_n: 30 })
      if (error) throw error
      return (data ?? []) as AccessLog[]
    },
  })

  async function loadSnapshot() {
    if (!targetUserId) {
      setSnapshotError('Choisis un utilisateur.')
      return
    }
    if (reason.trim().length < 8) {
      setSnapshotError('Indique un motif précis d’au moins 8 caractères.')
      return
    }

    setLoadingSnapshot(true)
    setSnapshotError('')
    setSnapshot(null)
    const { data, error } = await supabase.rpc('admin_get_user_support_snapshot', {
      target_user_id: targetUserId,
      access_reason: reason.trim(),
    })
    setLoadingSnapshot(false)
    if (error) {
      setSnapshotError(error.message)
      return
    }
    setSnapshot(data as SupportSnapshot)
    qc.invalidateQueries({ queryKey: ['admin-data-access-log'] })
  }

  function openPopup(key: (typeof POPUPS)[number]['key']) {
    if (key === 'upgrade') {
      openPreviewModal({ vdot: 51, weeksToRace: 12, distanceKm: 21.1, raceName: 'Semi de Colmar · scénario test' })
      return
    }
    setStravaMessage(null)
    setPopup(key)
  }

  function simulatePlan(tier: 'free' | 'pro') {
    setViewAs({
      id: `admin-lab-${tier}`,
      email: `scenario-${tier}@vorcelab.test`,
      name: `Scénario ${tier.toUpperCase()}`,
      plan_tier: tier,
      plan_expires_at: null,
      is_admin: false,
    })
    navigate('/')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{
        ...cardStyle,
        borderColor: 'color-mix(in oklab, var(--vl-ember) 45%, var(--vl-line))',
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--vl-ember) 8%, var(--vl-surf)), var(--vl-surf))',
      }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.25rem', fontWeight: 800 }}>Labo administrateur</div>
        <div style={{ marginTop: 6, maxWidth: 780, color: 'var(--vl-text-2)', fontSize: 12, lineHeight: 1.6 }}>
          Les scénarios visuels utilisent uniquement des données fictives. L’explorateur support affiche des données réelles en lecture seule :
          chaque consultation exige un motif et est enregistrée. Les secrets, tokens et données GPS brutes ne quittent jamais le serveur.
        </div>
      </div>

      <section style={cardStyle}>
        <div className="clabel" style={{ marginBottom: 12 }}>GALERIE DES POPUPS · MODE SANS ÉCRITURE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {POPUPS.map((item) => (
            <button
              key={item.key}
              onClick={() => openPopup(item.key)}
              style={{
                padding: 14, textAlign: 'left', cursor: 'pointer',
                border: '1px solid var(--vl-line)', borderRadius: 10,
                background: 'var(--vl-surf-2)', color: 'var(--vl-text)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 5 }}>{item.title}</div>
              <div style={{ color: 'var(--vl-text-3)', fontSize: 10.5, lineHeight: 1.45 }}>{item.description}</div>
              <div style={{ marginTop: 10, color: 'var(--vl-ember)', fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700 }}>OUVRIR →</div>
            </button>
          ))}
        </div>
      </section>

      <section style={cardStyle}>
        <div className="clabel" style={{ marginBottom: 12 }}>SCÉNARIOS ET PARCOURS</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="hbtn" onClick={() => simulatePlan('free')}>Tester le plan FREE</button>
          <button className="hbtn" onClick={() => simulatePlan('pro')} style={{ borderColor: 'var(--vl-ember)', color: 'var(--vl-ember)' }}>Tester le plan PRO</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {ROUTES.map((route) => (
            <button
              key={route.path}
              onClick={() => window.open(route.path, '_blank', 'noopener,noreferrer')}
              style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', background: 'var(--vl-surf-2)', color: 'var(--vl-text)' }}
            >
              <div style={{ fontWeight: 700 }}>{route.label}</div>
              <div style={{ marginTop: 4, color: 'var(--vl-text-3)', fontSize: 10, lineHeight: 1.45 }}>{route.check}</div>
            </button>
          ))}
        </div>
      </section>

      <section style={cardStyle}>
        <div className="clabel" style={{ marginBottom: 6 }}>DONNÉES RÉELLES · SUPPORT EN LECTURE SEULE</div>
        <div style={{ color: 'var(--vl-text-3)', fontSize: 10.5, lineHeight: 1.5, marginBottom: 12 }}>
          Ouvre uniquement un dossier nécessaire au support ou au contrôle qualité. L’utilisateur conserve son mot de passe et sa session ; aucune impersonation Auth n’est réalisée.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(280px, 2fr) auto', gap: 8, alignItems: 'end' }}>
          <label style={{ fontSize: 10, color: 'var(--vl-text-3)' }}>
            Utilisateur
            <select className="fi" value={targetUserId} onChange={(event) => { setTargetUserId(event.target.value); setSnapshot(null) }} style={{ marginTop: 4 }}>
              <option value="">Choisir…</option>
              {athleteUsers.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email} · {user.email}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 10, color: 'var(--vl-text-3)' }}>
            Motif journalisé
            <input className="fi" value={reason} maxLength={240} onChange={(event) => setReason(event.target.value)} style={{ marginTop: 4 }} />
          </label>
          <button
            className="hbtn"
            onClick={loadSnapshot}
            disabled={loadingSnapshot || !selectedUser}
            style={{ minHeight: 38, borderColor: 'var(--vl-ember)', color: 'var(--vl-ember)' }}
          >
            {loadingSnapshot ? 'Chargement…' : 'Ouvrir le dossier'}
          </button>
        </div>
        {snapshotError ? <div role="alert" style={{ marginTop: 10, color: 'var(--vl-ember)', fontSize: 11 }}>{snapshotError}</div> : null}
        {snapshot ? <SnapshotView snapshot={snapshot} /> : null}
      </section>

      <section style={cardStyle}>
        <div className="clabel" style={{ marginBottom: 10 }}>JOURNAL DES CONSULTATIONS</div>
        {logsQuery.isLoading ? <div style={{ color: 'var(--vl-text-3)', fontSize: 10 }}>Chargement…</div> : null}
        {logsQuery.isError ? <div style={{ color: 'var(--vl-ember)', fontSize: 10 }}>Journal indisponible tant que la migration n’est pas déployée.</div> : null}
        {(logsQuery.data ?? []).map((log) => (
          <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '150px minmax(150px, 1fr) minmax(200px, 2fr)', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--vl-line)', fontFamily: 'var(--vl-mono)', fontSize: 9.5 }}>
            <span style={{ color: 'var(--vl-text-3)' }}>{fmtDate(log.accessed_at)}</span>
            <span style={{ color: 'var(--vl-text-2)', overflowWrap: 'anywhere' }}>{log.admin_email} → {log.target_email}</span>
            <span style={{ color: 'var(--vl-text-3)' }}>{log.reason}</span>
          </div>
        ))}
        {!logsQuery.isLoading && !logsQuery.isError && !logsQuery.data?.length ? <div style={{ color: 'var(--vl-text-3)', fontSize: 10 }}>Aucune consultation enregistrée.</div> : null}
      </section>

      {popup === 'strava' ? (
        <StravaActivityPermissionModal
          previewMode
          error={stravaMessage}
          onPreviewClose={() => setPopup(null)}
          onAuthorize={() => setStravaMessage('Simulation réussie : en production, ce bouton ouvre l’autorisation Strava forcée.')}
        />
      ) : null}
      {popup === 'calibration' ? (
        <CalibrationPopup show saving={false} onSave={() => setPopup(null)} onSkip={() => setPopup(null)} />
      ) : null}
      {popup === 'one-rm' ? (
        <OneRMTestPopup open previewMode onClose={() => setPopup(null)} />
      ) : null}
      {popup === 'post-race' ? (
        <PostRaceModal
          prompt={{
            race: { id: 'lab-race', name: 'Trail du Grand Ballon', date: new Date().toISOString().slice(0, 10), distance: 21.4, start_time: '09:00' },
            suggestion: { id: 'lab-activity', name: 'Trail du Grand Ballon', distance: 21480, start_date: new Date().toISOString(), moving_time: 7820 },
          }}
          onLink={() => setPopup(null)}
          onOpenRace={() => setPopup(null)}
          onDismiss={() => setPopup(null)}
        />
      ) : null}
      {popup === 'share' ? <ShareStickers data={shareData} onClose={() => setPopup(null)} /> : null}
      {popup === 'onboarding' ? <Onboarding previewMode onDone={() => setPopup(null)} /> : null}
    </div>
  )
}
