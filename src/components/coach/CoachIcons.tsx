// Jeu d'icônes SVG du Coach — AUCUN emoji (règle produit : qualitatif = SVG).
// Trait courant, hérite de `currentColor`, taille pilotée par `size`.
import type { CSSProperties } from 'react'

interface IconProps { size?: number; color?: string; style?: CSSProperties }

function base(size: number, color?: string, style?: CSSProperties) {
  return {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color ?? 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    style,
  }
}

/** Visage satisfait (ressenti « bien »). */
export function FaceGood({ size = 20, color, style }: IconProps) {
  return (
    <svg {...base(size, color, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14c1 1.4 2.4 2 4 2s3-.6 4-2" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  )
}

/** Visage neutre (ressenti « bof »). */
export function FaceOk({ size = 20, color, style }: IconProps) {
  return (
    <svg {...base(size, color, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 15h7" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  )
}

/** Visage contrarié (ressenti « dur »). */
export function FaceBad({ size = 20, color, style }: IconProps) {
  return (
    <svg {...base(size, color, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 16c1-1.4 2.4-2 4-2s3 .6 4 2" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  )
}

/** Cible (boucle d'adaptation). */
export function TargetIcon({ size = 24, color, style }: IconProps) {
  return (
    <svg {...base(size, color, style)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill={color ?? 'currentColor'} />
    </svg>
  )
}

/** Drapeau d'arrivée (jour de course). */
export function FlagIcon({ size = 18, color, style }: IconProps) {
  return (
    <svg {...base(size, color, style)}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-1.5 3L16 10H5" />
    </svg>
  )
}

/** Chevrons de navigation semaine. */
export function ChevronLeft({ size = 18, color, style }: IconProps) {
  return <svg {...base(size, color, style)}><path d="M15 6l-6 6 6 6" /></svg>
}
export function ChevronRight({ size = 18, color, style }: IconProps) {
  return <svg {...base(size, color, style)}><path d="M9 6l6 6-6 6" /></svg>
}

/** Coche (séance notée). */
export function CheckIcon({ size = 16, color, style }: IconProps) {
  return <svg {...base(size, color, style)}><path d="M4 12.5l5 5 11-11" /></svg>
}
