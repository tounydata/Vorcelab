import { useState } from 'react'
// @ts-ignore — renfoData est en JS sans types
import { getExerciseGifUrl, RENFO_FOCUS_COLORS as _COLORS } from '../lib/renfoData'
import { getExerciseDemo } from '../lib/renfoDemos'
import StickFigure from './StickFigure'

const RENFO_FOCUS_COLORS = _COLORS as Record<string, string>

// ── Glyphes SVG par catégorie (placeholder « démo à venir », zéro emoji) ──────
// Tracés simples en currentColor → recolorés par la couleur du focus.
function Glyph({ category, size = 48 }: { category?: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (category) {
    case 'force_lourde':
    case 'haut_corps':
      // haltère
      return (
        <svg {...common}>
          <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
        </svg>
      )
    case 'pliometrie':
      // saut / chevron haut
      return (
        <svg {...common}>
          <path d="M12 4l6 7h-4v9h-4v-9H6z" />
        </svg>
      )
    case 'excentrique':
    case 'excentrique_pliometrie':
      // descente contrôlée / chevron bas
      return (
        <svg {...common}>
          <path d="M12 20l6-7h-4V4h-4v9H6z" />
        </svg>
      )
    case 'tronc':
      // gainage / noyau
      return (
        <svg {...common}>
          <path d="M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" />
          <path d="M12 8v8M8.5 12h7" />
        </svg>
      )
    case 'mobilite':
      // flèches circulaires
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.3-5.6" />
          <path d="M20 4v4h-4" />
        </svg>
      )
    case 'yoga_coureur':
    case 'pilates_coureur':
    case 'stretching':
    default:
      // silhouette en mouvement
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v6M12 9l-4 2M12 9l4 2M12 13l-3 6M12 13l3 6" />
        </svg>
      )
  }
}

/**
 * Visuel d'un exercice : gif/démo si présent en storage, sinon placeholder SVG
 * élégant teinté par la couleur du focus. `exerciseId` = id PARENT de l'exercice.
 *
 * `preferDemo` : en SÉANCE, on préfère la figure SVG (sans matériel, cohérente avec
 * n'importe quelle variante) plutôt que le gif — qui montre un matos précis (ex. squat
 * barre olympique) incohérent avec la variante maison réellement proposée.
 */
export default function ExerciseMedia({
  exerciseId, category, variant = 'full', preferDemo = false,
}: { exerciseId: string; category?: string; variant?: 'thumb' | 'full'; preferDemo?: boolean }) {
  const [errored, setErrored] = useState(false)
  const url = getExerciseGifUrl(exerciseId) as string | null
  const color = RENFO_FOCUS_COLORS[category ?? ''] ?? '#7c3aed'
  const demo = getExerciseDemo(exerciseId)
  const preferTheDemo = preferDemo && !!demo
  const showImg = !!url && !errored && !preferTheDemo

  if (variant === 'thumb') {
    return (
      <div style={{
        width: 60, height: 60, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
        border: `1px solid ${color}55`, background: `${color}14`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {showImg
          ? <img src={url!} alt="" loading="lazy" onError={() => setErrored(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : preferTheDemo
            ? <StickFigure demo={demo!} color={color} size="100%" />
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
      ) : demo ? (
        <StickFigure demo={demo} color={color} size="78%" />
      ) : (
        <>
          <Glyph category={category} size={56} />
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', opacity: 0.85 }}>
            DÉMO À VENIR
          </span>
        </>
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
