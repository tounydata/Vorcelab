import Svg, { Circle, Line, Path } from 'react-native-svg'
import { colors } from '@/lib/theme'

// Marque Vorcelab : profil de montagne / courbe de données, sommet ember.
export function Logo({ size = 48, color = colors.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <Line x1="3" y1="50" x2="57" y2="50" stroke={color} strokeWidth={1.2} opacity={0.3} />
      <Path
        d="M3 44 L14 36 L22 40 L30 12 L38 30 L46 24 L57 32"
        stroke={color}
        strokeWidth={3.2}
        strokeLinejoin="miter"
        strokeLinecap="square"
        fill="none"
      />
      <Circle cx="30" cy="12" r="3.5" fill={colors.ember2} />
      <Line x1="30" y1="50" x2="30" y2="55" stroke={colors.ember2} strokeWidth={1.8} />
    </Svg>
  )
}
