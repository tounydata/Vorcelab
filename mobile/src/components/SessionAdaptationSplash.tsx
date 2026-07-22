// Splash animé affiché brièvement quand le verdict d'une séance va influencer
// les prochaines séances. Communique la boucle d'adaptation (prévu → réalisé →
// ajustement) de façon non anxiogène. Auto-fermeture après `durationMs`.
import { useEffect, useState } from 'react'
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native'
import { TargetIcon } from './coach/CoachIcons'
import { colors } from '@/lib/theme'

export default function SessionAdaptationSplash({
  message = "C'est noté — j'en tiendrai compte pour tes prochaines séances.",
  durationMs = 2600,
  onDone,
}: {
  message?: string
  durationMs?: number
  onDone: () => void
}) {
  const [ring] = useState(() => new Animated.Value(0))
  const [pulse] = useState(() => new Animated.Value(1))

  useEffect(() => {
    const id = setTimeout(onDone, durationMs)
    return () => clearTimeout(id)
  }, [durationMs, onDone])

  useEffect(() => {
    Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start()
  }, [ring, pulse])

  const ringScale = ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 1, 1.25] })
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1, 0] })

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDone}>
      <Pressable
        onPress={onDone}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          backgroundColor: 'rgba(8,10,14,0.82)',
        }}
      >
        <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              position: 'absolute',
              width: 72,
              height: 72,
              borderRadius: 36,
              borderWidth: 2,
              borderColor: colors.ember,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            }}
          />
          <Animated.View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.ember,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pulse }],
            }}
          >
            <TargetIcon size={26} color="#fff" />
          </Animated.View>
        </View>
        <Text style={{ maxWidth: 280, textAlign: 'center', color: colors.text, fontSize: 14, lineHeight: 21, paddingHorizontal: 24 }}>
          {message}
        </Text>
      </Pressable>
    </Modal>
  )
}
