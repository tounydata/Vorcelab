interface StatBlockProps {
  label: string
  value: string
  color?: string
  sub?: string
}

export function StatBlock({ label, value, color, sub }: StatBlockProps) {
  return (
    <div style={{ background: 'var(--vl-surf-2,#1a1b1f)', borderRadius: 'var(--vl-r-sm,6px)', padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--vl-display,Big Shoulders Display)', fontSize: '1.3rem', fontWeight: 700, color: color ?? 'var(--vl-text-1)' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--vl-mono,JetBrains Mono)', fontSize: '8px', color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 2 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontFamily: 'var(--vl-mono,JetBrains Mono)', fontSize: '7px', color: 'var(--vl-text-3)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
