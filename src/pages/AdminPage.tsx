import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { usePlanTier } from '../lib/usePlanTier'
import { useVLStore } from '../store/vlStore'
import { useUpgradeModal } from '../lib/useUpgradeModal'

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
              {showHistory ? '▴ Masquer historique' : '▾ Voir historique'}
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
        </>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const { isAdmin, isLoading: tierLoading } = usePlanTier()
  const [search, setSearch] = useState('')
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
            onClick={() => openModal({ vdot: 52, weeksToRace: 14, distanceKm: 42, raceName: 'Aperçu modal PRO' })}
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
    </div>
  )
}
