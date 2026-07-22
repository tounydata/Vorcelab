import { test, expect } from '@playwright/test'

// Tests C, D — auth guard & navigation
// Toutes les routes privées sont protégées par PrivateRoutes (user=null au démarrage).
// → racine : landing publique (nouveau visiteur) · liens profonds : LoginPage.
// La route /s/:token est publique — testée séparément dans public-share.spec.ts.

const PRIVATE_ROUTES = [
  { path: '/activities',                   label: 'activités' },
  { path: '/race',                         label: 'stratégie' },
  { path: '/renfo',                        label: 'renfo' },
  { path: '/profile',                      label: 'profil' },
  { path: '/activities/fake-id',           label: 'activité inconnue' },
  { path: '/race/fake-id',                 label: 'course inconnue' },
  { path: '/renfo/session/force_lourde',   label: 'session renfo' },
  { path: '/renfo/library',                label: 'bibliothèque renfo' },
  { path: '/renfo/settings',               label: 'réglages renfo' },
  { path: '/route-inexistante',            label: '404 custom' },
]

test.describe('React — auth guard', () => {
  test('root : affiche la landing publique, pas de crash', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/')

    await expect(page.getByRole('link', { name: 'CRÉER MON COMPTE →' })).toBeVisible({ timeout: 6000 })

    expect(pageErrors, `erreurs JS sur root : ${pageErrors.join(' | ')}`).toHaveLength(0)
  })

  test('root : login direct si une session a déjà existé ici', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('vl-had-session', '1'))
    await page.goto('/')

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

// Compat HashRouter : des liens `#/…` circulent encore (partages /#/s/:token,
// redirection Stripe /#/payment/success) — main.tsx les réécrit au boot.
test.describe('React — redirection hash → path', () => {
  test('/#/legal/cgu est réécrit en /legal/cgu', async ({ page }) => {
    await page.goto('/#/legal/cgu')

    // Cible le TITRE (h1) : depuis #518 le texte apparaît aussi dans la case de consentement.
    await expect(page.getByRole('heading', { name: "Conditions générales d'utilisation et de vente" })).toBeVisible({ timeout: 6000 })
    expect(new URL(page.url()).pathname).toBe('/legal/cgu')
    expect(new URL(page.url()).hash).toBe('')
  })

  test('/#/s/:token est réécrit en /s/:token (liens de partage distribués)', async ({ page }) => {
    await page.goto('/#/s/token-invalide-000')

    await expect(page).toHaveURL(/\/s\/token-invalide-000$/)
  })

  test('/#/payment/success est réécrit en /payment/success (retour Stripe)', async ({ page }) => {
    await page.goto('/#/payment/success')

    await expect(page).toHaveURL(/\/payment\/success$/)
  })
})

test.describe('React — navigation (non authentifié)', () => {
  test('la page monte sans erreur JS', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/')
    await expect(page.getByRole('link', { name: 'CRÉER MON COMPTE →' })).toBeVisible()

    // Pas d'erreur de montage React
    expect(pageErrors).toHaveLength(0)
  })
})
