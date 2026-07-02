import { useState } from 'react'
import { useSearchParams, Link } from 'react-router'
import type { CSSProperties } from 'react'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'
import { NUTRITION_TYPE_LABELS, nutritionBrands } from '../lib/nutritionProducts'
import { MOTIVATION_LABELS, type CoachMotivation } from '../lib/coach/motivation'
import StravaConnection from '../components/StravaConnection'
import SubscriptionCard from '../components/SubscriptionCard'
import RenfoEquipmentEditor from '../components/RenfoEquipmentEditor'
import OneRMSettingsCard from '../components/coach/OneRMSettingsCard'
import ProfileTabs from '../components/ProfileTabs'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'

// ─── Réglages : comment l'app est réglée (Strava, coach, matériel, nutrition,
// compte). Le « qui je suis » (physio, records, labo) reste sur /profile. ──────

interface SettingsRow {
  id: string
  name?: string | null
  avatar_url?: string | null
  coach_motivation?: string | null
  coach_days_per_week?: number | null
  renfo_weekly_target?: number | null
  nutrition_products?: string[] | null
  nutrition_no_caffeine?: boolean | null
}

const tabStyle = (active: boolean): CSSProperties => ({
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '8px 12px',
  fontFamily: 'var(--vl-mono)',
  fontSize: 11,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: active ? 'var(--vl-ember)' : 'var(--vl-text-3)',
  borderBottom: active ? '2px solid var(--vl-ember)' : '2px solid transparent',
})

