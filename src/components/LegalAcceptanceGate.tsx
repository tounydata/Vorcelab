import { useState } from 'react'
import { Link } from 'react-router'
import { useLegalAcceptance } from '../lib/useLegalAcceptance'

// Portail de consentement versionné : bloque l'accès tant que l'utilisateur n'a
// pas accepté la version courante des CGU et de la politique de confidentialité.
// N'est ACTIF que lorsque les mentions légales sont complètes (LEGAL_INFO_COMPLETE) :
// tant que ce n'est pas le cas, `needsConsent` reste false → ce composant ne rend
// rien et ne gêne pas le développement. Au changement de version, l'utilisateur
// doit ré-accepter.
export default function LegalAcceptanceGate() {
  const { needsConsent, accept } = useLegalAcceptance()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!needsConsent) return null

  async function handleAccept() {
    setBusy(true)
    setError(null)
    try {
      await accept({ surface: 'web_gate', at: new Date().toISOString() })
    } catch {
      setError('Enregistrement impossible. Vérifie ta connexion et réessaie.')
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        maxWidth: 460, width: '100%', background: 'var(--vl-surf)',
        border: '1px solid var(--vl-line)', borderRadius: 18, padding: '32px 28px',
      }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--vl-text)', marginBottom: 14 }}>
          Mise à jour de nos conditions
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--vl-text-3)', marginBottom: 20 }}>
          Pour continuer, merci d'accepter la dernière version de nos{' '}
          <Link to="/legal/cgu" style={{ color: 'var(--vl-ember)' }}>conditions générales</Link>{' '}
          et de notre{' '}
          <Link to="/legal/confidentialite" style={{ color: 'var(--vl-ember)' }}>politique de confidentialité</Link>.
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 20 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--vl-text)' }}>
            J'ai lu et j'accepte les conditions générales d'utilisation et de vente ainsi que la politique de confidentialité.
          </span>
        </label>

        {error && (
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-danger, #e5484d)', marginBottom: 14 }}>{error}</div>
        )}

        <button
          onClick={handleAccept}
          disabled={!checked || busy}
          style={{
            width: '100%', padding: 14, borderRadius: 12, border: 'none',
            background: checked && !busy ? 'var(--vl-ember)' : 'var(--vl-line)',
            color: checked && !busy ? 'var(--vl-ink)' : 'var(--vl-text-3)',
            fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '1rem',
            cursor: checked && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Enregistrement…' : 'Accepter et continuer'}
        </button>
      </div>
    </div>
  )
}
