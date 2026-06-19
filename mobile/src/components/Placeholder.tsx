import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, space } from '@/lib/theme'

// Écran en attente d'implémentation (porté dans une PR suivante).
export function Placeholder({ title }: { title: string }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ padding: space.lg }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: 1 }}>{title}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text3, fontSize: 13 }}>Bientôt disponible</Text>
      </View>
    </SafeAreaView>
  )
}
