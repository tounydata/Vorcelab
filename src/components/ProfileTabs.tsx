import { NavLink } from 'react-router'
import type { CSSProperties } from 'react'

// Bandeau d'onglets partagé entre /profile (qui je suis) et /profile/settings
// (comment l'app est réglée). Style sobre : mono, uppercase, pills.

const tabStyle = (active: boolean): CSSProperties => ({
  display: 'inline-block',
  textDecoration: 'none',
  padding: '6px 14px',
  borderRadius: 'var(--vl-r-sm)',
  fontFamily: 'var(--vl-mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: active ? 'var(--vl-ink)' : 'var(--vl-text-2)',
  background: active ? 'var(--vl-ember)' : 'var(--vl-surf-2)',
})

export default function ProfileTabs() {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
      <NavLink to="/profile" end style={({ isActive }) => tabStyle(isActive)}>
        PROFIL
      </NavLink>
      <NavLink to="/profile/settings" data-tour="profile-settings" style={({ isActive }) => tabStyle(isActive)}>
        RÉGLAGES
      </NavLink>
    </div>
  )
}
