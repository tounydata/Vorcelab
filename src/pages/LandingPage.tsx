import { Link } from 'react-router'

// Landing publique — affichée à la racine pour les visiteurs sans session.
// C'est la seule URL indexable (HashRouter) : elle porte le pitch, la démo,
// le pricing et les liens légaux.

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
    title: 'Stratégie de course sur ton GPX',
    sub: 'Importe la trace de ta course : allures par pente, temps de passage, ravitos, plan de nutrition et météo — ton plan du jour J, prêt à imprimer dans ta tête.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: 'Un coach qui s\'adapte',
    sub: 'Un plan construit vers ta course cible, qui se recale sur ce que tu as vraiment couru — séance ratée, fatigue, blessure : le plan bouge avec toi.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
    title: 'Profil de coureur par gradient',
    sub: 'Tes activités Strava analysées pente par pente : VAM, dérive cardiaque, coefficients montée/descente — tu sais exactement où tu gagnes du temps.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 5v14M18 5v14M6 12h12" /><rect x="3" y="8" width="3" height="8" rx="1" /><rect x="18" y="8" width="3" height="8" rx="1" />
      </svg>
    ),
    title: 'Renfo co-périodisé',
    sub: 'Le renforcement musculaire est planifié avec la course, pas à côté : jamais de squat lourd la veille d\'une séance de côtes.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: 'Charge et forme',
    sub: 'Suivi PMC / ACWR de ta charge d\'entraînement : tu vois la fatigue arriver avant qu\'elle ne te voie.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Tes données restent les tiennes',
    sub: 'Analyses 100 % locales et déterministes : aucune IA externe ne voit tes activités. Pas de pub, pas de revente, suppression en un clic.',
  },
]

const STEPS = [
  { n: '01', title: 'Connecte Strava', sub: 'Tes activités construisent ton profil de coureur en quelques minutes.' },
  { n: '02', title: 'Ajoute ta course', sub: 'Date + GPX : le coach construit le plan, la stratégie du jour J se calcule.' },
  { n: '03', title: 'Suis le labo', sub: 'Séance du jour, charge, renfo, allures de course : tout converge vers ta ligne de départ.' },
]

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--vl-bg)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.25rem 1.25rem 4rem' }}>

        {/* ── Header ── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(3rem, 8vw, 5.5rem)' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.2rem', letterSpacing: '0.1em', color: 'var(--vl-ember)', fontWeight: 800 }}>
            VORCELAB
          </div>
          <Link to="/login"><button className="hbtn">Se connecter</button></Link>
        </header>

        {/* ── Hero ── */}
        <section style={{ textAlign: 'center', marginBottom: 'clamp(3.5rem, 9vw, 6rem)' }}>
          <div className="mlabel" style={{ color: 'var(--vl-ember)', marginBottom: 14 }}>Le laboratoire du coureur</div>
          <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(2.4rem, 7vw, 4.2rem)', fontWeight: 900, lineHeight: 1.0, margin: '0 0 18px', letterSpacing: '.01em' }}>
            Ta course. Ta stratégie.<br />Ton plan.
          </h1>
          <p style={{ maxWidth: 560, margin: '0 auto 28px', fontSize: 15, lineHeight: 1.7, color: 'var(--vl-text-2)' }}>
            Vorcelab transforme tes données en plan d'action : un coach d'entraînement qui
            s'adapte à ce que tu cours vraiment, et une stratégie chiffrée pour le jour J —
            allures, ravitos, nutrition, pente par pente.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '13px 28px' }}>CRÉER MON COMPTE →</button>
            </Link>
            <Link to="/demo" style={{ textDecoration: 'none' }}>
              <button className="hbtn" style={{ height: 46, padding: '0 22px', fontSize: 12 }}>Voir une stratégie démo</button>
            </Link>
          </div>
          <div className="mlabel" style={{ marginTop: 14 }}>Gratuit pour commencer · sans carte bancaire</div>
        </section>

        {/* ── Features ── */}
        <section style={{ marginBottom: 'clamp(3.5rem, 9vw, 6rem)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--vl-ember)', flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--vl-text)', marginBottom: 6 }}>{f.title}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--vl-text-3)' }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Comment ça marche ── */}
        <section style={{ marginBottom: 'clamp(3.5rem, 9vw, 6rem)' }}>
          <div className="clabel" style={{ textAlign: 'center' }}>Comment ça marche</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 12 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ padding: '1rem 1.1rem', borderLeft: '2px solid var(--vl-ember)' }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-ember)', fontWeight: 700, marginBottom: 8 }}>{s.n}</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.05rem', fontWeight: 800, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--vl-text-3)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ── */}
        <section style={{ marginBottom: 'clamp(3.5rem, 9vw, 6rem)' }}>
          <div className="clabel" style={{ textAlign: 'center' }}>Tarifs</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 12, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
            <div className="card">
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, marginBottom: 4 }}>Libre</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', marginBottom: 14 }}>0 € — pour toujours</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--vl-text-2)' }}>
                <li>Profil de coureur + analyses Strava</li>
                <li>1 stratégie de course GPX</li>
                <li>Plan coach — 2 premières semaines</li>
                <li>Suivi de charge et renfo</li>
              </ul>
            </div>
            <div className="card" style={{ borderColor: 'var(--vl-ember)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, marginBottom: 4 }}>PRO</div>
                <div className="mlabel" style={{ color: 'var(--vl-ember)' }}>✦</div>
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', marginBottom: 14 }}>abonnement mensuel ou annuel</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--vl-text-2)' }}>
                <li>Stratégies GPX illimitées</li>
                <li>Plan coach complet jusqu'au jour J</li>
                <li>Analyses avancées (prévu/réel, durabilité)</li>
                <li>Nouveautés en avant-première</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── CTA final ── */}
        <section style={{ textAlign: 'center', marginBottom: 'clamp(3rem, 8vw, 5rem)' }}>
          <h2 style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(1.6rem, 4.5vw, 2.4rem)', fontWeight: 900, lineHeight: 1.05, margin: '0 0 18px' }}>
            Ta prochaine course mérite<br />mieux qu'une allure au doigt mouillé.
          </h2>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ width: 'auto', padding: '13px 28px', margin: '0 auto' }}>COMMENCER GRATUITEMENT →</button>
          </Link>
        </section>

        {/* ── Footer ── */}
        <footer style={{ borderTop: '1px solid var(--vl-line)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="mlabel">© 2026 Vorcelab</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Link to="/legal/cgu" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>CGU / CGV</Link>
            <Link to="/legal/confidentialite" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Confidentialité</Link>
            <a href="mailto:hello@vorcelab.com" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Contact</a>
          </div>
        </footer>
      </div>
    </div>
  )
}
