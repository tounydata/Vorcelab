import { useEffect, useMemo, useState } from 'react'
import {
  availableVariants, renderSticker, stickerBlob, fmtStickerTime,
  VARIANT_LABELS, type StickerData, type StickerVariant,
} from '../lib/shareSticker'

// Modale de partage : génère les stickers PNG transparents (Canvas) et propose
// Partager (feuille de partage du téléphone, Web Share API) ou Télécharger.
// L'aperçu est posé sur un dégradé pour simuler une photo de story.
export default function ShareStickers({ data, onClose }: { data: StickerData; onClose: () => void }) {
  const variants = useMemo(() => availableVariants(data), [data])
  const [variant, setVariant] = useState<StickerVariant>(variants[variants.length - 1] ?? 'stats')
  const [urls, setUrls] = useState<Partial<Record<StickerVariant, string>>>({})
  const [blobs, setBlobs] = useState<Partial<Record<StickerVariant, Blob>>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const made: string[] = []
    ;(async () => {
      const u: Partial<Record<StickerVariant, string>> = {}
      const b: Partial<Record<StickerVariant, Blob>> = {}
      for (const v of variants) {
        try {
          const blob = await stickerBlob(renderSticker(v, data))
          if (cancelled) return
          b[v] = blob
          const url = URL.createObjectURL(blob)
          made.push(url)
          u[v] = url
        } catch { /* variante indisponible → on l'ignore */ }
      }
      if (!cancelled) { setUrls(u); setBlobs(b) }
    })()
    return () => { cancelled = true; made.forEach((m) => URL.revokeObjectURL(m)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const file = useMemo(() => {
    const blob = blobs[variant]
    return blob ? new File([blob], 'vorcelab.png', { type: 'image/png' }) : null
  }, [blobs, variant])

  const canShare = !!file && typeof navigator.share === 'function'
    && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }))

  async function share() {
    if (!file) return
    setBusy(true)
    try {
      await navigator.share({ files: [file], title: 'Vorcelab' })
    } catch { /* annulé par l'utilisateur */ }
    setBusy(false)
  }

  function download() {
    const url = urls[variant]
    if (!url) return
    const a = document.createElement('a')
    const t = fmtStickerTime(data.movingTimeS).join('')
    a.href = url
    a.download = `vorcelab-${t}-${variant}.png`
    a.click()
  }

  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(10,10,12,0.65)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, background: 'var(--vl-surf)', border: '1px solid var(--vl-line-2)', borderTop: '3px solid var(--vl-ember)', borderRadius: 'var(--vl-r)', padding: '18px 18px 16px', boxShadow: '0 24px 60px -24px rgba(0,0,0,.85)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800 }}>Partager en story</div>
          <button onClick={onClose} className="hbtn" style={{ fontSize: '.8rem', padding: '5px 10px' }}>Fermer</button>
        </div>

        {/* sélecteur de variante */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {variants.map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className="mono"
              style={{
                padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11, letterSpacing: '.08em',
                border: `1px solid ${v === variant ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                background: v === variant ? 'color-mix(in srgb, var(--vl-ember) 16%, transparent)' : 'var(--vl-surf-2)',
                color: v === variant ? 'var(--vl-ember)' : 'var(--vl-text-2)',
              }}
            >{VARIANT_LABELS[v].toUpperCase()}</button>
          ))}
        </div>

        {/* aperçu sur fond simulé (le PNG est transparent) */}
        <div style={{ borderRadius: 'var(--vl-r-sm)', overflow: 'hidden', background: 'linear-gradient(160deg,#3a5a7a 0%,#7a8a6a 45%,#4a3a2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, padding: 18 }}>
          {urls[variant]
            ? <img src={urls[variant]} alt="Aperçu du sticker" style={{ maxWidth: '100%', maxHeight: 380 }} />
            : <span className="mono" style={{ fontSize: 11, color: '#fff' }}>Génération…</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginTop: 8 }}>
          PNG transparent — pose-le sur ta photo en story (sticker photo).
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {canShare && (
            <button
              onClick={share}
              disabled={busy || !urls[variant]}
              style={{ flex: 1, border: 'none', borderRadius: 'var(--vl-r-sm)', padding: '11px 16px', fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '.95rem', cursor: 'pointer', background: 'var(--vl-ember)', color: 'var(--vl-ink)' }}
            >{busy ? '…' : 'Partager'}</button>
          )}
          <button
            onClick={download}
            disabled={!urls[variant]}
            className="hbtn"
            style={{ flex: canShare ? undefined : 1, padding: '11px 16px', fontSize: '.9rem' }}
          >Télécharger</button>
        </div>
      </div>
    </div>
  )
}
