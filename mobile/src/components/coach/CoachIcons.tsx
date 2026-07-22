// Jeu d'icônes SVG du Coach — AUCUN emoji (règle produit : qualitatif = SVG).
// Trait courant, taille pilotée par `size`. Porté 1:1 depuis le web (react-native-svg).
import Svg, { Circle, Path } from 'react-native-svg'
import { colors } from '@/lib/theme'

interface IconProps { size?: number; color?: string }

function strokeProps(color?: string) {
  return {
    fill: 'none' as const,
    stroke: color ?? colors.text,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

/** Visage satisfait (ressenti « bien »). */
export function FaceGood({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" {...strokeProps(color)} />
      <Path d="M8 14c1 1.4 2.4 2 4 2s3-.6 4-2" {...strokeProps(color)} />
      <Path d="M9 9.5h.01M15 9.5h.01" {...strokeProps(color)} />
    </Svg>
  )
}

/** Visage neutre (ressenti « bof »). */
export function FaceOk({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" {...strokeProps(color)} />
      <Path d="M8.5 15h7" {...strokeProps(color)} />
      <Path d="M9 9.5h.01M15 9.5h.01" {...strokeProps(color)} />
    </Svg>
  )
}

/** Visage contrarié (ressenti « dur »). */
export function FaceBad({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" {...strokeProps(color)} />
      <Path d="M8 16c1-1.4 2.4-2 4-2s3 .6 4 2" {...strokeProps(color)} />
      <Path d="M9 9.5h.01M15 9.5h.01" {...strokeProps(color)} />
    </Svg>
  )
}

/** Cible (boucle d'adaptation). */
export function TargetIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" {...strokeProps(color)} />
      <Circle cx="12" cy="12" r="5" {...strokeProps(color)} />
      <Circle cx="12" cy="12" r="1.4" fill={color ?? colors.text} />
    </Svg>
  )
}

/** Drapeau d'arrivée (jour de course). */
export function FlagIcon({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 21V4" {...strokeProps(color)} />
      <Path d="M5 4h11l-1.5 3L16 10H5" {...strokeProps(color)} />
    </Svg>
  )
}

/** Chevrons de navigation semaine. */
export function ChevronLeft({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6l-6 6 6 6" {...strokeProps(color)} />
    </Svg>
  )
}
export function ChevronRight({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" {...strokeProps(color)} />
    </Svg>
  )
}

/** Coche (séance notée). */
export function CheckIcon({ size = 16, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5l5 5 11-11" {...strokeProps(color)} />
    </Svg>
  )
}

// ── Icônes hors-Coach (remplacement des emojis résiduels — audit 21/07) ──────

/** Disquette (enregistrer). */
export function SaveIcon({ size = 14, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" {...strokeProps(color)} />
      <Path d="M8 3v5h7V3" {...strokeProps(color)} />
      <Path d="M7 21v-7h10v7" {...strokeProps(color)} />
    </Svg>
  )
}

/** Engrenage (réglages). */
export function GearIcon({ size = 16, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3.2" {...strokeProps(color)} />
      <Path d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6L5.5 5.5" {...strokeProps(color)} />
    </Svg>
  )
}

/** Crayon (modifier). */
export function PencilIcon({ size = 12, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" {...strokeProps(color)} />
      <Path d="M14.5 6.5l3 3" {...strokeProps(color)} />
    </Svg>
  )
}

/** Crête (trail) — reprise du motif du logo. */
export function MountainIcon({ size = 14, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 19L8.5 8l3.5 5.5L15 9l7 10H2z" {...strokeProps(color)} />
    </Svg>
  )
}

/** Réorganiser (⇅). */
export function ReorderIcon({ size = 12, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 4v16M8 4L5 7.5M8 4l3 3.5" {...strokeProps(color)} />
      <Path d="M16 20V4M16 20l-3-3.5M16 20l3-3.5" {...strokeProps(color)} />
    </Svg>
  )
}

/** Triangles monter / descendre (réorganisation de sections). */
export function CaretUpIcon({ size = 12, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 15.5L12 8l7 7.5" {...strokeProps(color)} />
    </Svg>
  )
}
export function CaretDownIcon({ size = 12, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 8.5L12 16l7-7.5" {...strokeProps(color)} />
    </Svg>
  )
}

/** Renfo (⊕) — pastille « plus ». */
export function PlusRingIcon({ size = 10, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" {...strokeProps(color)} />
      <Path d="M12 8v8M8 12h8" {...strokeProps(color)} />
    </Svg>
  )
}
