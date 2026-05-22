import { Link, useLocation } from 'react-router'

const PAGE_LABELS: Record<string, string> = {
  '/race': 'Race Strategy',
  '/renfo': 'Renforcement Musculaire',
  '/profile': 'Profil',
}

export function ComingSoonPage() {
  const { pathname } = useLocation()
  const label = PAGE_LABELS[pathname] ?? pathname.slice(1)

  return (
    <div style={{ maxWidth: 480, paddingTop: 40 }}>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.04em', marginBottom: 16 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', color: 'var(--vl-text-3)', lineHeight: 1.7, marginBottom: 24 }}>
        Cette page est en cours de migration React.<br />
        Les algorithmes sont déjà prêts — c'est juste de l'UI.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link
          to="/"
          style={{ fontFamily: 'var(--vl-mono)', fontSize: '.65rem', color: 'var(--vl-ember)', textDecoration: 'none' }}
        >
          ← Dashboard
        </Link>
      </div>
    </div>
  )
}
