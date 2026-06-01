import { useState, type ReactNode } from 'react'

/**
 * Volet accordéon — carte avec en-tête cliquable, repliée par défaut.
 * Utilisé pour « Pourquoi ce plan » et « Mes allures » sur la page Coach.
 */
export default function Collapsible({ title, children, defaultOpen = false }: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: '1.25rem' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          all: 'unset', cursor: 'pointer', width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span className="clabel">{title}</span>
        <span
          aria-hidden
          style={{
            fontSize: 12, color: 'var(--vl-text-3)',
            transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s',
          }}
        >
          ▸
        </span>
      </button>
      {open ? <div style={{ marginTop: 10 }}>{children}</div> : null}
    </div>
  )
}
