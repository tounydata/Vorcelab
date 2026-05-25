import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { supabase } from '../lib/supabase'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
  goal_time: string | null
  gpx_data: unknown | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function RaceStrategyPage() {
  const { raceId } = useParams<{ raceId: string }>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: race, isLoading, isError } = useQuery<Race>({
    queryKey: ['race', raceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type,goal_time,gpx_data')
        .eq('id', raceId!)
        .single()
      if (error) throw error
      return data as Race
    },
    enabled: !!raceId,
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      const pts = Array.from(doc.querySelectorAll('trkpt'))
      if (pts.length < 2) return
      // Phase 1 : analyse GPX complète
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  if (isLoading) {
    return (
      <>
        <Link to="/race" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none', color: 'var(--vl-text-3)' }}>
          ← Stratégies
        </Link>
        <div className="loading">
          <div className="spinner" />
          <span className="mlabel">Chargement…</span>
        </div>
      </>
    )
  }

  if (isError || !race) {
    return (
      <>
        <Link to="/race" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none', color: 'var(--vl-text-3)' }}>
          ← Stratégies
        </Link>
        <div className="mlabel">Course introuvable.</div>
      </>
    )
  }

  return (
    <>
      <Link to="/race" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none', color: 'var(--vl-text-3)' }}>
        ← Stratégies
      </Link>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', letterSpacing: '0.02em', lineHeight: 1, marginBottom: 4 }}>
          {race.name}
        </div>
        <div className="race-meta">
          {formatDate(race.date)}
          {race.distance && ` · ${race.distance} km`}
          {race.elevation && ` · ↑${race.elevation} m`}
          {race.type && ` · ${race.type}`}
        </div>
        {race.goal_time && (
          <div className="mlabel" style={{ marginTop: 6, color: 'var(--vl-ember)' }}>
            Objectif : {race.goal_time}
          </div>
        )}
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <div className="clabel" style={{ marginBottom: '1rem' }}>CHARGER LE GPX</div>
        <div className="mlabel" style={{ marginBottom: '1.25rem', color: 'var(--vl-text-3)' }}>
          Importez le fichier GPX de la course pour générer votre stratégie personnalisée
        </div>
        <button className="hbtn" onClick={() => fileInputRef.current?.click()}>
          Sélectionner un fichier .gpx
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </>
  )
}
