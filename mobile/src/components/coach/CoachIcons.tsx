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
