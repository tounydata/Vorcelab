import { useEffect } from 'react'
import { TargetIcon } from './coach/CoachIcons'

/**
 * Splash animé affiché brièvement quand le verdict d'une séance va influencer
 * les prochaines séances. Communique la boucle d'adaptation (prévu → réalisé →
 * ajustement) de façon non anxiogène. Auto-fermeture après `durationMs`.
 */
export default function SessionAdaptationSplash({
  message = 'C\'est noté — j\'en tiendrai compte pour tes prochaines séances.',
  durationMs = 2600,
  onDone,
}: {
  message?: string
  durationMs?: number
  onDone: () => void
}) {
  useEffect(() => {
    const id = setTimeout(onDone, durationMs)
    return () => clearTimeout(id)
  }, [durationMs, onDone])

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18, background: 'rgba(8,10,14,.82)', backdropFilter: 'blur(3px)',
        animation: 'vlSplashIn .25s ease-out',
      }}
    >
      <style>{`
        @keyframes vlSplashIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vlSplashRing { 0% { transform: scale(.6); opacity: .2 } 60% { opacity: 1 } 100% { transform: scale(1.25); opacity: 0 } }
        @keyframes vlSplashPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.12) } }
      `}</style>
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid var(--vl-ember)', animation: 'vlSplashRing 1.3s ease-out infinite',
        }} />
        <span style={{
          position: 'absolute', inset: 14, borderRadius: '50%',
          background: 'var(--vl-ember)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', animation: 'vlSplashPulse 1.3s ease-in-out infinite',
        }}><TargetIcon size={26} color="#fff" /></span>
      </div>
      <div style={{
        maxWidth: 280, textAlign: 'center', color: 'var(--vl-text)',
        fontSize: 14, lineHeight: 1.5, padding: '0 24px',
      }}>
        {message}
      </div>
    </div>
  )
}
