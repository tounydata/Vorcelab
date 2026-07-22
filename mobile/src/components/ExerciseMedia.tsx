import { useEffect, useState } from 'react'
import { Animated, Easing, View } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Circle, G, Path } from 'react-native-svg'
import { RENFO_FOCUS_COLORS as _COLORS } from '@/lib/renfoData'
import { getExerciseMediaUrl, type ExoLocation } from '@/lib/renfoMedia'

const RENFO_FOCUS_COLORS = _COLORS as Record<string, string>
const AnimatedG = Animated.createAnimatedComponent(G)

// Mouvement « vivant » par catégorie (équivalent natif des <animateTransform> SMIL
// du web) : translate vertical ou rotation, bouclé.
type Motion =
  | { type: 'translate'; from: number; to: number; dur: number }
  | { type: 'rotate'; from: number; to: number; dur: number }

function motionFor(category?: string): Motion {
  switch (category) {
    case 'force_lourde':
    case 'haut_corps': return { type: 'translate', from: 1.5, to: -2, dur: 1500 }
    case 'pliometrie': return { type: 'translate', from: 2, to: -2.5, dur: 900 }
    case 'excentrique':
    case 'excentrique_pliometrie': return { type: 'translate', from: -2, to: 2, dur: 1800 }
    case 'tronc': return { type: 'rotate', from: -4, to: 4, dur: 2600 }
    case 'mobilite': return { type: 'rotate', from: 0, to: 360, dur: 3200 }
    default: return { type: 'rotate', from: -5, to: 5, dur: 2400 }
  }
}

// ── Glyphes SVG par catégorie, ANIMÉS, 100 % maison — placeholder quand l'exercice
// n'a pas de démo. ──
function Glyph({ category, size = 48, color }: { category?: string; size?: number; color: string }) {
  const [t] = useState(() => new Animated.Value(0))
  const motion = motionFor(category)
  const common = { fill: 'none' as const, stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  useEffect(() => {
    const loop = motion.type === 'rotate' && motion.from === 0
      ? Animated.loop(Animated.timing(t, { toValue: 1, duration: motion.dur, easing: Easing.linear, useNativeDriver: true }))
      : Animated.loop(Animated.sequence([
          Animated.timing(t, { toValue: 1, duration: motion.dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(t, { toValue: 0, duration: motion.dur / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]))
    loop.start()
    return () => loop.stop()
  }, [t, motion.type, motion.dur, motion.from])

  const animProps =
    motion.type === 'translate'
      ? { y: t.interpolate({ inputRange: [0, 1], outputRange: [motion.from, motion.to] }) }
      : { rotation: t.interpolate({ inputRange: [0, 1], outputRange: [motion.from, motion.to] }), originX: 12, originY: category === 'tronc' ? 12 : category === 'mobilite' ? 12 : 14 }

  let shape: React.ReactNode
  switch (category) {
    case 'force_lourde':
    case 'haut_corps':
      shape = <Path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" {...common} />; break
    case 'pliometrie':
      shape = <Path d="M12 4l6 7h-4v9h-4v-9H6z" {...common} />; break
    case 'excentrique':
    case 'excentrique_pliometrie':
      shape = <Path d="M12 20l6-7h-4V4h-4v9H6z" {...common} />; break
    case 'tronc':
      shape = <><Path d="M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z" {...common} /><Path d="M12 8v8M8.5 12h7" {...common} /></>; break
    case 'mobilite':
      shape = <><Path d="M20 12a8 8 0 1 1-2.3-5.6" {...common} /><Path d="M20 4v4h-4" {...common} /></>; break
    default:
      shape = <><Circle cx="12" cy="5" r="2" {...common} /><Path d="M12 7v6M12 9l-4 2M12 9l4 2M12 13l-3 6M12 13l3 6" {...common} /></>
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <AnimatedG {...(animProps as object)}>{shape}</AnimatedG>
    </Svg>
  )
}

/**
 * Visuel d'un exercice : démo (free-exercise-db, 2 frames bouclées) ou gif storage si
 * présents, sinon placeholder SVG élégant teinté par la couleur du focus.
 */
export default function ExerciseMedia({
  exerciseId, category, variant = 'full', location,
}: { exerciseId: string; category?: string; variant?: 'thumb' | 'full'; location?: ExoLocation }) {
  const [errored, setErrored] = useState(false)
  // Démo WebP animée (GymVisual) servie depuis le CDN web ; version « maison » si dispo.
  const url = getExerciseMediaUrl(exerciseId, location)
  const color = RENFO_FOCUS_COLORS[category ?? ''] ?? '#7c3aed'
  const showImg = !!url && !errored

  if (variant === 'thumb') {
    return (
      <View style={{
        width: 60, height: 60, borderRadius: 8, overflow: 'hidden',
        borderWidth: 1, borderColor: `${color}55`, backgroundColor: `${color}14`,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {showImg ? (
          <Image source={{ uri: url! }} onError={() => setErrored(true)} contentFit="cover" style={{ width: '100%', height: '100%' }} />
        ) : (
          <Glyph category={category} size={26} color={color} />
        )}
      </View>
    )
  }

  return (
    <View style={{
      borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: `${color}44`,
      backgroundColor: `${color}12`, aspectRatio: 16 / 10,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {showImg ? (
        <Image source={{ uri: url! }} onError={() => setErrored(true)} contentFit="contain" style={{ width: '100%', height: '100%' }} />
      ) : (
        <Glyph category={category} size={56} color={color} />
      )}
    </View>
  )
}

// ── Icônes lieu (SVG, pas d'emoji) ───────────────────────────────────────────
export function HomeIcon({ size = 16, color = '#a8a59c' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 11l9-7 9 7" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 20v-6h4v6" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function GymIcon({ size = 16, color = '#a8a59c' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
