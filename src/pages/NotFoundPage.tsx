import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '4rem', fontWeight: 900, color: 'var(--vl-text-3)' }}>404</div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)' }}>Page introuvable</div>
      <Link to="/" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', color: 'var(--vl-ember)', textDecoration: 'none' }}>
        ← Dashboard
      </Link>
    </div>
  )
}
