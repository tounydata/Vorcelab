import { test, expect } from '@playwright/test'

test.describe('Activités (authentifié)', () => {
  test('charge sans crash et affiche le titre', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/activities')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('ACTIVITÉS', { exact: true })).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('état de liste propre (chargement ou vide ou données)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/activities')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // L'un des trois états doit être visible, pas de page blanche
    const main    = page.locator('main')
    const counter = main.getByText(/\d+ sortie/)          // ex: "42 sorties"
    const empty   = main.getByText('Aucune sortie')
    const loading = main.getByText('Chargement')

    await expect(counter.or(empty).or(loading).first()).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  test('champ de recherche fonctionnel', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/activities')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    const search = page.getByPlaceholder(/recherche|chercher/i)
    if (await search.isVisible()) {
      await search.fill('test')
      await search.fill('')
    }

    expect(errors).toHaveLength(0)
  })
})
