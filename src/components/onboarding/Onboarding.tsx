import { useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import { startStravaOAuth, stravaConfigured } from '../../lib/strava'

// Onboarding global — 1re prise en main (création du profil + objectif + mise en
// avant de la Stratégie de course). Persistance par étape. AUCUN emoji (SVG only).
// « Passer » et l'achèvement posent profiles.onboarding_done = true.

interface IconProps { size?: number }
const sx = (s: number) => ({ width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })
const IUser = ({ size = 22 }: IconProps) => <svg {...sx(size)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
const IHeart = ({ size = 22 }: IconProps) => <svg {...sx(size)}><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>
const ILink = ({ size = 22 }: IconProps) => <svg {...sx(size)}><path d="M9 15l6-6" /><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1" /><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1" /></svg>
const IFlag = ({ size = 22 }: IconProps) => <svg {...sx(size)}><path d="M5 21V4" /><path d="M5 4h11l-1.5 3L16 10H5" /></svg>
const IStrategy = ({ size = 22 }: IconProps) => <svg {...sx(size)}><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v16M15 6v16" /></svg>
const ICheck = ({ size = 18 }: IconProps) => <svg {...sx(size)}><path d="M4 12.5l5 5 11-11" /></svg>

const DISTANCES = [
  { label: '5 km', km: 5 }, { label: '10 km', km: 10 },
  { label: 'Semi (21,1)', km: 21.1 }, { label: 'Marathon (42,2)', km: 42.2 },
  { label: 'Trail / autre', km: 0 },
]

type StepKey = 'intro' | 'profil' | 'perfs' | 'strava' | 'objectif' | 'strategie'
const STEPS: StepKey[] = ['intro', 'profil', 'perfs', 'strava', 'objectif', 'strategie']

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { user } = useVLStore()
  const navigate = useNavigate()
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)

  // Profil
  const [name, setName] = useState('')
  const [sex, setSex] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  // Perfs
  const [vo2max, setVo2max] = useState('')
  const [fcMax, setFcMax] = useState('')
  // Objectif
  const [raceName, setRaceName] = useState('')
  const [raceKm, setRaceKm] = useState<number | null>(null)
  const [raceKmCustom, setRaceKmCustom] = useState('')
  const [raceDate, setRaceDate] = useState('')

  const step = STEPS[i]
  const isLast = i === STEPS.length - 1

  async function persistStep() {
    if (!user) return
    if (step === 'profil') {
      await supabase.from('profiles').upsert({
        id: user.id,
        name: name || null, sex: sex || null, birthdate: birthdate || null,
        weight: weight ? parseFloat(weight) : null, height: height ? parseInt(height) : null,
      })
    } else if (step === 'perfs') {
      await supabase.from('profiles').upsert({
        id: user.id,
        vo2max: vo2max ? parseFloat(vo2max) : null, fc_max: fcMax ? parseInt(fcMax) : null,
      })
    } else if (step === 'objectif') {
      const km = raceKm === 0 ? parseFloat(raceKmCustom) : raceKm
      if (km && raceDate) {
        await supabase.from('race_calendar').insert({
          user_id: user.id, name: raceName || 'Mon objectif',
          date: raceDate, distance: km, elevation: 0, type: raceKm === 0 ? 'Trail' : 'Route',
        })
      }
    }
  }

  async function finish() {
    if (!user) { onDone(); return }
    await supabase.from('profiles').upsert({ id: user.id, onboarding_done: true })
    onDone()
  }

  async function next() {
    setBusy(true)
    try { await persistStep() } catch { /* best-effort, on n'empêche pas d'avancer */ }
    setBusy(false)
    if (isLast) finish()
    else setI((n) => n + 1)
  }

  async function skipAll() {
    setBusy(true)
    await finish()
    setBusy(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--vl-bg, #0b0d11)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '28px 20px 40px', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Progress + passer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {STEPS.map((s, n) => (
              <div key={s} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 4, background: n <= i ? 'var(--vl-ember)' : 'var(--vl-line, #2a2e36)', transition: 'all .2s' }} />
            ))}
          </div>
          <button className="auth-link" onClick={skipAll} disabled={busy} style={{ fontSize: 12 }}>
            Passer
          </button>
        </div>

        <div style={{ flex: 1 }}>
          {step === 'intro' && (
            <StepShell icon={<IStrategy size={26} />} title="Bienvenue sur Vorcelab" sub="Le laboratoire du coureur">
              <p style={pStyle}>
                On configure ton profil en 1 minute pour personnaliser ton coaching,
                tes allures et ta <strong>stratégie de course</strong>. Tu peux passer à tout moment.
              </p>
            </StepShell>
          )}

          {step === 'profil' && (
            <StepShell icon={<IUser size={26} />} title="Ton profil" sub="Pour personnaliser charges et allures">
              <input className="fi" placeholder="Prénom / nom" value={name} onChange={(e) => setName(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                {['H', 'F'].map((s) => (
                  <button key={s} className="hbtn" onClick={() => setSex(s)} style={{ flex: 1, borderColor: sex === s ? 'var(--vl-ember)' : undefined }}>
                    {s === 'H' ? 'Homme' : 'Femme'}
                  </button>
                ))}
              </div>
              <label style={labelStyle}>Date de naissance</label>
              <input className="fi" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="fi" type="number" placeholder="Poids (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} />
                <input className="fi" type="number" placeholder="Taille (cm)" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
            </StepShell>
          )}

          {step === 'perfs' && (
            <StepShell icon={<IHeart size={26} />} title="Tes perfs" sub="Pour calculer tes allures (VDOT)">
              <p style={pStyle}>Renseigne ce que tu connais — tout est optionnel et modifiable plus tard.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="fi" type="number" placeholder="VO2max" value={vo2max} onChange={(e) => setVo2max(e.target.value)} />
                <input className="fi" type="number" placeholder="FC max (bpm)" value={fcMax} onChange={(e) => setFcMax(e.target.value)} />
              </div>
              <p style={{ ...pStyle, fontSize: 12, color: 'var(--vl-text-3)' }}>
                Pas de VO2max ? Connecte Strava (étape suivante) : Vorcelab l'estime à partir de tes courses.
              </p>
            </StepShell>
          )}

          {step === 'strava' && (
            <StepShell icon={<ILink size={26} />} title="Connecte ta montre" sub="Strava — synchronise tes activités">
              <p style={pStyle}>
                En connectant <strong>Strava</strong>, Vorcelab analyse tes sorties (allure, FC, dérive cardiaque, D+)
                pour estimer ta forme, tes points faibles et adapter ton plan automatiquement.
              </p>
              {stravaConfigured() ? (
                <button className="btn-primary" onClick={startStravaOAuth} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ILink size={16} /> Connecter Strava
                </button>
              ) : (
                <p style={{ ...pStyle, fontSize: 12, color: 'var(--vl-text-3)' }}>
                  Connexion Strava bientôt disponible. Cette étape est optionnelle.
                </p>
              )}
              <p style={{ ...pStyle, fontSize: 12, color: 'var(--vl-text-3)' }}>
                Tu pourras aussi (re)connecter Strava plus tard depuis le menu. Étape optionnelle.
              </p>
            </StepShell>
          )}

          {step === 'objectif' && (
            <StepShell icon={<IFlag size={26} />} title="Ton objectif" sub="Vorcelab construit ton plan autour">
              <input className="fi" placeholder="Nom de la course (optionnel)" value={raceName} onChange={(e) => setRaceName(e.target.value)} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DISTANCES.map((d) => (
                  <button key={d.label} className="hbtn" onClick={() => setRaceKm(d.km)} style={{ borderColor: raceKm === d.km ? 'var(--vl-ember)' : undefined }}>
                    {d.label}
                  </button>
                ))}
              </div>
              {raceKm === 0 && (
                <input className="fi" type="number" placeholder="Distance (km)" value={raceKmCustom} onChange={(e) => setRaceKmCustom(e.target.value)} />
              )}
              <label style={labelStyle}>Date de la course</label>
              <input className="fi" type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
            </StepShell>
          )}

          {step === 'strategie' && (
            <StepShell icon={<IStrategy size={26} />} title="La Stratégie de course" sub="La fonction phare de Vorcelab">
              <p style={pStyle}>
                C'est <strong>le</strong> cœur de Vorcelab : pour chaque course, on construit ton
                <strong> plan de course</strong> — allure cible km par km selon le profil (D+/D−),
                tes <strong>ravitaillements</strong>, ta gestion de l'effort et un objectif de temps réaliste.
              </p>
              <p style={pStyle}>
                Le jour J, tu sais exactement à quelle allure courir chaque section pour finir fort
                sans exploser. Tu peux même la partager à ton équipe d'assistance.
              </p>
              <p style={{ ...pStyle, fontSize: 12, color: 'var(--vl-text-3)' }}>
                Crée une course puis ouvre « Stratégie » pour la générer.
              </p>
            </StepShell>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {i > 0 && (
            <button className="hbtn" onClick={() => setI((n) => n - 1)} disabled={busy} style={{ flex: '0 0 auto' }}>
              Retour
            </button>
          )}
          <button className="btn-primary" onClick={next} disabled={busy} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {isLast ? (<><ICheck size={16} /> Terminer</>) : busy ? 'Enregistrement…' : 'Continuer'}
          </button>
        </div>

        {step === 'strategie' && (
          <button
            className="auth-link"
            onClick={async () => { await finish(); navigate('/race') }}
            disabled={busy}
            style={{ marginTop: 12, textAlign: 'center' }}
          >
            Terminer et créer ma course
          </button>
        )}
      </div>
    </div>
  )
}

const pStyle = { margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: 'var(--vl-text-2)' } as const
const labelStyle = { display: 'block', fontSize: 11, color: 'var(--vl-text-3)', margin: '4px 0 2px', letterSpacing: '.04em' } as const

function StepShell({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'color-mix(in srgb, var(--vl-ember) 14%, transparent)', color: 'var(--vl-ember)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: 26, color: 'var(--vl-text)', lineHeight: 1.1 }}>{title}</div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--vl-text-3)', margin: '6px 0 18px' }}>{sub}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}
