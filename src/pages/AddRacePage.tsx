import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'

// Création d'une course (objectif) → insertion dans race_calendar. Remplace l'ancien
// stub désactivé : la course n'était jusqu'ici créable que via l'onboarding.

type RaceType = 'Route' | 'Trail'
type Priority = 'A' | 'B' | 'C'

const PRIORITIES: { value: Priority; label: string; note: string }[] = [
  { value: 'A', label: 'A — Objectif majeur', note: 'la prépa s’oriente entièrement vers cette course' },
  { value: 'B', label: 'B — Important', note: 'mini-affûtage, sans casser le bloc' },
  { value: 'C', label: 'C — Préparation', note: 'course-test, intégrée à l’entraînement' },
]

export default function AddRacePage() {
  const { user } = useVLStore()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [type, setType] = useState<RaceType>('Trail')
  const [distance, setDistance] = useState('')
  const [elevation, setElevation] = useState('')
  const [startTime, setStartTime] = useState('')
  const [priority, setPriority] = useState<Priority>('A')

  const km = parseFloat(distance.replace(',', '.'))
  const valid = !!name.trim() && !!date && km > 0

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('non connecté')
      const { error } = await supabase.from('race_calendar').insert({
        user_id: user.id,
        name: name.trim(),
        date,
        distance: km,
        elevation: elevation ? parseInt(elevation, 10) : 0,
        type,
        priority,
        start_time: startTime || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['races'] })
      qc.invalidateQueries({ queryKey: ['coach'] })
      navigate('/race')
    },
  })

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.08em',
    color: 'var(--vl-text-3)', textTransform: 'uppercase', marginBottom: 6, display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--vl-surf-2)',
    border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)',
    padding: '10px 12px', color: 'var(--vl-text)', fontSize: '.95rem', fontFamily: 'var(--vl-body, inherit)',
  }

  return (
    <div style={{ paddingBottom: '2rem', maxWidth: 540 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate('/race')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vl-text-2)', fontSize: '1.2rem', padding: '4px 6px' }}
          aria-label="Retour"
        >
          ←
        </button>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 700 }}>
          Ajouter une course
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Nom */}
        <div>
          <label style={labelStyle} htmlFor="race-name">Nom de la course</label>
          <input id="race-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Trail des Cimes" autoFocus />
        </div>

        {/* Date */}
        <div>
          <label style={labelStyle} htmlFor="race-date">Date</label>
          <input id="race-date" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {/* Type */}
        <div>
          <span style={labelStyle}>Type</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['Trail', 'Route'] as RaceType[]).map((t) => (
              <button key={t} onClick={() => setType(t)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 'var(--vl-r-sm)', cursor: 'pointer',
                  fontFamily: 'var(--vl-display)', fontWeight: 700, fontSize: '.9rem',
                  border: `1px solid ${type === t ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                  background: type === t ? 'var(--vl-ember)' : 'var(--vl-surf-2)',
                  color: type === t ? 'var(--vl-ink)' : 'var(--vl-text-2)',
                }}>
                {t === 'Trail' ? '⛰ Trail' : '→ Route'}
              </button>
            ))}
          </div>
        </div>

        {/* Distance + D+ */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="race-dist">Distance (km)</label>
            <input id="race-dist" type="number" inputMode="decimal" min="0" step="0.1" style={inputStyle}
              value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="42.2" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="race-elev">Dénivelé D+ (m)</label>
            <input id="race-elev" type="number" inputMode="numeric" min="0" step="10" style={inputStyle}
              value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="0" />
          </div>
        </div>

        {/* Heure de départ */}
        <div>
          <label style={labelStyle} htmlFor="race-start">Heure de départ <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span></label>
          <input id="race-start" type="time" style={inputStyle}
            value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--vl-text-3)', marginTop: 4 }}>Affine la météo à J-10 (chaleur, nuit, vent).</div>
        </div>

        {/* Priorité */}
        <div>
          <span style={labelStyle}>Priorité</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRIORITIES.map((p) => (
              <button key={p.value} onClick={() => setPriority(p.value)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--vl-r-sm)', cursor: 'pointer',
                  border: `1px solid ${priority === p.value ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                  background: priority === p.value ? 'var(--vl-surf-2)' : 'transparent',
                }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontWeight: 700, fontSize: '.9rem', color: priority === p.value ? 'var(--vl-ember)' : 'var(--vl-text)' }}>
                  {p.label}
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--vl-text-3)', marginTop: 2 }}>{p.note}</div>
              </button>
            ))}
          </div>
        </div>

        {mut.isError && (
          <div style={{ color: 'var(--vl-status-bad, #d66)', fontSize: '.85rem' }}>
            Impossible d’enregistrer la course. Réessaie.
          </div>
        )}

        {/* Submit */}
        <button
          onClick={() => mut.mutate()}
          disabled={!valid || mut.isPending}
          style={{
            marginTop: 4, padding: '12px', borderRadius: 'var(--vl-r-sm)', border: 'none',
            fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '1rem', letterSpacing: '.03em',
            cursor: valid && !mut.isPending ? 'pointer' : 'not-allowed',
            background: valid ? 'var(--vl-ember)' : 'var(--vl-line)',
            color: valid ? 'var(--vl-ink)' : 'var(--vl-text-3)',
            opacity: mut.isPending ? 0.7 : 1,
          }}>
          {mut.isPending ? 'Enregistrement…' : 'Ajouter la course'}
        </button>
      </div>
    </div>
  )
}
