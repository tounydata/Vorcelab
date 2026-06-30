import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { usePlanTier } from '../lib/usePlanTier'
import { useVLStore } from '../store/vlStore'
import { useUpgradeModal } from '../lib/useUpgradeModal'
import StatsTab from '../components/admin/StatsTab'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  name: string | null
  plan_tier: string
  plan_expires_at: string | null
  plan_note: string | null
  is_admin: boolean
  joined_at: string
  last_seen: string | null
}

interface Grant {
  id: string
  plan_tier: string
  expires_at: string | null
  note: string | null
  granted_at: string
  revoked_at: string | null
  granted_by_email: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function tierBadge(tier: string, expires: string | null) {
  const expired = expires && new Date(expires) < new Date()
  if (tier === 'pro' && !expired) {
    return (
      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
        color: 'var(--vl-ember)', background: 'color-mix(in oklab, var(--vl-ember) 12%, transparent)',
        border: '1px solid var(--vl-ember)', borderRadius: 999, padding: '2px 8px' }}>
        ✦ PRO{expires ? ` · exp. ${fmtDate(expires)}` : ' · permanent'}
      </span>
    )
  }
  if (tier === 'pro' && expired) {
    return (
      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
        color: 'var(--vl-text-3)', background: 'var(--vl-surf-2)',
        border: '1px solid var(--vl-line)', borderRadius: 999, padding: '2px 8px' }}>
        PRO expiré
      </span>
    )
  }
  return (
    <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)',
      background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)',
      borderRadius: 999, padding: '2px 8px' }}>
      FREE
    </span>
  )
}

// ─── Panneau d'actions pour un utilisateur ────────────────────────────────────

