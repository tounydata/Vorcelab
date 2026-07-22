import { Tabs } from 'expo-router'
import { TabIcon, type TabName } from '@/components/TabIcon'
import { colors, font } from '@/lib/theme'

// Barre d'onglets — même ordre et mêmes libellés que le web (Layout.tsx).
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ember,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: {
          backgroundColor: colors.surf,
          borderTopColor: colors.line2,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontFamily: font.monoSemiBold,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {(
        [
          ['index', 'Dashboard'],
          ['coach', 'Coach'],
          ['race', 'Calendrier'],
          ['activities', 'Activités'],
          ['profile', 'Réglages'],
        ] as [TabName, string][]
      ).map(([name, title]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color }) => <TabIcon name={name} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  )
}
