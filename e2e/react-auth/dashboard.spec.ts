import { test, expect } from '@playwright/test'

test.describe('Dashboard (authentifié)', () => {
  test('charge sans crash et affiche le titre', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Titre dans le contenu principal (pas la sidebar)
    await expect(page.locator('main').getByText('DASHBOARD')).toBeVisible()

    expect(errors, `erreurs JS : ${errors.join(' | ')}`).toHaveLength(0)
  })

  test('les KPI stats sont présents', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

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

    // Clic sur le lien de la sidebar desktop (premier <nav>)
    await page.getByRole('navigation').first().getByRole('link', { name: /Activités/i }).click()
    await expect(page.locator('main').getByText('ACTIVITÉS', { exact: true })).toBeVisible({ timeout: 5_000 })

    expect(errors).toHaveLength(0)
  })
})
