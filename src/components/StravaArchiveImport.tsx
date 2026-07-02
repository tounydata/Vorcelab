import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'

// Import de l'archive Strava (Paramètres → Mes données → Demander une archive).
// On lit `activities.csv` dans le ZIP et on écrit les activités RUNNING dans
// strava_activities — dédup par (user_id, strava_activity_id) SANS écraser les
// activités déjà synchronisées (plus riches). Portage de l'ancien import legacy.

interface ImportStats {
  imported: number
  skipped: number
  totalKm: number
  totalDplus: number
  from: string
  to: string
}

// ── Parse CSV robuste (champs entre guillemets, virgules internes) ──
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const splitLine = (line: string): string[] => {
    const vals: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ
      } else if (ch === ',' && !inQ) { vals.push(cur); cur = '' } else cur += ch
    }
    vals.push(cur)
    return vals.map((v) => v.trim())
  }
  const headers = splitLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const vals = splitLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
}

const RUN_TYPES = new Set(['Run', 'Trail Run', 'Running', 'TrailRun', 'Virtual Run'])

// « Moving Time » peut être en secondes brutes ("3600") ou en H:MM:SS.
function toSeconds(raw: string): number | null {
  if (!raw) return null
  if (raw.includes(':')) {
    const parts = raw.split(':').map(Number)
    if (parts.some((n) => Number.isNaN(n))) return null
    return parts.reduce((acc, n) => acc * 60 + n, 0)
  }
  const n = parseFloat(raw)
  return Number.isFinite(n) ? Math.round(n) : null
}

// La colonne « Distance » de l'export est tantôt en km (formaté) tantôt en m.
// Heuristique : une valeur < 500 est forcément des km (aucune course = 500 km).
function toMeters(raw: string): number {
  const n = parseFloat(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 500 ? n * 1000 : n
}

function num(raw: string): number | null {
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

export default function StravaArchiveImport() {
  const user = useVLStore((s) => s.user)
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [stats, setStats] = useState<ImportStats | null>(null)

  async function handleFile(file: File) {
    if (!user) return
    setError(''); setStats(null); setBusy(true)
    try {
      setProgress('Lecture du ZIP…')
      const { default: JSZip } = await import('jszip')
      const zip = await JSZip.loadAsync(file)
      let csv = zip.file('activities.csv')
      if (!csv) {
        const key = Object.keys(zip.files).find((k) => k.endsWith('activities.csv'))
        if (key) csv = zip.file(key)
      }
      if (!csv) { setError('activities.csv introuvable dans le ZIP. Utilise bien l\'archive complète Strava.'); return }

      setProgress('Analyse des activités…')
      const rows = parseCsv(await csv.async('string'))
      const runs = rows.filter((r) => RUN_TYPES.has(r['Activity Type'] || r['Type'] || ''))
      if (!runs.length) { setError('Aucune activité de course trouvée dans l\'archive.'); return }

      const mapped = runs.map((r) => {
        const id = parseInt(r['Activity ID'] || r['Activity Id'] || '', 10)
        if (!Number.isFinite(id)) return null
        const dateStr = r['Activity Date'] || r['Date'] || ''
        const d = dateStr ? new Date(dateStr) : null
        const startIso = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
        const distance = toMeters(r['Distance'] || '')
        const moving = toSeconds(r['Moving Time'] || '')
        const elapsed = toSeconds(r['Elapsed Time'] || '')
        const isTrail = (r['Activity Type'] || '').includes('Trail')
        return {
          user_id: user.id,
          strava_activity_id: id,
          name: r['Activity Name'] || 'Course importée',
          type: isTrail ? 'TrailRun' : 'Run',
          sport_type: isTrail ? 'TrailRun' : 'Run',
          start_date: startIso,
          distance,
          moving_time: moving,
          elapsed_time: elapsed,
          total_elevation_gain: num(r['Elevation Gain'] || '') ?? 0,
          average_speed: distance > 0 && moving ? distance / moving : null,
          average_heartrate: num(r['Average Heart Rate'] || ''),
          max_heartrate: num(r['Max Heart Rate'] || ''),
          calories: num(r['Calories'] || ''),
          is_race: false,
          raw_data: { source: 'strava_csv_import' },
          synced_at: new Date().toISOString(),
        }
      }).filter((x): x is NonNullable<typeof x> => x !== null && x.start_date !== null)

      // Insert par lots, SANS écraser l'existant (ignoreDuplicates) : l'import ne
      // fait que combler l'historique manquant.
      let imported = 0
      const BATCH = 400
      for (let i = 0; i < mapped.length; i += BATCH) {
        setProgress(`Import ${Math.min(i + BATCH, mapped.length)}/${mapped.length}…`)
        const batch = mapped.slice(i, i + BATCH)
        const { error: err, count } = await supabase
          .from('strava_activities')
          .upsert(batch, { onConflict: 'user_id,strava_activity_id', ignoreDuplicates: true, count: 'exact' })
        if (err) throw err
        imported += count ?? 0
      }

      const dates = mapped.map((m) => m.start_date!).sort()
      setStats({
        imported,
        skipped: mapped.length - imported,
        totalKm: mapped.reduce((s, m) => s + m.distance, 0) / 1000,
        totalDplus: mapped.reduce((s, m) => s + (m.total_elevation_gain ?? 0), 0),
        from: dates[0]?.slice(0, 10) ?? '?',
        to: dates[dates.length - 1]?.slice(0, 10) ?? '?',
      })
      // Rafraîchit dashboard, activités, PMC…
      qc.invalidateQueries()
    } catch (e) {
      setError('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
      setProgress('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: 12, color: 'var(--vl-text-2)', lineHeight: 1.6, marginBottom: 12 }}>
        Strava → <strong>Paramètres → Mes données → Demander une archive</strong> → tu reçois un ZIP par
        e-mail sous ~1&nbsp;h. Importe-le ici : Vorcelab récupère tout ton historique de course
        (au-delà de ce que l'API synchronise). Tes activités déjà présentes ne sont pas écrasées.
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <button
        className="hbtn"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        style={{ background: 'var(--vl-ember)', color: '#fff', borderColor: 'var(--vl-ember)', fontWeight: 700 }}
      >
        {busy ? (progress || 'Import en cours…') : '📦 Importer mon archive ZIP'}
      </button>

      {error && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--vl-ember)', fontFamily: 'var(--vl-mono)', lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {stats && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['Nouvelles activités importées', String(stats.imported)],
            ['Déjà présentes (ignorées)', String(stats.skipped)],
            ['Distance totale', `${stats.totalKm.toFixed(0)} km`],
            ['D+ total', `${stats.totalDplus.toFixed(0)} m`],
            ['Période', `${stats.from} → ${stats.to}`],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--vl-text-3)' }}>{label}</span>
              <span style={{ fontFamily: 'var(--vl-mono)', color: 'var(--vl-text)' }}>{val}</span>
            </div>
          ))}
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-growth)', marginTop: 4 }}>
            ✓ Historique importé — visible dans ton Dashboard et tes activités.
          </div>
        </div>
      )}
    </div>
  )
}
