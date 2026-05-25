import { test, expect } from '@playwright/test'

test.describe('Détail activité (authentifié)', () => {
  test('route inconnue : pas de crash, lien retour visible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/activities/00000000-0000-0000-0000-000000000000')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Soit "Activité introuvable" soit chargement
    const notFound = page.locator('main').getByText(/introuvable|chargement/i)
    await expect(notFound.first()).toBeVisible({ timeout: 8_000 })

    // Lien retour doit toujours être présent
    await expect(page.locator('main').getByText('← Activités')).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('la liste activités lie vers des pages détail', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/activities')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Si des activités existent, cliquer sur la première et vérifier la navigation
    const firstCard = page.locator('.act-card').first()
    if (await firstCard.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await firstCard.click()

      // Doit naviguer vers /activities/:id
      await expect(page).toHaveURL(/\/activities\/[a-zA-Z0-9-]+$/)

      // Lien retour présent
      await expect(page.locator('main').getByText('← Activités')).toBeVisible({ timeout: 8_000 })
    }

    expect(errors).toHaveLength(0)
  })

  test('page détail affiche les sections attendues si activité trouvée', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/activities')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    const firstCard = page.locator('.act-card').first()
    if (await firstCard.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await firstCard.click()
      await expect(page).toHaveURL(/\/activities\//)

      // Sections attendues
      await expect(page.locator('main').getByText('MÉTRIQUES')).toBeVisible({ timeout: 8_000 })
      await expect(page.locator('main').getByText('CHARGE TRIMP')).toBeVisible()

      // Stats de base
      await expect(page.locator('main').getByText('KM')).toBeVisible()
      await expect(page.locator('main').getByText('Temps')).toBeVisible()
    }

    expect(errors).toHaveLength(0)
  })
})
