import { useState, useEffect } from 'react'
// @ts-ignore — renfoData est en JS sans types
import { getExerciseGifUrl, RENFO_FOCUS_COLORS as _COLORS } from '../lib/renfoData'
import { getExerciseMediaFrames } from '../lib/renfoMedia'

const RENFO_FOCUS_COLORS = _COLORS as Record<string, string>

// ── Glyphes SVG par catégorie, ANIMÉS (mouvement « vivant », 100 % maison, zéro
// licence) — utilisés en placeholder quand l'exercice n'a pas de photo de démo. ──
function Glyph({ category, size = 48 }: { category?: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  const spline = { calcMode: 'spline' as const, keyTimes: '0;0.5;1', keySplines: '0.4 0 0.6 1;0.4 0 0.6 1', repeatCount: 'indefinite' as const }
  switch (category) {
    case 'force_lourde':
    case 'haut_corps':
      // haltère qui se soulève
      return (
        <svg {...common}>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 1.5; 0 -2; 0 1.5" dur="1.5s" {...spline} />
            <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
          </g>
        </svg>
      )
    case 'pliometrie':
      // saut qui rebondit
      return (
        <svg {...common}>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 2; 0 -2.5; 0 2" dur="0.9s" {...spline} />
            <path d="M12 4l6 7h-4v9h-4v-9H6z" />
          </g>
        </svg>
      )
    case 'excentrique':
    case 'excentrique_pliometrie':
      // descente contrôlée
      return (
        <svg {...common}>
          <g>
            <animateTransform attributeName="transform" type="translate" values="0 -2; 0 2; 0 -2" dur="1.8s" {...spline} />
            <path d="M12 20l6-7h-4V4h-4v9H6z" />
          </g>
        </svg>
      )
    case 'tronc':
      // gainage qui se gaine (léger balancement)
      return (
        <svg {...common}>
          <g>
            <animateTransform attributeName="transform" type="rotate" values="-4 12 12; 4 12 12; -4 12 12" dur="2.6s" {...spline} />
            <path d="M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" />
            <path d="M12 8v8M8.5 12h7" />
          </g>
        </svg>
      )
    case 'mobilite':
      // flèches qui tournent
      return (
        <svg {...common}>
          <g>
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3.2s" repeatCount="indefinite" />
            <path d="M20 12a8 8 0 1 1-2.3-5.6" />
            <path d="M20 4v4h-4" />
          </g>
        </svg>
      )
    case 'yoga_coureur':
    case 'pilates_coureur':
    case 'stretching':
    default:
      // silhouette qui s'étire (balancement doux)
      return (
        <svg {...common}>
          <g>
            <animateTransform attributeName="transform" type="rotate" values="-5 12 14; 5 12 14; -5 12 14" dur="2.4s" {...spline} />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v6M12 9l-4 2M12 9l4 2M12 13l-3 6M12 13l3 6" />
          </g>
        </svg>
      )
  }
}

/**
 * Visuel d'un exercice : gif/démo si présent en storage, sinon placeholder SVG
 * élégant teinté par la couleur du focus. `exerciseId` = id PARENT de l'exercice.
 */
export default function ExerciseMedia({
  exerciseId, category, variant = 'full',
}: { exerciseId: string; category?: string; variant?: 'thumb' | 'full' }) {
  const [errored, setErrored] = useState(false)
  const [frame, setFrame] = useState(0)
  // Démo : free-exercise-db (domaine public) — 2 images départ↔arrivée qu'on BOUCLE
  // pour animer le mouvement. Repli : gif du storage existant. Sinon placeholder.
  const fedFrames = getExerciseMediaFrames(exerciseId)
  const gifUrl = fedFrames ? null : (getExerciseGifUrl(exerciseId) as string | null)
  useEffect(() => {
    setErrored(false)
    setFrame(0)
    if (!fedFrames || fedFrames.length < 2) return
    const t = setInterval(() => setFrame((f) => (f + 1) % fedFrames.length), 750)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId])
  const url = fedFrames ? fedFrames[frame] : gifUrl
  const color = RENFO_FOCUS_COLORS[category ?? ''] ?? '#7c3aed'
  const showImg = !!url && !errored

  if (variant === 'thumb') {
    return (
      <div style={{
        width: 60, height: 60, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
        border: `1px solid ${color}55`, background: `${color}14`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {showImg
          ? <img src={url!} alt="" loading="lazy" onError={() => setErrored(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Glyph category={category} size={26} />}
      </div>
    )
  }

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', border: `1px solid ${color}44`,
      background: `linear-gradient(135deg, ${color}12, ${color}03)`, color,
      aspectRatio: '16 / 10', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 10,
    }}>
      {showImg ? (
        <img src={url!} alt="" loading="lazy" onError={() => setErrored(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <Glyph category={category} size={56} />
      )}
    </div>
  )
}

// ── Icônes lieu (SVG, pas d'emoji) ───────────────────────────────────────────
export function HomeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

export function GymIcon({ size = 16 }: { size?: number }) {
  // haltère
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
    </svg>
  )
}
