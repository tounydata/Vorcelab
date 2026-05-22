import { test, expect } from '@playwright/test'

test.describe('Dashboard (authentifié)', () => {
  test('charge sans crash et affiche le titre', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/')

    // Layout sidebar : signe que la session est reconnue
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Titre de la page
    await expect(page.getByText('DASHBOARD')).toBeVisible()

    expect(errors, `erreurs JS : ${errors.join(' | ')}`).toHaveLength(0)
  })

  test('les KPI stats sont présents', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // KpiBlocks présents (texte label stable quel que soit la valeur)
    await expect(page.getByText('KM CE MOIS')).toBeVisible()
    await expect(page.getByText('KM CETTE SEMAINE')).toBeVisible()
    await expect(page.getByText('D+ CE MOIS')).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('section DERNIÈRES SORTIES visible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('DERNIÈRES SORTIES')).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('navigation vers Activités fonctionne', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('link', { name: 'Activités' }).click()
    await expect(page.getByText('ACTIVITÉS')).toBeVisible({ timeout: 5_000 })

    expect(errors).toHaveLength(0)
  })
})
