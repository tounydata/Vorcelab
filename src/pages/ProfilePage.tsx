import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import { isRun, fmtD } from '../utils/formatters'

const PAIN_ZONES = [
  { key: 'knee',       label: 'Genou' },
  { key: 'achilles',   label: "Tendon d'Achille" },
  { key: 'hip',        label: 'Hanche / ITB' },
  { key: 'plantar',    label: 'Fascia plantaire' },
  { key: 'shin',       label: 'Périostite tibiale' },
  { key: 'lower_back', label: 'Bas du dos' },
  { key: 'hamstring',  label: 'Ischio-jambiers' },
  { key: 'calf',       label: 'Mollet' },
]

const PR_DISTS = [
  { key: '5k',       label: '5 km',     dist: 5000 },
  { key: '10k',      label: '10 km',    dist: 10000 },
  { key: '15k',      label: '15 km',    dist: 15000 },
  { key: 'semi',     label: 'Semi',     dist: 21097 },
  { key: 'marathon', label: 'Marathon', dist: 42195 },
]

function parsePRTime(str: string): number | null {
  if (!str.trim()) return null
  const p = str.trim().split(':').map(Number)
  if (p.some(isNaN)) return null
  if (p.length === 2) return p[0] * 60 + p[1]
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]
  return null
}

type Tab = 'profil' | 'prs' | 'compte'

interface RawProfile {
  name?: string
  birthdate?: string
  sex?: string
  weight?: number
  height?: number
  vo2max?: number
  fc_max?: number
  lactate_threshold?: number
  lactate_pace?: string
  goals?: string
  pain_zones?: string[]
  nutrition_level?: string
  avatar_url?: string
  prs?: Record<string, { time: string; date?: string; timeS: number; dist: number; dplus?: number }>
}

function Input({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '8px 10px', color: 'var(--vl-text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
      />
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '8px 10px', color: 'var(--vl-text-1)', outline: 'none' }}
      >
        <option value="">—</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}

