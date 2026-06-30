import { Link } from 'react-router'

const PRO_PERKS = [
  { icon: '🗺', label: 'Stratégies GPX illimitées', sub: 'Toutes tes courses, chaque édition' },
  { icon: '🤖', label: 'Plan coach complet', sub: 'Toutes les semaines, pas seulement la première' },
  { icon: '📊', label: 'Analyse avancée', sub: 'Comparaison prévu/réel, VDOT auto-calibré' },
  { icon: '⚡', label: 'Accès prioritaire', sub: 'Nouvelles fonctionnalités en avant-première' },
]

interface ProGateProps {
  feature?: string
}

export default function ProGate({ feature = 'cette fonctionnalité' }: ProGateProps) {
  return (
    <div style={{ padding: '2rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'color-mix(in srgb, var(--vl-ember) 12%, transparent)',
        border: '1px solid var(--vl-ember)', borderRadius: 20,
        padding: '4px 14px', marginBottom: 20,
        fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
        color: 'var(--vl-ember)',
      }}>
        ✦ PRO
      </div>

      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.1, marginBottom: 10 }}>
        Passe à PRO pour débloquer<br />{feature}
      </div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', marginBottom: 28, maxWidth: 340 }}>
        Tu as utilisé ta stratégie GPX gratuite. Passe à PRO pour analyser toutes tes courses.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, width: '100%', maxWidth: 520, marginBottom: 28 }}>
        {PRO_PERKS.map((p) => (
          <div key={p.label} className="card" style={{ padding: '12px 14px', marginBottom: 0, textAlign: 'left', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{p.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--vl-text)', marginBottom: 2 }}>{p.label}</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>{p.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <Link
        to="/settings"
        className="btn-primary"
        style={{ textDecoration: 'none', display: 'inline-block', padding: '12px 28px', fontSize: '1rem', fontFamily: 'var(--vl-display)', fontWeight: 800, letterSpacing: '.04em' }}
      >
        PASSER À PRO →
      </Link>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 12 }}>
        Ta stratégie GPX existante reste toujours accessible.
      </div>
    </div>
  )
}
