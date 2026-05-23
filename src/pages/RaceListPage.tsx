import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbRace } from '../types/race'
import { fmtD } from '../utils/formatters'
import { ProjectionChart } from '../components/ProjectionChart'

type Race = ReturnType<typeof mapDbRace>

interface FormData {
  name: string
  date: string
  type: 'Trail' | 'Route'
  distance_km: string
  goal_time: string
}

const EMPTY_FORM: FormData = { name: '', date: '', type: 'Trail', distance_km: '', goal_time: '' }

export function RaceListPage() {
  const user = useVLStore(s => s.user)
  const qc = useQueryClient()
  const [editRace, setEditRace] = useState<Race | 'new' | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: races = [], isLoading } = useQuery({
    queryKey: ['races', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id, name, date, type, distance, goal_time, last_projection')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapDbRace(r as Record<string, unknown>))
    },
    enabled: !!user,
  })

  const upsertMutation = useMutation({
    mutationFn: async (form: FormData & { id?: string }) => {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        type: form.type,
        distance: form.distance_km ? Math.round(parseFloat(form.distance_km) * 1000) : 0,
        goal_time: form.goal_time.trim() || null,
        user_id: user!.id,
      }
      if (form.id) {
        const { error } = await supabase.from('race_calendar').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('race_calendar').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['races', user?.id] })
      setEditRace(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('race_calendar').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['races', user?.id] })
      setDeleteId(null)
    },
  })

  const now = new Date()
  const upcoming = races.filter(r => new Date(r.date) >= now).reverse()
  const past = races.filter(r => new Date(r.date) < now)

  return (
    <>
      <div style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.04em' }}>
            CALENDRIER DE COURSES
          </div>
          <button
            onClick={() => setEditRace('new')}
            style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', background: 'var(--vl-ember)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
          >
            + Ajouter
          </button>
        </div>

        {isLoading ? (
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', color: 'var(--vl-text-3)', padding: '40px 0', textAlign: 'center' }}>Chargement…</div>
        ) : races.length === 0 ? (
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', color: 'var(--vl-text-3)', textAlign: 'center', padding: '40px 0', lineHeight: 1.8 }}>
            Aucune course dans le calendrier.<br />Clique sur + Ajouter pour commencer.
          </div>
        ) : (
          <>
            <ProjectionChart races={races} />
            {upcoming.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 12 }}>À VENIR · {upcoming.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcoming.map(race => <RaceCard key={race.id} race={race} onEdit={() => setEditRace(race)} onDelete={() => setDeleteId(race.id)} />)}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 12 }}>PASSÉES · {past.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {past.map(race => <RaceCard key={race.id} race={race} onEdit={() => setEditRace(race)} onDelete={() => setDeleteId(race.id)} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Add / Edit form */}
      {editRace !== null && (
        <RaceForm
          race={editRace === 'new' ? null : editRace}
          onClose={() => setEditRace(null)}
          onSave={form => upsertMutation.mutate(editRace !== 'new' ? { ...form, id: editRace.id } : form)}
          saving={upsertMutation.isPending}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'var(--vl-surf)', borderRadius: 12, padding: '24px 20px', maxWidth: 360, width: '100%', border: '1px solid var(--vl-line)' }}>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Supprimer cette course ?</div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)', marginBottom: 20 }}>Cette action est irréversible. Le GPX et les projections seront perdus.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, fontFamily: 'var(--vl-mono)', fontSize: '.6rem', background: 'none', border: '1px solid var(--vl-border)', borderRadius: 8, padding: '10px', cursor: 'pointer', color: 'var(--vl-text-2)' }}>Annuler</button>
              <button onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending} style={{ flex: 1, fontFamily: 'var(--vl-mono)', fontSize: '.6rem', background: 'var(--vl-ember)', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', color: '#fff' }}>
                {deleteMutation.isPending ? '…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function RaceCard({ race, onEdit, onDelete }: { race: Race; onEdit: () => void; onDelete: () => void }) {
  const date = new Date(race.date)
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  const isTrail = ['Trail', 'TrailRun', 'trail'].includes(race.type)
  const distKm = race.distance > 0 ? (race.distance / 1000).toFixed(0) + ' km' : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--vl-surf-2)', borderRadius: 8, padding: '12px 14px', gap: 10 }}>
      <Link to={`/race/${race.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{race.name}</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginTop: 4, display: 'flex', gap: 8 }}>
            <span>{dateStr}</span>
            {distKm && <span style={{ color: 'var(--vl-ember)' }}>{distKm}</span>}
            {race.goal_time && <span>Objectif {race.goal_time}</span>}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: isTrail ? 'rgba(229,86,42,.15)' : 'rgba(16,185,129,.15)', color: isTrail ? 'var(--vl-ember)' : 'var(--vl-growth)' }}>
            {isTrail ? 'Trail' : 'Route'}
          </span>
          {race.last_projection && <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)' }}>{fmtD(race.last_projection.cible)} projetés</span>}
        </div>
      </Link>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onEdit} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', background: 'none', border: '1px solid var(--vl-border)', borderRadius: 4, padding: '3px 7px', cursor: 'pointer', color: 'var(--vl-text-3)' }}>Éditer</button>
        <button onClick={e => { e.preventDefault(); onDelete() }} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', background: 'none', border: '1px solid var(--vl-border)', borderRadius: 4, padding: '3px 7px', cursor: 'pointer', color: 'var(--vl-ember)' }}>✕</button>
      </div>
    </div>
  )
}

function RaceForm({ race, onClose, onSave, saving }: {
  race: Race | null
  onClose: () => void
  onSave: (form: FormData) => void
  saving: boolean
}) {
  const [form, setForm] = useState<FormData>(
    race
      ? { name: race.name, date: race.date, type: ['Trail', 'TrailRun', 'trail'].includes(race.type) ? 'Trail' : 'Route', distance_km: race.distance > 0 ? (race.distance / 1000).toFixed(1) : '', goal_time: race.goal_time || '' }
      : EMPTY_FORM
  )

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div style={{ background: 'var(--vl-surf)', borderRadius: '16px 16px 0 0', padding: '24px 20px', width: '100%', maxWidth: 480, border: '1px solid var(--vl-line)', borderBottom: 'none' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 800, marginBottom: 20 }}>
          {race ? 'Modifier la course' : 'Nouvelle course'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {([
            { label: 'Nom *', key: 'name' as const, type: 'text', placeholder: 'UTMB, Marathon de Paris…' },
            { label: 'Date *', key: 'date' as const, type: 'date', placeholder: '' },
            { label: 'Distance (km)', key: 'distance_km' as const, type: 'number', placeholder: '42' },
            { label: 'Objectif (ex: 4h30)', key: 'goal_time' as const, type: 'text', placeholder: '4h30' },
          ] as const).map(({ label, key, type, placeholder }) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>{label}</span>
              <input
                type={type}
                value={form[key]}
                onChange={set(key)}
                placeholder={placeholder}
                style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', background: 'var(--vl-bg)', border: '1px solid var(--vl-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--vl-text-1)', width: '100%', boxSizing: 'border-box' }}
              />
            </label>
          ))}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>Type *</span>
            <select value={form.type} onChange={set('type')} style={{ fontFamily: 'var(--vl-mono)', fontSize: '.7rem', background: 'var(--vl-bg)', border: '1px solid var(--vl-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--vl-text-1)' }}>
              <option value="Trail">Trail</option>
              <option value="Route">Route</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, fontFamily: 'var(--vl-mono)', fontSize: '.6rem', background: 'none', border: '1px solid var(--vl-border)', borderRadius: 8, padding: '10px', cursor: 'pointer', color: 'var(--vl-text-2)' }}>Annuler</button>
          <button
            onClick={() => { if (!form.name || !form.date) return; onSave(form) }}
            disabled={saving || !form.name || !form.date}
            style={{ flex: 2, fontFamily: 'var(--vl-display)', fontSize: '.8rem', fontWeight: 700, background: 'var(--vl-ember)', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', color: '#fff', opacity: (!form.name || !form.date) ? 0.5 : 1 }}
          >
            {saving ? '…' : race ? 'Enregistrer' : 'Créer la course'}
          </button>
        </div>
      </div>
    </div>
  )
}
