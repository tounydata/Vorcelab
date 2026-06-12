// État d'erreur réseau explicite + bouton réessayer — fini le « Erreur » sec
// ou le spinner qui tourne dans le vide quand une requête a échoué.

export default function LoadError({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="loading" role="alert">
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-2)', textAlign: 'center', lineHeight: 1.6 }}>
        {message ?? 'Impossible de charger les données — vérifie ta connexion.'}
      </div>
      <button className="hbtn" onClick={onRetry}>↻ Réessayer</button>
    </div>
  )
}