function UserActions({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const [note, setNote] = useState(user.plan_note ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function grant(months: number | null) {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('admin_grant_pro', {
      target_user_id: user.id,
      months,
      note_text: note || null,
    })
    setBusy(false)
    if (error) setMsg('Erreur : ' + error.message)
    else { setMsg('✓ Accordé'); setTimeout(onDone, 800) }
  }

  async function revoke() {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('admin_revoke_pro', { target_user_id: user.id })
    setBusy(false)
    if (error) setMsg('Erreur : ' + error.message)
    else { setMsg('✓ Révoqué'); setTimeout(onDone, 800) }
  }

  async function resetPassword() {
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin + '/#/profile/settings',
    })
    setBusy(false)
    if (error) setMsg('Erreur : ' + error.message)
    else setMsg('✓ Email de reset envoyé')
  }

  const btn = (label: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      onClick={onClick}
      disabled={busy}
      style={{
        background: danger ? 'color-mix(in oklab, var(--vl-ember) 12%, transparent)' : 'var(--vl-surf-2)',
        border: `1px solid ${danger ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
        color: danger ? 'var(--vl-ember)' : 'var(--vl-text)',
        borderRadius: 8, padding: '7px 12px', cursor: busy ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--vl-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
        opacity: busy ? 0.5 : 1,
      }}
    >{label}</button>
  )

  return (
    <div style={{ padding: '14px 16px', background: 'var(--vl-surf-2)', borderTop: '1px solid var(--vl-line)' }}>
      <div style={{ marginBottom: 10 }}>
        <input
          className="fi"
          placeholder="Note (ex: testeur, influenceur, cadeau…)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ fontSize: 12 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {btn('+ 1 mois', () => grant(1))}
        {btn('+ 3 mois', () => grant(3))}
        {btn('+ 6 mois', () => grant(6))}
        {btn('PRO permanent', () => grant(null))}
        {user.plan_tier === 'pro' && btn('Révoquer → FREE', revoke, true)}
        {btn('📧 Reset mdp', resetPassword)}
      </div>
      {msg && (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: msg.startsWith('✓') ? 'var(--vl-growth)' : 'var(--vl-ember)', marginTop: 8 }}>
          {msg}
        </div>
      )}
    </div>
  )
}

// ─── Helpers événements ───────────────────────────────────────────────────────

interface ActivityEvent {
  event_id: string
  user_id?: string
  user_email?: string
  user_name?: string | null
  event: string
  meta: Record<string, unknown>
  created_at: string
}

const EVENT_LABELS: Record<string, string> = {
  session_start:     '🟢 Ouverture app',
  coach_viewed:      '🗓 Coach consulté',
  race_created:      '🏁 Course créée',
  strategy_viewed:   '🗺 Stratégie vue',
  activities_viewed: '📊 Activités vues',
  strava_connected:  '🔗 Strava connecté',
  gpx_uploaded:      '📍 GPX uploadé',
  plan_upgraded:     '✦ Passé PRO',
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
}

function EventLine({ ev, showUser = false }: { ev: ActivityEvent; showUser?: boolean }) {
  const label = EVENT_LABELS[ev.event] ?? ev.event
  const raceName = ev.meta?.name as string | undefined
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--vl-line)' }}>
      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', flexShrink: 0, minWidth: 160 }}>{label}{raceName ? ` — ${raceName}` : ''}</span>
      {showUser && (
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.user_name ?? ev.user_email}
        </span>
      )}
      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', flexShrink: 0, marginLeft: 'auto' }}>{fmtRelative(ev.created_at)}</span>
    </div>
  )
}

// ─── Feed global d'activité ───────────────────────────────────────────────────

function ActivityFeed() {
  const { data: events = [], isLoading } = useQuery<ActivityEvent[]>({
    queryKey: ['admin-activity-feed'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_activity_feed', { limit_n: 60 })
      if (error) return []
      return data as ActivityEvent[]
    },
  })

  if (isLoading) return <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', padding: '8px 0' }}>Chargement…</div>
  if (!events.length) return <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', padding: '8px 0' }}>Aucun événement pour l'instant</div>

  return (
    <div>
      {events.map((ev) => <EventLine key={ev.event_id} ev={ev} showUser />)}
    </div>
  )
}

// ─── Activité d'un utilisateur spécifique ────────────────────────────────────

function UserActivity({ userId }: { userId: string }) {
  const { data: events = [], isLoading } = useQuery<ActivityEvent[]>({
    queryKey: ['admin-user-activity', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_user_activity', { target_user_id: userId, limit_n: 20 })
      if (error) return []
      return data as ActivityEvent[]
    },
  })

  if (isLoading) return <div style={{ padding: '8px 16px', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>Chargement…</div>
  if (!events.length) return <div style={{ padding: '8px 16px', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>Aucune activité enregistrée</div>

  return (
    <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--vl-line)' }}>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--vl-text-3)', marginBottom: 6 }}>ACTIVITÉ RÉCENTE</div>
      {events.map((ev) => <EventLine key={ev.event_id} ev={ev} />)}
    </div>
  )
}

// ─── Historique des grants pour un utilisateur ───────────────────────────────

function GrantHistory({ userId }: { userId: string }) {
  const { data: grants = [], isLoading } = useQuery<Grant[]>({
    queryKey: ['admin-grants', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_grants', { target_user_id: userId })
      if (error) return []
      return data as Grant[]
    },
  })

  if (isLoading) return <div style={{ padding: '8px 16px', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>Chargement…</div>
  if (!grants.length) return <div style={{ padding: '8px 16px', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>Aucun historique</div>

  return (
    <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--vl-line)' }}>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--vl-text-3)', marginBottom: 6 }}>HISTORIQUE</div>
      {grants.map((g) => (
        <div key={g.id} style={{ fontSize: 11, color: g.revoked_at ? 'var(--vl-text-3)' : 'var(--vl-text-2)', marginBottom: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ textDecoration: g.revoked_at ? 'line-through' : 'none' }}>
            {fmtDateTime(g.granted_at)}
          </span>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: g.revoked_at ? 'var(--vl-text-3)' : 'var(--vl-ember)' }}>
            {g.expires_at ? `exp. ${fmtDate(g.expires_at)}` : 'permanent'}
          </span>
          {g.note && <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>{g.note}</span>}
          {g.revoked_at && <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)' }}>révoqué {fmtDate(g.revoked_at)}</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Ligne utilisateur ────────────────────────────────────────────────────────

function UserRow({ user }: { user: AdminUser }) {
  const [expanded, setExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const qc = useQueryClient()
  const setViewAs = useVLStore((s) => s.setViewAs)
  const viewAs = useVLStore((s) => s.viewAs)
  const navigate = useNavigate()

  function handleViewAs() {
    setViewAs({
      id: user.id,
      email: user.email,
      name: user.name,
      plan_tier: user.plan_tier,
      plan_expires_at: user.plan_expires_at,
      is_admin: user.is_admin,
    })
    navigate('/')
  }

  return (
    <div style={{ border: '1px solid var(--vl-line)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      {/* En-tête de la ligne */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: expanded ? 'var(--vl-surf-2)' : 'var(--vl-surf)' }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar initiales */}
        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--vl-ember)', fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: 14, color: 'var(--vl-ink)', letterSpacing: '.02em' }}>
          {(user.name?.[0] ?? user.email[0]).toUpperCase()}
        </div>

        {/* Identité */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--vl-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {user.name ?? '—'}
            {user.is_admin && (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, letterSpacing: '.08em', color: 'var(--vl-text-3)', background: 'var(--vl-line)', borderRadius: 4, padding: '1px 5px' }}>ADMIN</span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </div>
        </div>

        {/* Statut + dates */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          {tierBadge(user.plan_tier, user.plan_expires_at)}
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
            Inscrit {fmtDate(user.joined_at)}
          </span>
        </div>

        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', transition: 'transform .15s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>

      {/* Actions (expanded) */}
      {expanded && (
        <>
          <UserActions user={user} onDone={() => { setExpanded(false); qc.invalidateQueries({ queryKey: ['admin-users'] }) }} />
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowHistory((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', padding: 0 }}
            >
              {showHistory ? '▴ Masquer grants' : '▾ Voir grants'}
            </button>
            <button
              onClick={() => setShowActivity((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', padding: 0 }}
            >
              {showActivity ? '▴ Masquer activité' : '▾ Voir activité'}
            </button>
            <button
              onClick={handleViewAs}
              style={{
                background: viewAs?.id === user.id
                  ? 'color-mix(in oklab, var(--vl-ember) 15%, transparent)'
                  : 'var(--vl-surf-2)',
                border: `1px solid ${viewAs?.id === user.id ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                color: viewAs?.id === user.id ? 'var(--vl-ember)' : 'var(--vl-text-2)',
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 600,
              }}
            >
              👁 Vue en tant que
            </button>
          </div>
          {showHistory && <GrantHistory userId={user.id} />}
          {showActivity && <UserActivity userId={user.id} />}
        </>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type AdminTab = 'users' | 'stats'

export default function AdminPage() {
  const { isAdmin, isLoading: tierLoading } = usePlanTier()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<AdminTab>('users')
  const qc = useQueryClient()
  const { openModal } = useUpgradeModal()

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_users')
      if (error) throw error
      return data as AdminUser[]
    },
  })

  const grantMut = useMutation({
    mutationFn: async ({ userId, months, note }: { userId: string; months: number | null; note?: string }) => {
      const { error } = await supabase.rpc('admin_grant_pro', {
        target_user_id: userId,
        months,
        note_text: note ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  if (tierLoading) return null
  if (!isAdmin) return <Navigate to="/" replace />

  const filtered = users.filter(
    (u) => u.email.includes(search) || (u.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const proCount = users.filter((u) => u.plan_tier === 'pro' && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date())).length

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 700 }}>Admin</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>
            {users.length} utilisateur{users.length > 1 ? 's' : ''} · <span style={{ color: 'var(--vl-ember)' }}>{proCount} PRO actif{proCount > 1 ? 's' : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.12em', color: 'var(--vl-ember)', background: 'color-mix(in oklab, var(--vl-ember) 10%, transparent)', border: '1px solid var(--vl-ember)', borderRadius: 999, padding: '3px 10px' }}>
            ✦ ADMIN
          </span>
          <button
            onClick={() => openModal()}
            style={{
              fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
              color: 'var(--vl-text-2)', background: 'var(--vl-surf-2)',
              border: '1px solid var(--vl-line)', borderRadius: 999, padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            👁 Prévisualiser modal PRO
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem' }}>
        {([['users', 'Utilisateurs'], ['stats', 'Statistiques']] as [AdminTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              fontFamily: 'var(--vl-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
              padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
              background: tab === key ? 'var(--vl-ember)' : 'var(--vl-surf-2)',
              color: tab === key ? 'var(--vl-ink)' : 'var(--vl-text-2)',
              border: `1px solid ${tab === key ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
              transition: 'all 0.15s',
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'stats' && <StatsTab />}

      {tab === 'users' && <>
      {/* Accès rapide : passer tous les utilisateurs en test */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '14px 16px' }}>
        <div className="clabel" style={{ marginBottom: 8 }}>ACCÈS RAPIDE — TEST GLOBAL</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {users.filter((u) => !u.is_admin).map((u) => (
            <button
              key={u.id}
              onClick={() => grantMut.mutate({ userId: u.id, months: 1, note: 'test' })}
              style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, padding: '5px 10px', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 6, cursor: 'pointer', color: 'var(--vl-text-2)' }}
            >
              {u.name ?? u.email.split('@')[0]} +1m
            </button>
          ))}
        </div>
      </div>

      {/* Feed d'activité global */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '14px 16px' }}>
        <div className="clabel" style={{ marginBottom: 10 }}>ACTIVITÉ RÉCENTE — TOUS LES USERS</div>
        <ActivityFeed />
      </div>

      {/* Recherche */}
      <input
        className="fi"
        placeholder="Rechercher par email ou nom…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '1rem' }}
      />

      {/* Liste */}
      {isLoading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', textAlign: 'center', padding: '2rem' }}>Aucun résultat</div>
      ) : (
        filtered.map((u) => <UserRow key={u.id} user={u} />)
      )}
      </>}
    </div>
  )
}
