import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { colors, font, space } from '@/lib/theme'
import { BackLink, CLabel } from '@/components/coach/ui'
import { usePlanTier } from '@/lib/usePlanTier'
import { getUsers } from '@/lib/adminApi'
import { Etat, Segmented, useAsync } from '@/components/admin/adminUi'
import AdminUsersTab from '@/components/admin/AdminUsersTab'
import AdminStatsTab from '@/components/admin/AdminStatsTab'
import AdminSupportTab from '@/components/admin/AdminSupportTab'
import AdminLabTab from '@/components/admin/AdminLabTab'
import EngineAccuracyCard from '@/components/admin/EngineAccuracyCard'

// Écran Admin mobile — porte les quatre onglets du web (`src/pages/AdminPage.tsx`) :
// Utilisateurs, Statistiques, Assistance, Labo & tests. Aucune logique métier n'est
// dupliquée : tout passe par les mêmes RPC `admin_*` et l'edge function `admin-support`,
// qui vérifient eux-mêmes l'habilitation. Le garde-fou ci-dessous n'est qu'un confort
// d'affichage — la sécurité reste côté serveur.

type Tab = 'users' | 'stats' | 'support' | 'lab'

const TABS = [
  ['users', 'Utilisateurs'],
  ['stats', 'Statistiques'],
  ['support', 'Assistance'],
  ['lab', 'Labo & tests'],
] as const

export default function AdminScreen() {
  const router = useRouter()
  const { isAdmin, isLoading } = usePlanTier()
  const [tab, setTab] = useState<Tab>('users')
  const users = useAsync(() => getUsers(), [])

  const list = users.data ?? []
  // Même compte que le web : PRO encore valide (un abonnement expiré ne compte pas).
  const proCount = list.filter((u) =>
    u.plan_tier === 'pro' && (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date()),
  ).length

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
        <BackLink label="← RETOUR" onPress={() => router.back()} />

        <Text style={{ fontFamily: font.display, fontSize: 30, color: colors.text }}>Admin</Text>

        {isLoading ? (
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.text3, marginTop: 6 }}>
            Vérification des droits…
          </Text>
        ) : !isAdmin ? (
          <View style={{ marginTop: 20 }}>
            <CLabel>ACCÈS REFUSÉ</CLabel>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.text2, lineHeight: 18 }}>
              Cet écran est réservé aux administrateurs.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 14 }}>
              <Text style={{ fontFamily: font.mono, fontSize: 10.5, color: colors.text3, flexShrink: 1 }}>
                {list.length} utilisateur{list.length > 1 ? 's' : ''} ·{' '}
                <Text style={{ color: colors.ember }}>
                  {proCount} PRO actif{proCount > 1 ? 's' : ''}
                </Text>
              </Text>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
                borderWidth: 1, borderColor: colors.ember, backgroundColor: 'rgba(214,128,62,0.1)',
              }}>
                <Text style={{ fontFamily: font.monoSemiBold, fontSize: 9, letterSpacing: 1.2, color: colors.ember }}>
                  ✦ ADMIN
                </Text>
              </View>
            </View>

            <Segmented options={TABS} value={tab} onChange={setTab} />
            <Etat state={users} />

            {tab === 'users' ? <AdminUsersTab users={list} onChanged={users.reload} /> : null}
            {tab === 'stats' ? (
              <View style={{ gap: 14 }}>
                <EngineAccuracyCard />
                <AdminStatsTab />
              </View>
            ) : null}
            {tab === 'support' ? <AdminSupportTab users={list} /> : null}
            {tab === 'lab' ? <AdminLabTab users={list} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
