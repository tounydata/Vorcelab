import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { MOTIVATION_LABELS, type CoachMotivation } from '@/lib/coach/motivation'
import { NUTRITION_TYPE_LABELS, nutritionBrands } from '@/lib/nutritionProducts'
import { LEGAL, openLegal, openSupport } from '@/lib/legal'
import StravaConnectionCard from '@/components/profile/StravaConnectionCard'
import OneRMSettingsCard from '@/components/profile/OneRMSettingsCard'
import { Card, FL, CLabel, MLabel, HButton, BackLink, colors, radius, space } from '@/components/coach/ui'

// Réglages : comment l'app est réglée (Strava, coach, matériel, nutrition, compte).
// Porté de `src/pages/SettingsPage.tsx`. Le « qui je suis » (physio, records, labo)
// reste sur l'onglet Profil. Carte ABONNEMENT (Stripe) volontairement absente sur
// iOS (Apple impose l'In-App Purchase pour l'abonnement — cf. suivi App Store).

interface SettingsRow {
  coach_motivation?: string | null
  coach_days_per_week?: number | null
  renfo_weekly_target?: number | null
  nutrition_products?: string[] | null
  nutrition_no_caffeine?: boolean | null
}

type TabKey = 'reglages' | 'nutrition'

function Segmented<T extends string | number>({ options, value, onChange, fmt }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; fmt?: (v: T) => string
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, overflow: 'hidden', flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const on = value === opt
        return (
          <Pressable
            key={String(opt)}
            onPress={() => { if (!on) onChange(opt) }}
            style={({ pressed }) => ({
              flexGrow: 1, minWidth: 60, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center',
              backgroundColor: on ? colors.ember : colors.surf2, opacity: pressed && !on ? 0.7 : 1,
            })}
          >
            <Text style={{ color: on ? colors.bg : colors.text2, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 }}>
              {fmt ? fmt(opt) : String(opt)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: on ? colors.ember : colors.line, justifyContent: 'center' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', position: 'absolute', left: on ? 20 : 2 }} />
    </View>
  )
}

export default function SettingsScreen() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const email = session?.user.email ?? ''
  const router = useRouter()

  const [tab, setTab] = useState<TabKey>('reglages')
  const [row, setRow] = useState<SettingsRow | null>(null)

  // Compte / mot de passe
  const [showPwd, setShowPwd] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')

  // Nutrition
  const [products, setProducts] = useState<string[]>([])
  const [nutritionLoaded, setNutritionLoaded] = useState(false)
  const [nutritionSaved, setNutritionSaved] = useState(false)
  const [openBrand, setOpenBrand] = useState<string | null>(null)

  function loadRow() {
    if (!userId) return
    supabase.from('profiles')
      .select('coach_motivation,coach_days_per_week,renfo_weekly_target,nutrition_products,nutrition_no_caffeine')
      .eq('id', userId).single()
      .then(({ data }) => {
        const r = (data ?? {}) as SettingsRow
        setRow(r)
        if (!nutritionLoaded) { setProducts(r.nutrition_products ?? []); setNutritionLoaded(true) }
      })
  }
  useEffect(() => { loadRow() }, [userId])

  async function patch(p: Record<string, unknown>) {
    if (!userId) return
    setRow((r) => ({ ...(r ?? {}), ...p }))  // optimiste
    await supabase.from('profiles').update(p).eq('id', userId)
  }

  function toggleProduct(id: string) {
    setProducts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function saveProducts() {
    if (!userId) return
    const { error } = await supabase.from('profiles').upsert({ id: userId, nutrition_products: products })
    if (!error) {
      setNutritionSaved(true)
      setTimeout(() => setNutritionSaved(false), 2500)
    }
  }

  async function handlePwdChange() {
    if (!newPwd) return
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) {
      setPwdMsg('Erreur : ' + error.message)
    } else {
      setPwdMsg('Mot de passe mis à jour ✓')
      setNewPwd('')
      setShowPwd(false)
      setTimeout(() => setPwdMsg(''), 3000)
    }
  }

  const motivation = (row?.coach_motivation ?? 'mix') as CoachMotivation
  const days = row?.coach_days_per_week ?? 5
  const renfoTarget = row?.renfo_weekly_target ?? 3
  const noCaf = row?.nutrition_no_caffeine === true

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <BackLink label="← Profil" onPress={() => router.back()} />
        <CLabel style={{ marginBottom: 16, fontSize: 22, color: colors.text, letterSpacing: 1 }}>RÉGLAGES</CLabel>

        {/* Sous-onglets */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 16 }}>
          {(['reglages', 'nutrition'] as TabKey[]).map((t) => {
            const on = tab === t
            return (
              <Pressable key={t} onPress={() => setTab(t)} hitSlop={6} style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: on ? colors.ember : 'transparent' }}>
                <Text style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: on ? colors.ember : colors.text3, fontWeight: '600' }}>
                  {t === 'reglages' ? 'RÉGLAGES' : 'NUTRITION'}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {tab === 'reglages' ? (
          <>
            <StravaConnectionCard />

            {/* Orientation coach */}
            <Card style={{ marginBottom: space.lg }}>
              <FL style={{ marginBottom: 4 }}>Orientation coach</FL>
              <Text style={{ fontSize: 12, color: colors.text3, lineHeight: 18, marginBottom: 12 }}>
                Comment tu veux t'entraîner — ça ajuste le volume et l'intensité de ton plan.
              </Text>
              <Segmented
                options={['plaisir', 'mix', 'performance'] as CoachMotivation[]}
                value={motivation}
                onChange={(m) => patch({ coach_motivation: m })}
                fmt={(m) => MOTIVATION_LABELS[m]}
              />
            </Card>

            {/* Course */}
            <Card style={{ marginBottom: space.lg }}>
              <FL style={{ marginBottom: 4 }}>Course</FL>
              <Text style={{ fontSize: 12, color: colors.text3, lineHeight: 18, marginBottom: 12 }}>
                Jours de course disponibles par semaine — calibre le nombre de séances du plan.
              </Text>
              <Segmented options={[3, 4, 5, 6] as const} value={days} onChange={(n) => patch({ coach_days_per_week: n })} fmt={(n) => `${n} j`} />
              <Pressable onPress={() => router.push('/race')} hitSlop={6}>
                <MLabel style={{ color: colors.ember, marginTop: 14, fontSize: 11 }}>Calendrier des courses →</MLabel>
              </Pressable>
            </Card>

            {/* Renfo */}
            <Card style={{ marginBottom: space.lg }}>
              <FL style={{ marginBottom: 4 }}>Renforcement</FL>
              <Text style={{ fontSize: 12, color: colors.text3, lineHeight: 18, marginBottom: 12 }}>
                Objectif de séances de renfo par semaine.
              </Text>
              <Segmented options={[2, 3, 4, 5] as const} value={renfoTarget} onChange={(n) => patch({ renfo_weekly_target: n })} fmt={(n) => `${n}/sem`} />
              <Pressable onPress={() => router.push('/renfo/library')} hitSlop={6}>
                <MLabel style={{ color: colors.ember, marginTop: 14, fontSize: 11 }}>Bibliothèque d'exercices →</MLabel>
              </Pressable>
            </Card>

            {/* 1RM force */}
            <OneRMSettingsCard />

            {/* Matériel renfo (écran dédié) */}
            <Pressable onPress={() => router.push('/renfo/equipment')} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, marginBottom: space.lg }]}>
              <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <FL style={{ marginBottom: 4, color: colors.violet }}>Matériel renfo — Maison / Salle</FL>
                  <Text style={{ fontSize: 12, color: colors.text3, lineHeight: 18 }}>Détermine les variantes d'exercices proposées en séance.</Text>
                </View>
                <Text style={{ color: colors.ember, fontSize: 20, marginLeft: 12 }}>›</Text>
              </Card>
            </Pressable>

            {/* Compte */}
            <Card style={{ marginBottom: space.lg }}>
              <CLabel style={{ marginBottom: 12 }}>COMPTE</CLabel>
              <FL>Email</FL>
              <View style={{ backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12 }}>
                <Text style={{ color: colors.text2, fontSize: 14 }}>{email}</Text>
              </View>
              {!showPwd ? (
                <HButton label="🔑 Changer le mot de passe" onPress={() => setShowPwd(true)} />
              ) : (
                <View style={{ gap: 8 }}>
                  <TextInput
                    value={newPwd}
                    onChangeText={setNewPwd}
                    placeholder="Nouveau mot de passe"
                    placeholderTextColor={colors.text3}
                    secureTextEntry
                    style={{ backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 14 }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <HButton label="Confirmer" onPress={handlePwdChange} style={{ flex: 1 }} />
                    <HButton label="Annuler" onPress={() => { setShowPwd(false); setNewPwd('') }} style={{ flex: 1 }} />
                  </View>
                </View>
              )}
              {pwdMsg ? <Text style={{ marginTop: 6, fontSize: 11, color: pwdMsg.startsWith('Erreur') ? colors.ember2 : colors.growth }}>{pwdMsg}</Text> : null}
            </Card>
          </>
        ) : (
          <>
            {/* Préférences */}
            <Card style={{ marginBottom: space.lg }}>
              <CLabel style={{ marginBottom: 8 }}>PRÉFÉRENCES</CLabel>
              <Pressable
                onPress={() => patch({ nutrition_no_caffeine: !noCaf })}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 11 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Sans caféine</Text>
                  <Text style={{ fontSize: 11, color: colors.text3 }}>Le plan de course évite les produits caféinés (et le cola).</Text>
                </View>
                <Toggle on={noCaf} />
              </Pressable>
            </Card>

            {/* Produits nutrition */}
            <Card style={{ marginBottom: space.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <CLabel style={{ marginBottom: 0 }}>MES PRODUITS NUTRITION</CLabel>
                <HButton label={nutritionSaved ? 'Enregistré ✓' : 'Enregistrer'} onPress={saveProducts} style={{ paddingHorizontal: 10, paddingVertical: 4 }} textStyle={{ fontSize: 10 }} />
              </View>
              <Text style={{ fontSize: 12, color: colors.text3, lineHeight: 18, marginBottom: 12 }}>
                Coche les produits que tu utilises. Ils alimentent ton plan de ravitaillement dans la stratégie de course.
                <Text style={{ color: colors.text2 }}> {products.length} sélectionné{products.length > 1 ? 's' : ''}.</Text>
              </Text>
              <View style={{ gap: 4 }}>
                {nutritionBrands().map(({ brand, products: brandProducts }) => {
                  const open = openBrand === brand
                  const selCount = brandProducts.filter((p) => products.includes(p.id)).length
                  return (
                    <View key={brand} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, overflow: 'hidden' }}>
                      <Pressable
                        onPress={() => setOpenBrand(open ? null : brand)}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: open ? colors.surf2 : 'transparent', paddingHorizontal: 13, paddingVertical: 11 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{brand}</Text>
                          {selCount > 0 ? <Text style={{ fontSize: 10, color: colors.ember }}>{selCount} ✓</Text> : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 10, color: colors.text3 }}>{brandProducts.length} produit{brandProducts.length > 1 ? 's' : ''}</Text>
                          <Text style={{ fontSize: 12, color: colors.text3 }}>{open ? '⌄' : '›'}</Text>
                        </View>
                      </Pressable>
                      {open ? (
                        <View style={{ paddingHorizontal: 13, paddingTop: 4, paddingBottom: 10, gap: 2 }}>
                          {brandProducts.map((p) => {
                            const checked = products.includes(p.id)
                            return (
                              <Pressable key={p.id} onPress={() => toggleProduct(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                                <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: checked ? colors.ember : colors.line2, backgroundColor: checked ? colors.ember : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                  {checked ? <Text style={{ color: colors.bg, fontSize: 11, fontWeight: '800' }}>✓</Text> : null}
                                </View>
                                <Text style={{ flex: 1, fontSize: 13, color: checked ? colors.text : colors.text2 }}>
                                  {p.name}
                                  <Text style={{ fontSize: 9, color: colors.text3, textTransform: 'uppercase' }}>  {NUTRITION_TYPE_LABELS[p.type]}</Text>
                                </Text>
                                <Text style={{ fontSize: 10, color: colors.text3 }}>
                                  {p.carbs}g{p.per ? `/${p.per}` : ''}{p.caffeine ? ` · ${p.caffeine}mg caf` : ''}
                                </Text>
                              </Pressable>
                            )
                          })}
                        </View>
                      ) : null}
                    </View>
                  )
                })}
              </View>
            </Card>
          </>
        )}

        {/* Déconnexion */}
        <HButton label="Se déconnecter" onPress={() => supabase.auth.signOut()} style={{ marginTop: 8 }} />

        {/* Légal */}
        <View style={{ marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
          <Pressable onPress={() => openLegal(LEGAL.terms)} hitSlop={6}><MLabel>CGU / CGV</MLabel></Pressable>
          <Pressable onPress={() => openLegal(LEGAL.privacy)} hitSlop={6}><MLabel>Confidentialité</MLabel></Pressable>
          <Pressable onPress={() => openSupport()} hitSlop={6}><MLabel>Contact</MLabel></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