export default function SettingsPage() {
  const user = useVLStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()
  type TabKey = 'reglages' | 'nutrition'
  const activeTab = (searchParams.get('tab') ?? 'reglages') as TabKey
  const setActiveTab = (tab: TabKey) =>
    setSearchParams(tab === 'reglages' ? {} : { tab }, { replace: false })
  const queryClient = useQueryClient()

  // Password change state
  const [showPwdInput, setShowPwdInput] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')

  // Produits nutrition cochés par l'athlète (ids du catalogue) — utilisés par la stratégie de course.
  const [nutritionProducts, setNutritionProducts] = useState<string[]>([])
  const [nutritionLoaded, setNutritionLoaded] = useState(false)
  const [nutritionSaved, setNutritionSaved] = useState(false)
  const [openBrand, setOpenBrand] = useState<string | null>(null)

  const { data: profileRow, isLoading, refetch } = useQuery<SettingsRow | null>({
    queryKey: ['profile-settings-page', user?.id],
    queryFn: async (): Promise<SettingsRow | null> => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('id,name,avatar_url,coach_motivation,coach_days_per_week,renfo_weekly_target,nutrition_products,nutrition_no_caffeine')
        .eq('id', user.id)
        .single()
      return data as SettingsRow | null
    },
    enabled: !!user,
  })

  // Réglages coach/renfo — patch partiel sur profiles.
  const settingsMut = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-settings-page', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['profile-full', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['profile-sessions'] })
    },
  })

  if (profileRow && !nutritionLoaded) {
    setNutritionProducts(profileRow.nutrition_products ?? [])
    setNutritionLoaded(true)
  }

  function toggleNutritionProduct(id: string) {
    setNutritionProducts((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function saveNutritionProducts() {
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({ id: user.id, nutrition_products: nutritionProducts })
    if (!error) {
      setNutritionSaved(true)
      setTimeout(() => setNutritionSaved(false), 2500)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['profile-full', user?.id] })
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
      setShowPwdInput(false)
      setTimeout(() => setPwdMsg(''), 3000)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        RÉGLAGES
      </div>

      <ProfileTabs />

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vl-line)', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button data-tour="settings-app" style={tabStyle(activeTab === 'reglages')} onClick={() => setActiveTab('reglages')}>RÉGLAGES</button>
        <button data-tour="profile-nutrition" style={tabStyle(activeTab === 'nutrition')} onClick={() => setActiveTab('nutrition')}>NUTRITION</button>
      </div>

      {/* ── Tab RÉGLAGES ── */}
      {activeTab === 'reglages' && (() => {
        const motivation = (profileRow?.coach_motivation ?? 'mix') as CoachMotivation
        const days = profileRow?.coach_days_per_week ?? 5
        const renfoTarget = profileRow?.renfo_weekly_target ?? 3
        const segWrap: CSSProperties = { display: 'flex', gap: 1, background: 'var(--vl-line)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden', flexWrap: 'wrap' }
        const seg = (on: boolean): CSSProperties => ({
          border: 'none', cursor: on ? 'default' : 'pointer', padding: '7px 14px', minWidth: 0,
          background: on ? 'var(--vl-ember)' : 'var(--vl-surf-2)', color: on ? 'var(--vl-ink)' : 'var(--vl-text-2)',
          fontFamily: 'var(--vl-display)', fontWeight: 700, fontSize: '.8rem', letterSpacing: '.04em', textTransform: 'uppercase',
        })
        return (
          <>
            {/* Connexion Strava */}
            <div data-tour="settings-strava" className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 8 }}>CONNEXION STRAVA</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Connecte ta montre : Vorcelab analyse tes sorties et estime ta VO2max. Tu peux forcer une synchro ou te déconnecter ici.
              </p>
              <StravaConnection variant="full" />
            </div>

            {/* Orientation coach */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 4 }}>ORIENTATION COACH</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Comment tu veux t'entraîner — ça ajuste le volume et l'intensité de ton plan.
              </p>
              <div style={segWrap}>
                {(['plaisir', 'mix', 'performance'] as CoachMotivation[]).map((m) => (
                  <button key={m} style={seg(motivation === m)} onClick={() => motivation !== m && settingsMut.mutate({ coach_motivation: m })}>
                    {MOTIVATION_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Course */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 4 }}>COURSE</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Jours de course disponibles par semaine — calibre le nombre de séances du plan.
              </p>
              <div style={segWrap}>
                {[3, 4, 5, 6].map((n) => (
                  <button key={n} style={seg(days === n)} onClick={() => days !== n && settingsMut.mutate({ coach_days_per_week: n })}>{n} j</button>
                ))}
              </div>
              <Link to="/race" style={{ textDecoration: 'none' }}>
                <div className="mlabel" style={{ color: 'var(--vl-ember)', marginTop: 14, fontSize: 11 }}>Calendrier des courses →</div>
              </Link>
            </div>

            {/* Renfo */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 4 }}>RENFORCEMENT</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Objectif de séances de renfo par semaine.
              </p>
              <div style={segWrap}>
                {[2, 3, 4, 5].map((n) => (
                  <button key={n} style={seg(renfoTarget === n)} onClick={() => renfoTarget !== n && settingsMut.mutate({ renfo_weekly_target: n })}>{n}/sem</button>
                ))}
              </div>
              <Link to="/renfo/library" style={{ textDecoration: 'none' }}>
                <div className="mlabel" style={{ color: 'var(--vl-ember)', marginTop: 14, fontSize: 11 }}>Bibliothèque d'exercices →</div>
              </Link>
            </div>

            {/* 1RM (force) : voir / saisir / estimer par test */}
            <OneRMSettingsCard />

            {/* Éditeur de matériel renfo (maison / salle), intégré ici */}
            <div className="clabel" style={{ margin: '1.25rem 0 0.6rem', color: '#a78bfa', letterSpacing: '.12em' }}>MATÉRIEL RENFO</div>
            <RenfoEquipmentEditor />

            {/* Abonnement PRO : statut, upgrade, gestion via portail Stripe */}
            <SubscriptionCard />

            {/* Card COMPTE */}
            <div className="card" style={{ margin: '1.25rem 0 1rem' }}>
              <div className="clabel" style={{ marginBottom: '0.75rem' }}>COMPTE</div>

              {/* Avatar */}
              <div style={{ marginBottom: '0.75rem' }}>
                {profileRow?.avatar_url ? (
                  <img
                    src={profileRow.avatar_url}
                    alt="avatar"
                    style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => {
                      const parent = (e.target as HTMLImageElement).parentElement
                      if (parent) {
                        (e.target as HTMLImageElement).style.display = 'none'
                        const fb = document.createElement('div')
                        fb.style.cssText = 'width:56px;height:56px;border-radius:50%;background:var(--vl-ember);display:flex;align-items:center;justify-content:center;font-family:var(--vl-display);font-size:1.4rem;color:#fff;letter-spacing:.04em'
                        fb.textContent = (profileRow?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()
                        parent.prepend(fb)
                      }
                    }}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--vl-ember)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--vl-display)', fontSize: '1.4rem', color: '#fff', letterSpacing: '.04em' }}>
                    {(profileRow?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="fg">
                <span className="fl">EMAIL</span>
                <input
                  className="fi"
                  type="email"
                  value={user?.email ?? ''}
                  readOnly
                  disabled
                />
              </div>

              {/* Password change */}
              <div style={{ marginTop: '0.75rem' }}>
                {!showPwdInput ? (
                  <button
                    className="hbtn"
                    onClick={() => setShowPwdInput(true)}
                  >
                    🔑 Changer le mot de passe
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      className="fi"
                      type="password"
                      placeholder="Nouveau mot de passe"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="hbtn" onClick={handlePwdChange}>Confirmer</button>
                      <button
                        className="hbtn"
                        style={{ background: 'var(--vl-bg-2)', color: 'var(--vl-text-3)' }}
                        onClick={() => { setShowPwdInput(false); setNewPwd('') }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
                {pwdMsg && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--vl-growth)', fontFamily: 'var(--vl-mono)' }}>
                    {pwdMsg}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Tab NUTRITION ── */}
      {activeTab === 'nutrition' && (
        <>
        {/* Préférences nutrition */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: 8 }}>PRÉFÉRENCES</div>
          {(() => {
            const noCaf = profileRow?.nutrition_no_caffeine === true
            return (
              <button
                onClick={() => settingsMut.mutate({ nutrition_no_caffeine: !noCaf })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%',
                  background: 'transparent', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)',
                  padding: '11px 13px', cursor: 'pointer', textAlign: 'left', color: 'var(--vl-text)',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>Sans caféine</span>
                  <span style={{ fontSize: 11, color: 'var(--vl-text-3)' }}>Le plan de course évite les produits caféinés (et le cola).</span>
                </span>
                <span style={{
                  flexShrink: 0, width: 42, height: 24, borderRadius: 12, position: 'relative', transition: 'background .15s',
                  background: noCaf ? 'var(--vl-ember)' : 'var(--vl-line)',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: noCaf ? 20 : 2, width: 20, height: 20, borderRadius: '50%',
                    background: '#fff', transition: 'left .15s',
                  }} />
                </span>
              </button>
            )
          })()}
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div className="clabel" style={{ margin: 0 }}>MES PRODUITS NUTRITION</div>
            <button className="hbtn" style={{ fontSize: 10, padding: '4px 10px' }} onClick={saveNutritionProducts}>
              {nutritionSaved ? 'Enregistré ✓' : 'Enregistrer'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Coche les produits que tu utilises. Ils alimentent ton plan de ravitaillement dans la stratégie de course.
            <span style={{ color: 'var(--vl-text-2)' }}> {nutritionProducts.length} sélectionné{nutritionProducts.length > 1 ? 's' : ''}.</span>
          </p>
          {isLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nutritionBrands().map(({ brand, products }) => {
                const open = openBrand === brand
                const selCount = products.filter((p) => nutritionProducts.includes(p.id)).length
                return (
                  <div key={brand} style={{ border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden' }}>
                    <button
                      onClick={() => setOpenBrand(open ? null : brand)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        background: open ? 'var(--vl-surf-2)' : 'transparent', border: 'none', cursor: 'pointer',
                        padding: '11px 13px', textAlign: 'left', color: 'var(--vl-text)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '.01em' }}>{brand}</span>
                        {selCount > 0 && (
                          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-ember)', background: 'color-mix(in oklab, var(--vl-ember) 12%, transparent)', borderRadius: 4, padding: '1px 6px' }}>
                            {selCount} ✓
                          </span>
                        )}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>{products.length} produit{products.length > 1 ? 's' : ''}</span>
                        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                      </span>
                    </button>
                    {open && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 13px 10px' }}>
                        {products.map((p) => {
                          const checked = nutritionProducts.includes(p.id)
                          return (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 0', color: checked ? 'var(--vl-text)' : 'var(--vl-text-2)' }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleNutritionProduct(p.id)} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                {p.name}
                                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginLeft: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>{NUTRITION_TYPE_LABELS[p.type]}</span>
                              </span>
                              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', whiteSpace: 'nowrap' }}>
                                {p.carbs}g{p.per ? `/${p.per}` : ''}{p.caffeine ? ` · ${p.caffeine}mg caf` : ''}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
      )}

      {/* Logout */}
      <button
        className="hbtn"
        style={{ marginTop: '1.5rem' }}
        onClick={() => { localStorage.removeItem('vl-had-session'); supabase.auth.signOut() }}
      >
        Se déconnecter
      </button>

      {/* Légal */}
      <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--vl-line)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <Link to="/legal/cgu" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>CGU / CGV</Link>
        <Link to="/legal/confidentialite" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Confidentialité</Link>
        <a href="mailto:hello@vorcelab.com" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Contact</a>
      </div>
    </>
  )
}
