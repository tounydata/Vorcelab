import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import 'react-native-url-polyfill/auto'
import { useAuthStore } from '../stores/useAuthStore'

WebBrowser.maybeCompleteAuthSession()

export default function RootLayout() {
  const { init } = useAuthStore()

  useEffect(() => {
    void init()
  }, [])

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#060810' },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
      </Stack>
    </>
  )
}
