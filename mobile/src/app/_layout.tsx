import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
// Big Shoulders : fichiers EMBARQUÉS localement (audit — le paquet
// @expo-google-fonts/big-shoulders-display est déprécié/retiré de Google Fonts).
// Les .ttf vivent dans assets/fonts, plus aucune dépendance runtime pour ce titre.
const BigShouldersDisplay_700Bold = require('../../assets/fonts/BigShouldersDisplay_700Bold.ttf')
const BigShouldersDisplay_800ExtraBold = require('../../assets/fonts/BigShouldersDisplay_800ExtraBold.ttf')
const BigShouldersDisplay_900Black = require('../../assets/fonts/BigShouldersDisplay_900Black.ttf')
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter'
import { AuthProvider, useAuth } from '@/lib/auth'
import { colors } from '@/lib/theme'

// Redirige selon l'état de connexion (pattern d'auth expo-router).
function Gate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { session, loading: authLoading } = useAuth()
  // L'app n'affiche rien tant que l'identité typographique n'est pas prête :
  // un premier rendu en police système ferait « flasher » une app générique.
  const loading = authLoading || !fontsLoaded
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inLogin = segments[0] === 'login'
    if (!session && !inLogin) router.replace('/login')
    else if (session && inLogin) router.replace('/')
  }, [session, loading, segments, router])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ember} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    />
  )
}

export default function RootLayout() {
  // Fontes de marque (mêmes graisses que le web : display 700–900, mono 400–600,
  // Inter 400–600). useFonts met en cache après le 1er chargement.
  const [fontsLoaded] = useFonts({
    BigShouldersDisplay_700Bold,
    BigShouldersDisplay_800ExtraBold,
    BigShouldersDisplay_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  })
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Gate fontsLoaded={fontsLoaded} />
    </AuthProvider>
  )
}
