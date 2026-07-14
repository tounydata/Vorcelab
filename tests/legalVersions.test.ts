import { describe, it, expect } from 'vitest'
import { pendingDocuments, hasAcceptedAll, type AcceptanceRecord } from '../src/lib/legalVersions'

const current = { cgu: '2026-07-02', privacy: '2026-07-02' } as const

describe('pendingDocuments — re-consentement versionné', () => {
  it('aucun consentement → les deux documents sont en attente', () => {
    expect(pendingDocuments([], current).sort()).toEqual(['cgu', 'privacy'])
  })

  it('les deux à jour → rien en attente', () => {
    const accepted: AcceptanceRecord[] = [
      { document: 'cgu', version: '2026-07-02' },
      { document: 'privacy', version: '2026-07-02' },
    ]
    expect(pendingDocuments(accepted, current)).toEqual([])
    expect(hasAcceptedAll(accepted, current)).toBe(true)
  })

  it('version antérieure acceptée → re-consentement requis (CGU)', () => {
    const accepted: AcceptanceRecord[] = [
      { document: 'cgu', version: '2026-01-01' }, // ancienne version
      { document: 'privacy', version: '2026-07-02' },
    ]
    expect(pendingDocuments(accepted, current)).toEqual(['cgu'])
    expect(hasAcceptedAll(accepted, current)).toBe(false)
  })

  it('un seul document accepté → l’autre reste en attente', () => {
    const accepted: AcceptanceRecord[] = [{ document: 'privacy', version: '2026-07-02' }]
    expect(pendingDocuments(accepted, current)).toEqual(['cgu'])
  })
})
