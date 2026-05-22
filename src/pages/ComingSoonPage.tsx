import { Link, useLocation } from 'react-router'

const PAGE_LABELS: Record<string, string> = {
  '/race': 'Race Strategy',
  '/renfo': 'Renforcement musculaire',
}

const LEGACY_HASHES: Record<string, string> = {
  '/race': 'strategie',
  '/renfo': 'renfo',
}

export function ComingSoonPage() {
  const { pathname } = useLocation()
  const label = PAGE_LABELS[pathname] ?? pathname.slice(1)
  const legacyHash = LEGACY_HASHES[pathname]
  const legacyUrl = legacyHash
    ? `${window.location.origin}/Vorcelab/#${legacyHash}`
    : `${window.location.origin}/Vorcelab/`

  return (
    <div style={{ maxWidth: 480, paddingTop: 40 }}>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.04em', marginBottom: 16 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', color: 'var(--vl-text-3)', lineHeight: 1.7, marginBottom: 24 }}>
        Cette section est disponible dans l'application principale.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <a
          href={legacyUrl}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--vl-mono)', fontSize: '.7rem', fontWeight: 700,
            background: 'var(--vl-ember)', color: '#fff',
            padding: '10px 16px', borderRadius: 6, textDecoration: 'none',
            letterSpacing: '.04em',
          }}
        >
          Ouvrir {label} →
        </a>
        <Link
          to="/"
          style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', textDecoration: 'none', marginTop: 4 }}
        >
          ← Dashboard
        </Link>
      </div>
    </div>
  )
}