export function ProfilePage() {
  const user = useVLStore(s => s.user)
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('profil')
  const [saveMsg, setSaveMsg] = useState('')
  const [prMsg, setPrMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const avatarRef = useRef<HTMLInputElement>(null)

  // Form state — profil
  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [sex, setSex] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [vo2max, setVo2max] = useState('')
  const [fcMax, setFcMax] = useState('')
  const [lactate, setLactate] = useState('')
  const [lactatePace, setLactatePace] = useState('')
  const [goals, setGoals] = useState('')
  const [painZones, setPainZones] = useState<string[]>([])
  const [nutritionLevel, setNutritionLevel] = useState('')

  // Form state — PRs
  const [prs, setPrs] = useState<Record<string, { time: string; date: string }>>({})
  const [ultraTime, setUltraTime] = useState('')
  const [ultraDate, setUltraDate] = useState('')
  const [ultraDist, setUltraDist] = useState('')
  const [ultraDp, setUltraDp] = useState('')

  const [profileLoaded, setProfileLoaded] = useState(false)

  const { data: profile } = useQuery<RawProfile>({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      return (data as RawProfile | null) ?? {}
    },
    enabled: !!user,
  })

  useEffect(() => {
    if (!profile || profileLoaded) return
    setProfileLoaded(true)
    setName(profile.name ?? '')
    setBirthdate(profile.birthdate ?? '')
    setSex(profile.sex ?? '')
    setWeight(profile.weight != null ? String(profile.weight) : '')
    setHeight(profile.height != null ? String(profile.height) : '')
    setVo2max(profile.vo2max != null ? String(profile.vo2max) : '')
    setFcMax(profile.fc_max != null ? String(profile.fc_max) : '')
    setLactate(profile.lactate_threshold != null ? String(profile.lactate_threshold) : '')
    setLactatePace(profile.lactate_pace ?? '')
    setGoals(profile.goals ?? '')
    setPainZones(profile.pain_zones ?? [])
    setNutritionLevel(profile.nutrition_level ?? '')
    if (profile.prs) {
      const entries: Record<string, { time: string; date: string }> = {}
      for (const k of PR_DISTS.map(d => d.key)) {
        entries[k] = { time: profile.prs![k]?.time ?? '', date: profile.prs![k]?.date ?? '' }
      }
      setPrs(entries)
      setUltraTime(profile.prs['ultra']?.time ?? '')
      setUltraDate(profile.prs['ultra']?.date ?? '')
      setUltraDist(profile.prs['ultra']?.dist != null ? String(profile.prs['ultra'].dist / 1000) : '')
      setUltraDp(profile.prs['ultra']?.dplus != null ? String(profile.prs['ultra'].dplus) : '')
    }
  }, [profile, profileLoaded])

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('strava_activities').select('*').eq('user_id', user!.id).is('deleted_at', null).order('start_date', { ascending: false }).limit(500)
      return (data || []).filter(r => isRun(r.type as string)).map(mapDbActivity)
    },
    enabled: !!user,
  })

  const saveMut = useMutation({
    mutationFn: async () => {
      const age = birthdate ? Math.floor((Date.now() - new Date(birthdate).getTime()) / 31557600000) : null
      const { error } = await supabase.from('profiles').upsert({
        id: user!.id,
        name: name || null,
        birthdate: birthdate || null,
        age,
        sex: sex || null,
        weight: parseFloat(weight) || null,
        height: parseFloat(height) || null,
        vo2max: parseFloat(vo2max) || null,
        fc_max: parseInt(fcMax) || null,
        lactate_threshold: parseInt(lactate) || null,
        lactate_pace: lactatePace || null,
        goals: goals || null,
        pain_zones: painZones,
        nutrition_level: nutritionLevel || null,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess() {
      qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      setSaveMsg('Profil sauvegardé ✓')
      setTimeout(() => setSaveMsg(''), 3000)
    },
    onError() { setSaveMsg('Erreur sauvegarde') },
  })

  const savePrsMut = useMutation({
    mutationFn: async () => {
      const out: Record<string, unknown> = {}
      for (const { key, dist } of PR_DISTS) {
        const t = prs[key]?.time ?? ''
        const s = parsePRTime(t)
        if (s !== null) out[key] = { time: t, date: prs[key]?.date || null, timeS: s, dist }
      }
      const us = parsePRTime(ultraTime)
      const ud = parseFloat(ultraDist)
      if (us !== null && ud > 0) {
        out['ultra'] = { time: ultraTime, timeS: us, dist: ud * 1000, dplus: parseInt(ultraDp) || 0, date: ultraDate || null }
      }
      const { error } = await supabase.from('profiles').upsert({ id: user!.id, prs: out, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess() {
      qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      setPrMsg('PRs sauvegardés ✓')
      setTimeout(() => setPrMsg(''), 3000)
    },
    onError() { setPrMsg('Erreur sauvegarde') },
  })

  const changePasswordMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(user!.email!, {
        redirectTo: window.location.origin + window.location.pathname,
      })
      if (error) throw error
    },
    onSuccess() { setPwMsg('Email envoyé ✓') },
    onError() { setPwMsg('Erreur envoi') },
  })

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const path = `${user!.id}/avatar.jpg`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (error) return
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').upsert({ id: user!.id, avatar_url: data.publicUrl })
    qc.invalidateQueries({ queryKey: ['profile', user?.id] })
  }

  function togglePain(key: string) {
    setPainZones(z => z.includes(key) ? z.filter(k => k !== key) : [...z, key])
  }

  const totalKm = activities.reduce((s, a) => s + a.distance / 1000, 0)
  const totalDp = activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)
  const totalTime = activities.reduce((s, a) => s + a.moving_time, 0)
  const longestRun = activities.reduce<typeof activities[0] | null>((b, a) => !b || a.distance > b.distance ? a : b, null)

  const btnStyle: React.CSSProperties = {
    fontFamily: 'var(--vl-mono)', fontSize: '.6rem', padding: '7px 16px', borderRadius: 6,
    cursor: 'pointer', border: '1px solid var(--vl-line)', background: 'none', color: 'var(--vl-text-2)',
  }
  const primaryBtn: React.CSSProperties = { ...btnStyle, background: 'var(--vl-ember)', border: 'none', color: '#fff', fontWeight: 700 }

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div
          onClick={() => avatarRef.current?.click()}
          style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--vl-surf-2)', border: '2px solid var(--vl-line)', overflow: 'hidden', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>PHOTO</span>
          }
        </div>
        <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
        <div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '.04em' }}>
            {name || profile?.name || user?.email?.split('@')[0]?.toUpperCase() || 'PROFIL'}
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginTop: 2 }}>{user?.email}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--vl-line)' }}>
        {(['profil', 'prs', 'compte'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', letterSpacing: '.08em', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? 'var(--vl-ember)' : 'var(--vl-text-3)', borderBottom: tab === t ? '2px solid var(--vl-ember)' : '2px solid transparent', marginBottom: -1 }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── TAB PROFIL ── */}
      {tab === 'profil' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="NOM / PRÉNOM" value={name} onChange={setName} placeholder="Tony" />
            <Input label="DATE DE NAISSANCE" value={birthdate} onChange={setBirthdate} type="date" />
            <Select label="SEXE" value={sex} onChange={setSex} options={[{ v: 'M', l: 'Homme' }, { v: 'F', l: 'Femme' }, { v: 'O', l: 'Autre' }]} />
            <Input label="POIDS (kg)" value={weight} onChange={setWeight} type="number" placeholder="70" />
            <Input label="TAILLE (cm)" value={height} onChange={setHeight} type="number" placeholder="175" />
          </div>

          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginTop: 4 }}>DONNÉES PHYSIOLOGIQUES</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="FC MAX (bpm)" value={fcMax} onChange={setFcMax} type="number" placeholder="185" />
            <Input label="VO2MAX (ml/kg/min)" value={vo2max} onChange={setVo2max} type="number" placeholder="55" />
            <Input label="SEUIL LACTIQUE (bpm)" value={lactate} onChange={setLactate} type="number" placeholder="162" />
            <Input label="ALLURE SEUIL (mm:ss/km)" value={lactatePace} onChange={setLactatePace} placeholder="4:10" />
          </div>

          <div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 10 }}>ZONES DE DOULEUR</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PAIN_ZONES.map(z => (
                <button
                  key={z.key}
                  onClick={() => togglePain(z.key)}
                  style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', transition: 'all .15s', background: painZones.includes(z.key) ? 'rgba(229,86,42,.15)' : 'var(--vl-surf-2)', border: `1px solid ${painZones.includes(z.key) ? 'var(--vl-ember)' : 'var(--vl-line)'}`, color: painZones.includes(z.key) ? 'var(--vl-ember)' : 'var(--vl-text-2)' }}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>OBJECTIFS</label>
            <textarea
              value={goals}
              onChange={e => setGoals(e.target.value)}
              rows={3}
              placeholder="Sub-3h marathon, ultra de 80km…"
              style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 6, padding: '8px 10px', color: 'var(--vl-text-1)', outline: 'none', resize: 'vertical' }}
            />
          </div>

          <Select label="NIVEAU NUTRITION" value={nutritionLevel} onChange={setNutritionLevel}
            options={[{ v: 'low', l: 'Basique' }, { v: 'standard', l: 'Standard' }, { v: 'high', l: 'Performance' }]}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={primaryBtn} onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? '…' : 'SAUVEGARDER'}
            </button>
            {saveMsg && <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: saveMsg.includes('✓') ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>{saveMsg}</span>}
          </div>

          {/* Career stats */}
          <div style={{ borderTop: '1px solid var(--vl-line)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 12 }}>
              STATS CARRIÈRE · {activities.length} SORTIES
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {[
                { label: 'KM TOTAL', value: Math.round(totalKm) + ' km', color: 'var(--vl-ember)' },
                { label: 'D+ TOTAL', value: Math.round(totalDp) + ' m', color: 'var(--vl-growth)' },
                { label: 'TEMPS TOTAL', value: fmtD(totalTime), color: undefined },
                { label: 'DIST. MOY.', value: (activities.length > 0 ? totalKm / activities.length : 0).toFixed(1) + ' km', color: undefined },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, color: s.color ?? 'var(--vl-text-1)' }}>{s.value}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {longestRun && (
              <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', marginTop: 8 }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 4 }}>PLUS LONGUE SORTIE</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', fontWeight: 600 }}>{longestRun.name}</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-ember)', marginTop: 2 }}>
                  {(longestRun.distance / 1000).toFixed(1)} km · {fmtD(longestRun.moving_time)}
                  {longestRun.total_elevation_gain > 0 ? ` · D+ ${Math.round(longestRun.total_elevation_gain)}m` : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB PRs ── */}
      {tab === 'prs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', lineHeight: 1.6 }}>
            Format : mm:ss (ex: 22:14) ou h:mm:ss (ex: 3:42:00)
          </div>

          {PR_DISTS.map(({ key, label, dist }) => (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8, alignItems: 'end' }}>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '.85rem', fontWeight: 700, color: 'var(--vl-ember)', paddingBottom: 8 }}>
                {label}
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.45rem', color: 'var(--vl-text-3)', fontWeight: 400 }}>{(dist / 1000).toFixed(3).replace(/\.?0+$/, '')} km</div>
              </div>
              <Input
                label="TEMPS"
                value={prs[key]?.time ?? ''}
                onChange={v => setPrs(p => ({ ...p, [key]: { ...p[key], time: v } }))}
                placeholder="h:mm:ss"
              />
              <Input
                label="DATE"
                value={prs[key]?.date ?? ''}
                onChange={v => setPrs(p => ({ ...p, [key]: { ...p[key], date: v } }))}
                type="date"
              />
            </div>
          ))}

          <div style={{ borderTop: '1px solid var(--vl-line)', paddingTop: 12 }}>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '.85rem', fontWeight: 700, color: 'var(--vl-ember)', marginBottom: 10 }}>
              Ultra
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', fontWeight: 400, marginLeft: 8 }}>distance libre</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Input label="TEMPS" value={ultraTime} onChange={setUltraTime} placeholder="h:mm:ss" />
              <Input label="DATE" value={ultraDate} onChange={setUltraDate} type="date" />
              <Input label="DISTANCE (km)" value={ultraDist} onChange={setUltraDist} type="number" placeholder="80" />
              <Input label="D+ (m)" value={ultraDp} onChange={setUltraDp} type="number" placeholder="4200" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={primaryBtn} onClick={() => savePrsMut.mutate()} disabled={savePrsMut.isPending}>
              {savePrsMut.isPending ? '…' : 'SAUVEGARDER LES PRs'}
            </button>
            {prMsg && <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: prMsg.includes('✓') ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>{prMsg}</span>}
          </div>
        </div>
      )}

      {/* ── TAB COMPTE ── */}
      {tab === 'compte' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 6 }}>PHOTO DE PROFIL</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', overflow: 'hidden', flexShrink: 0 }}>
                {profile?.avatar_url && <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <button style={btnStyle} onClick={() => avatarRef.current?.click()}>Changer la photo</button>
            </div>
            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>

          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 10 }}>MOT DE PASSE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button style={btnStyle} onClick={() => changePasswordMut.mutate()} disabled={changePasswordMut.isPending}>
                {changePasswordMut.isPending ? '…' : 'Envoyer un lien de réinitialisation'}
              </button>
              {pwMsg && <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: pwMsg.includes('✓') ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>{pwMsg}</span>}
            </div>
          </div>

          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 10 }}>STRAVA</div>
            <StravaSection />
          </div>

          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 6 }}>DÉCONNEXION</div>
            <button
              style={{ ...btnStyle, color: 'var(--vl-ember)', borderColor: 'rgba(229,86,42,.3)' }}
              onClick={() => supabase.auth.signOut()}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const SUPA_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'

function StravaSection() {
  const user = useVLStore(s => s.user)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  async function connectStrava() {
    const state = crypto.randomUUID()
    sessionStorage.setItem('strava_oauth_state', state)
    const params = new URLSearchParams({
      client_id: '149529',
      redirect_uri: window.location.origin + window.location.pathname,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all',
      state,
    })
    window.location.href = 'https://www.strava.com/oauth/authorize?' + params
  }

  async function syncStrava() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: '{}',
      })
      setSyncMsg(r.ok ? 'Sync lancé ✓' : 'Erreur sync')
    } catch { setSyncMsg('Erreur sync') }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(''), 3000) }
  }

  if (!user) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: '#FC4C02', border: 'none', color: '#fff', fontWeight: 700 }}
        onClick={connectStrava}
      >
        Connecter Strava
      </button>
      <button
        style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: 'none', border: '1px solid var(--vl-line)', color: 'var(--vl-text-2)' }}
        onClick={syncStrava}
        disabled={syncing}
      >
        {syncing ? '…' : 'Sync activités'}
      </button>
      {syncMsg && <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: syncMsg.includes('✓') ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>{syncMsg}</span>}
    </div>
  )
}
