import { test, expect } from '@playwright/test'

test.describe('Stratégie / Race (authentifié)', () => {
  test('liste des courses charge sans crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/race')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('STRATÉGIES DE COURSE')).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('état de liste propre (vide ou courses)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/race')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    const empty   = page.getByText('Aucune course')
    const loading = page.getByText('Chargement')
    const section = page.getByText(/À VENIR|PASSÉES/)

    await expect(empty.or(loading).or(section)).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  test('lien retour Dashboard présent', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/race')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByRole('link', { name: /Dashboard/i })).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('route /race/:id inconnue : pas de crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/race/00000000-0000-0000-0000-000000000000')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Soit la page stratégie charge (sans GPX), soit 404
    expect(errors).toHaveLength(0)
  })
})
