import { test, expect } from '@playwright/test'

// Écran de séance — aperçu public choix-first (catalogue → détail)
test.describe('Aperçu des séances', () => {
  test('catalogue choix-first + navigation vers le détail, sans erreur JS', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/Vorcelab/app/#/preview/session')

    await expect(page.getByRole('heading', { name: 'Aperçu des séances' })).toBeVisible()
    // Allures réelles dérivées d'un record
    await expect(page.getByText('MES ALLURES')).toBeVisible()
    // Catalogue + badge de recommandation (choix-first)
    await expect(page.getByText('CATALOGUE — TU CHOISIS')).toBeVisible()
    await expect(page.getByText('✦ Recommandée').first()).toBeVisible()

    // Carte → détail : on choisit une séance, le profil s'affiche
    await page.getByText('Endurance fondamentale').click()
    await expect(page.getByRole('button', { name: /Retour au catalogue/ })).toBeVisible()
    await expect(page.getByRole('img', { name: "Profil d'intensité" })).toBeVisible()

    // Feedback post-séance non anxiogène : validation → ressenti → douleur opt-in
    await page.getByRole('button', { name: 'Valider ma séance' }).click()
    await expect(page.getByText("Comment c'était ?")).toBeVisible()
    await page.getByRole('button', { name: /Dur/ }).click()
    await expect(page.getByText(/Qu'est-ce qui a coincé/)).toBeVisible()
    await page.getByRole('button', { name: 'Douleur' }).click()
    await expect(page.getByText(/Niveau de douleur/)).toBeVisible()

    // Retour au catalogue
    await page.getByRole('button', { name: /Retour au catalogue/ }).click()
    await expect(page.getByText('CATALOGUE — TU CHOISIS')).toBeVisible()

    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })
})
