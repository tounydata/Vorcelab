import { test, expect } from '@playwright/test'

// Tests page publique /s/:shareToken — aucune authentification requise

test.describe('Page publique de stratégie (/s/:token)', () => {
  test('token invalide : page charge sans crash et affiche le message erreur', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/s/token-invalide-000')

    // La page doit monter (logo VORCELAB visible)
    await expect(page.getByText('VORCELAB').first()).toBeVisible({ timeout: 15_000 })

    // Message d'erreur attendu
    await expect(
      page.getByText(/lien invalide|introuvable|désactivé/i).first()
    ).toBeVisible({ timeout: 15_000 })

    expect(errors).toHaveLength(0)
  })

  test('token invalide : bouton CTA inscription visible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/s/token-invalide-000')
    await expect(page.getByText('VORCELAB').first()).toBeVisible({ timeout: 15_000 })

    // Le bouton "Créer un compte" doit être présent
    await expect(page.getByRole('button', { name: /créer un compte/i })).toBeVisible({ timeout: 6_000 })

    expect(errors).toHaveLength(0)
  })

  test('route publique accessible sans session (pas de redirect login)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/s/any-token')

    // NE doit PAS afficher le formulaire de connexion
    await expect(page.getByPlaceholder('ton@email.com')).not.toBeVisible({ timeout: 3_000 })

    // Doit afficher le layout public (logo VL)
    await expect(page.getByText('VORCELAB').first()).toBeVisible({ timeout: 15_000 })

    expect(errors).toHaveLength(0)
  })
})
