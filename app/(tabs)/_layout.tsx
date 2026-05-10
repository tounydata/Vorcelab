import { Tabs, Redirect } from 'expo-router'
import { useAuthStore } from '../../stores/useAuthStore'
import { colors } from '../../lib/colors'

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <></>  // placeholder — icons via tabBarIcon below
  void symbol
  void color
}
void TabIcon

export default function TabLayout() {
  const { session, initialised } = useAuthStore()

  if (!initialised) return null
  if (!session) return <Redirect href="/auth" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(6,8,16,0.97)',
          borderTopColor: 'rgba(0,212,255,0.22)',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.text3,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <TabBarIcon label="⊞" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendrier',
          tabBarIcon: ({ color }) => (
            <TabBarIcon label="◎" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="activities"
        options={{
          title: 'Activités',
          tabBarIcon: ({ color }) => (
            <TabBarIcon label="↗" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => (
            <TabBarIcon label="◉" color={color} />
          ),
        }}
      />
    </Tabs>
  )
}

function TabBarIcon({ label, color }: { label: string; color: string }) {
  const { Text } = require('react-native') as typeof import('react-native')
  return <Text style={{ fontSize: 18, color }}>{label}</Text>
}
