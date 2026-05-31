import { test, expect } from '@playwright/test'

// Écran de séance — aperçu public du profil d'intensité (UI tranche 1)
test.describe('Aperçu des séances', () => {
  test('rend les profils d\'intensité sans erreur JS', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/Vorcelab/app/#/preview/session')

    await expect(page.getByRole('heading', { name: 'Aperçu des séances' })).toBeVisible()
    // Au moins un profil d'intensité rendu
    await expect(page.getByRole('img', { name: "Profil d'intensité" }).first()).toBeVisible()
    // Les 5 séances d'exemple
    expect(await page.getByRole('img', { name: "Profil d'intensité" }).count()).toBe(5)

    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })
})
