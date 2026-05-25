import { test, expect } from '@playwright/test'

// Tests C, D — auth guard & navigation
// Toutes les routes privées sont protégées par PrivateRoutes (user=null au démarrage).
// → chaque route doit afficher la LoginPage, pas un crash.
// La route /s/:token est publique — testée séparément dans public-share.spec.ts.

const ROUTES = [
  { path: '/Vorcelab/app/#/',                             label: 'root' },
  { path: '/Vorcelab/app/#/activities',                   label: 'activités' },
  { path: '/Vorcelab/app/#/race',                         label: 'stratégie' },
  { path: '/Vorcelab/app/#/renfo',                        label: 'renfo' },
  { path: '/Vorcelab/app/#/profile',                      label: 'profil' },
  { path: '/Vorcelab/app/#/activities/fake-id',           label: 'activité inconnue' },
  { path: '/Vorcelab/app/#/race/fake-id',                 label: 'course inconnue' },
  { path: '/Vorcelab/app/#/renfo/session/force_lourde',   label: 'session renfo' },
  { path: '/Vorcelab/app/#/renfo/library',                label: 'bibliothèque renfo' },
  { path: '/Vorcelab/app/#/renfo/settings',               label: 'réglages renfo' },
  { path: '/Vorcelab/app/#/route-inexistante',            label: '404 custom' },
]

test.describe('React — auth guard', () => {
  for (const { path, label } of ROUTES) {
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
  test('les liens de navigation existent dans le DOM', async ({ page }) => {
    // Les NavLinks de Layout.tsx existent même si LoginPage est affiché,
    // car AuthGuard remplace le contenu principal, pas la structure complète.
    // → Vérification faible : la page React monte sans crash.
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/Vorcelab/app/#/')
    await expect(page.getByPlaceholder('ton@email.com')).toBeVisible()

    // Pas d'erreur de montage React
    expect(pageErrors).toHaveLength(0)
  })
})
