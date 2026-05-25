import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="onboard">
      <div className="onboard-title">404</div>
      <div className="onboard-sub">Cette page n&apos;existe pas.</div>
      <Link to="/" className="mlabel" style={{ color: 'var(--vl-ember)', textDecoration: 'none' }}>
        ← Dashboard
      </Link>
    </div>
  )
}
