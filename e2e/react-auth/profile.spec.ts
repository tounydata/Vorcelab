import { test, expect } from '@playwright/test'

test.describe('Profil (authentifié)', () => {
  test('charge sans crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/profile')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Nom/email du compte test visible (profile?.name || email split) — ou "PROFIL" par défaut
    await expect(
      page.getByText(/PROFIL|@/).first()
    ).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  test('email du compte affiché dans la sidebar', async ({ page }) => {
    await page.goto('/#/profile')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // L'email est toujours affiché en bas de sidebar (Layout.tsx ligne 45)
    const testEmail = process.env.VORCELAB_TEST_EMAIL
    if (testEmail) {
      // Supabase normalise les emails en minuscules ; l'email apparaît dans la sidebar ET la page profil
      await expect(
        page.getByRole('navigation').first().getByText(testEmail.toLowerCase())
      ).toBeVisible()
    }
  })

  test('renfo route : ComingSoon visible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // /renfo → ComingSoonPage : "Cette section est disponible dans l'application principale."
    await expect(
      page.getByText("Cette section est disponible dans l'application principale.")
    ).toBeVisible()

    expect(errors).toHaveLength(0)
  })
})
