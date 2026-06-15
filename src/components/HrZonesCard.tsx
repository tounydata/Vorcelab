import { useState } from 'react'
import {
  computeHrZones, defaultZoneConfig, sanitizeBounds, missingInputFor,
  MODEL_LABEL, DEFAULT_BOUNDS,
  type HrZoneConfig, type HrZoneModel, type HrZoneInputs,
} from '../lib/hrZones'

const MODELS: HrZoneModel[] = ['fcmax', 'hrr', 'lthr']
const MISSING_LABEL: Record<'fcMax' | 'restingHr' | 'lthr', string> = {
  fcMax: 'ta FCmax (onglet Profil)', restingHr: 'ta FC de repos (ci-dessous)', lthr: 'ta FC au seuil (ci-dessous)',
}

/** Carte ZONES FC — modèle au choix (%FCmax / Karvonen / LTHR) + bornes ajustables. */
export default function HrZonesCard({ config, inputs, saving, onSave }: {
  config: HrZoneConfig | null
  inputs: HrZoneInputs
  saving: boolean
  onSave: (cfg: HrZoneConfig) => void
}) {
  const effective = config ?? defaultZoneConfig('fcmax')
  const [editing, setEditing] = useState(false)
  const [model, setModel] = useState<HrZoneModel>(effective.model)
  const [pcts, setPcts] = useState<string[]>(effective.bounds.map((b) => String(Math.round(b * 100))))
  const [restingHr, setRestingHr] = useState(effective.restingHr ? String(effective.restingHr) : '')
  const [lthr, setLthr] = useState(effective.lthr != null ? String(effective.lthr) : (inputs.lthr ? String(inputs.lthr) : ''))

  function startEdit() {
    setModel(effective.model)
    setPcts(effective.bounds.map((b) => String(Math.round(b * 100))))
    setRestingHr(effective.restingHr ? String(effective.restingHr) : '')
    setLthr(effective.lthr != null ? String(effective.lthr) : (inputs.lthr ? String(inputs.lthr) : ''))
    setEditing(true)
  }
  function pickModel(m: HrZoneModel) {
    setModel(m)
    setPcts(DEFAULT_BOUNDS[m].map((b) => String(Math.round(b * 100)))) // bornes par défaut du nouveau référentiel
  }
  function buildConfig(): HrZoneConfig {
    const bounds = sanitizeBounds(pcts.map((p) => (parseInt(p, 10) || 0) / 100), model)
    const cfg: HrZoneConfig = { model, bounds }
    if (model === 'hrr') cfg.restingHr = restingHr ? parseInt(restingHr, 10) : null
    if (model === 'lthr') cfg.lthr = lthr ? parseInt(lthr, 10) : null
    return cfg
  }

  // ── Aperçu / affichage ──
  const previewCfg = editing ? buildConfig() : effective
  const zones = computeHrZones(previewCfg, inputs)
  const missing = missingInputFor(previewCfg, inputs)

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="clabel" style={{ margin: 0 }}>ZONES FC · {MODEL_LABEL[previewCfg.model]}</div>
        {!editing && (
          <button onClick={startEdit}
            style={{ background: 'none', border: '1px solid var(--vl-line)', borderRadius: 4, cursor: 'pointer', color: 'var(--vl-text-3)', padding: '2px 7px', fontSize: 10, letterSpacing: '.04em' }}>
            ✏ Modifier
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {MODELS.map((m) => (
              <button key={m} onClick={() => pickModel(m)}
                style={{ padding: '4px 9px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                  border: `1px solid ${model === m ? 'var(--vl-ember)' : 'var(--vl-line-2)'}`,
                  background: model === m ? 'var(--vl-ember)' : 'var(--vl-surf-2)',
                  color: model === m ? 'var(--vl-ink)' : 'var(--vl-text-2)' }}>
                {MODEL_LABEL[m]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 6 }}>
            {pcts.map((p, i) => (
              <label key={i} style={{ fontSize: 10, color: 'var(--vl-text-3)' }}>
                <div style={{ marginBottom: 2 }}>Z{i + 1}/Z{i + 2}</div>
                <input type="number" value={p} onChange={(e) => setPcts((arr) => arr.map((x, j) => j === i ? e.target.value : x))}
                  style={{ width: 56, padding: '5px 6px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 5, fontFamily: 'var(--vl-mono)', fontSize: 12 }} />
                <span style={{ marginLeft: 2 }}>%</span>
              </label>
            ))}
          </div>
          {model === 'hrr' && (
            <label style={{ fontSize: 11, color: 'var(--vl-text-2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              FC de repos
              <input type="number" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} placeholder="50"
                style={{ width: 70, padding: '5px 6px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 5, fontFamily: 'var(--vl-mono)', fontSize: 12 }} />
              bpm
            </label>
          )}
          {model === 'lthr' && (
            <label style={{ fontSize: 11, color: 'var(--vl-text-2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              FC au seuil (LTHR)
              <input type="number" value={lthr} onChange={(e) => setLthr(e.target.value)} placeholder="170"
                style={{ width: 70, padding: '5px 6px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 5, fontFamily: 'var(--vl-mono)', fontSize: 12 }} />
              bpm
            </label>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {zones.map((z) => (
          <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 4, height: 14, borderRadius: 2, background: z.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--vl-text-2)' }}>{z.label}</span>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>
              {z.fromBpm == null ? '<' : `${z.fromBpm}–`}{z.toBpm == null ? `${z.fromBpm}+` : `${z.toBpm} bpm`}
            </span>
          </div>
        ))}
      </div>

      {missing && (
        <div style={{ fontSize: 10.5, color: 'var(--vl-amber)', marginTop: 8 }}>
          Renseigne {MISSING_LABEL[missing]} pour afficher les zones en bpm.
        </div>
      )}

      {editing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="hbtn" disabled={saving} onClick={() => { onSave(buildConfig()); setEditing(false) }}
            style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', flex: 1, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : '💾 Enregistrer'}
          </button>
          <button className="hbtn" onClick={() => pickModel(model)} style={{ flex: 1 }} title="Bornes par défaut du modèle">
            ↺ Défaut
          </button>
          <button className="hbtn" onClick={() => setEditing(false)} style={{ flex: 1 }}>Annuler</button>
        </div>
      )}
    </div>
  )
}
