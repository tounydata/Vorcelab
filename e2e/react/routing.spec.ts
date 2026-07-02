import { test, expect } from '@playwright/test'

// Tests C, D — auth guard & navigation
// Toutes les routes privées sont protégées par PrivateRoutes (user=null au démarrage).
// → racine : landing publique (nouveau visiteur) · liens profonds : LoginPage.
// La route /s/:token est publique — testée séparément dans public-share.spec.ts.

const PRIVATE_ROUTES = [
  { path: '/#/activities',                   label: 'activités' },
  { path: '/#/race',                         label: 'stratégie' },
  { path: '/#/renfo',                        label: 'renfo' },
  { path: '/#/profile',                      label: 'profil' },
  { path: '/#/activities/fake-id',           label: 'activité inconnue' },
  { path: '/#/race/fake-id',                 label: 'course inconnue' },
  { path: '/#/renfo/session/force_lourde',   label: 'session renfo' },
  { path: '/#/renfo/library',                label: 'bibliothèque renfo' },
  { path: '/#/renfo/settings',               label: 'réglages renfo' },
  { path: '/#/route-inexistante',            label: '404 custom' },
]

test.describe('React — auth guard', () => {
  test('root : affiche la landing publique, pas de crash', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/#/')

    await expect(page.getByRole('button', { name: 'CRÉER MON COMPTE →' })).toBeVisible({ timeout: 6000 })

    expect(pageErrors, `erreurs JS sur root : ${pageErrors.join(' | ')}`).toHaveLength(0)
  })

  test('root : login direct si une session a déjà existé ici', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('vl-had-session', '1'))
    await page.goto('/#/')

    await expect(page.getByPlaceholder('ton@email.com')).toBeVisible({ timeout: 6000 })
  })

  for (const { path, label } of PRIVATE_ROUTES) {
    test(`${label} : affiche login, pas de crash`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', e => pageErrors.push(e.message))

      await page.goto(path)

      // AuthGuard protège tout : login toujours présent sans session
      await expect(
        page.getByPlaceholder('ton@email.com'),
        `email input visible sur ${label}`
      ).toBeVisible({ timeout: 6000 })

      expect(pageErrors, `erreurs JS sur ${label} : ${pageErrors.join(' | ')}`).toHaveLength(0)
    })
  }
})

test.describe('React — navigation (non authentifié)', () => {
  test('la page monte sans erreur JS', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/#/')
    await expect(page.getByRole('button', { name: 'CRÉER MON COMPTE →' })).toBeVisible()

    // Pas d'erreur de montage React
    expect(pageErrors).toHaveLength(0)
  })
})
