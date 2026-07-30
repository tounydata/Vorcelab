import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyStravaLink, shouldPromptStravaLink } from '../src/lib/stravaLinkPrompt'

// Invite Strava non bloquante — deux pannes RÉELLES observées en production :
//   • Rachid : aucun jeton. Le flux OAuth n'est jamais allé au bout, il croyait pourtant
//     avoir lié son compte. Aucun signal produit ne le lui disait.
//   • Justin : compte lié, scope `read` SEUL. L'app affichait « connecté » et zéro
//     activité — le cas le plus trompeur, puisque tout semble en ordre.
// Le classement ci-dessous est le seul juge : « connecté » ne veut rien dire, seule
// compte la capacité du moteur à LIRE les sorties.

describe('classifyStravaLink', () => {
  it('traite l’absence de jeton comme non connecté', () => {
    expect(classifyStravaLink(null)).toBe('not_connected')
    expect(classifyStravaLink(undefined)).toBe('not_connected')
    expect(classifyStravaLink({})).toBe('not_connected')
    expect(classifyStravaLink({ connected: false })).toBe('not_connected')
  })

  it('détecte le compte lié SANS accès aux activités (cas Justin)', () => {
    expect(classifyStravaLink({ connected: true, activity_access_granted: false }))
      .toBe('missing_scope')
    // Sans le drapeau serveur, le scope brut fait foi : `read` seul ne suffit pas.
    expect(classifyStravaLink({ connected: true, scope: 'read' })).toBe('missing_scope')
  })

  it('accepte un lien complet, quel que soit l’ordre ou le séparateur des scopes', () => {
    expect(classifyStravaLink({ connected: true, activity_access_granted: true })).toBe('ok')
    expect(classifyStravaLink({ connected: true, scope: 'read,activity:read_all' })).toBe('ok')
    // Anthony MEYER : scopes séparés par une espace, dans l'ordre inverse.
    expect(classifyStravaLink({ connected: true, scope: 'activity:read_all read' })).toBe('ok')
  })

  it('ne relance QUE lorsque le moteur ne peut rien lire', () => {
    expect(shouldPromptStravaLink('ok')).toBe(false)
    expect(shouldPromptStravaLink('not_connected')).toBe(true)
    expect(shouldPromptStravaLink('missing_scope')).toBe(true)
  })
})

describe('invite Strava — non bloquante', () => {
  const prompt = readFileSync(resolve('src/components/StravaLinkPrompt.tsx'), 'utf8')
  const card = readFileSync(resolve('src/components/StravaLinkPromptCard.tsx'), 'utf8')

  it('laisse toujours une sortie à l’athlète', () => {
    // Trois sorties : la croix, « Plus tard », et le clic à côté / Échap.
    expect(card).toContain('aria-label="Fermer"')
    expect(card).toContain('PLUS TARD')
    expect(card).toContain('onClick={onDismiss}')
    expect(card).toContain('useDialogA11y({ open: true, onClose: onDismiss')
    // `aria-modal="false"` : l'invite n'est pas un péage, elle n'enferme pas le lecteur d'écran.
    expect(card).toContain('aria-modal="false"')
  })

  it('revient à la session suivante, sans harceler pendant la session en cours', () => {
    expect(prompt).toContain("const DISMISS_KEY = 'vl-strava-prompt-dismissed'")
    expect(prompt).toContain('sessionStorage.setItem(DISMISS_KEY')
    expect(prompt).toContain('if (dismissed) return null')
  })

  it('ne s’affiche jamais sur une panne de statut ni hors session', () => {
    // Un statut indisponible laisse `state` à null → aucune invite injustifiée.
    expect(prompt).toContain('if (state === null || !shouldPromptStravaLink(state)) return null')
    expect(prompt).toContain("if (!session?.access_token) return")
  })
})
