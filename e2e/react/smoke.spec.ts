import { test, expect } from '@playwright/test'

// Test B — React app smoke
test.describe('React app — smoke', () => {
  test('page title contains VORCELAB', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/Vorcelab/app/#/')

    await expect(page).toHaveTitle(/VORCELAB/)
    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })

  test('affiche la page de connexion quand non authentifié', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/Vorcelab/app/#/')

    // Le store démarre avec user=null → AuthGuard affiche LoginPage immédiatement
    await expect(page.getByText('VORCELAB').first()).toBeVisible()
    await expect(page.getByText('LE LABORATOIRE DU COUREUR')).toBeVisible()
    await expect(page.getByPlaceholder('ton@email.com')).toBeVisible()
    await expect(page.getByRole('button', { name: 'CONNEXION PAR LIEN' })).toBeVisible()

    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })
})
