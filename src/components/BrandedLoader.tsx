// Splash de chargement Vorcelab : le tracé du logo se dessine en boucle.
// Remplace les spinners pleine page — un chargement doit ressembler à la marque.

export default function BrandedLoader({ label }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-label={label ?? 'Chargement'}>
      <svg width="58" height="58" viewBox="0 0 60 60" fill="none" aria-hidden="true" style={{ color: 'var(--vl-text)' }}>
        <line x1="3" y1="50" x2="57" y2="50" stroke="currentColor" strokeWidth="1.2" opacity="0.25" />
        <path
          className="vl-splash-path"
          d="M3 44 L14 36 L22 40 L30 12 L38 30 L46 24 L57 32"
          stroke="var(--vl-ember)" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="square" fill="none"
        />
        <circle className="vl-splash-dot" cx="30" cy="12" r="3.5" fill="#E5562A" />
      </svg>
      <div className="vl-splash-name">VORCELAB</div>
      {label && <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)' }}>{label}</span>}
    </div>
  )
}
