// Splash de chargement Vorcelab : le logo de marque + le nom, en pleine page.
// Remplace les spinners — un chargement doit ressembler à la marque. Le tracé
// « se dessine » via une pulsation d'opacité (équivalent natif de l'animation SVG web).
import { useEffect, useRef } from 'react'
import { Animated, Easing, Text, View } from 'react-native'
import { Logo } from './Logo'
import { colors } from '@/lib/theme'

export default function BrandedLoader({ label, fullScreen = true }: { label?: string; fullScreen?: boolean }) {
  const pulse = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <View
      style={{
        flex: fullScreen ? 1 : undefined,
        backgroundColor: fullScreen ? colors.bg : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: fullScreen ? 0 : 32,
        gap: 12,
      }}
    >
      <Animated.View style={{ opacity: pulse }}>
        <Logo size={58} />
      </Animated.View>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', letterSpacing: 3 }}>VORCELAB</Text>
      {label ? <Text style={{ color: colors.text3, fontSize: 12 }}>{label}</Text> : null}
    </View>
  )
}
