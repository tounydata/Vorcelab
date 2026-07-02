import { test, expect } from '@playwright/test'

// Vue hebdomadaire choix-first : navigation ← →, séance → détail → feedback
test.describe('Aperçu hebdomadaire', () => {
  test('navigation semaines + choix de séance + feedback, sans erreur JS', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/#/preview/session')

    await expect(page.getByRole('heading', { name: 'Aperçu hebdomadaire' })).toBeVisible()
    await expect(page.getByText('MES ALLURES')).toBeVisible()

    // Vue hebdomadaire : on démarre sur « Cette semaine »
    await expect(page.getByText('Cette semaine')).toBeVisible()

    // Flèche droite → semaine suivante
    await page.getByRole('button', { name: 'Semaine suivante' }).click()
    await expect(page.getByText('Semaine prochaine')).toBeVisible()
    // Retour à cette semaine
    await page.getByRole('button', { name: 'Semaine précédente' }).click()
    await expect(page.getByText('Cette semaine')).toBeVisible()


    // Choix d'une séance → détail (profil d'intensité + allures ±15 s)
    await page.getByText('Endurance fondamentale').click()
    await expect(page.getByRole('button', { name: /Retour/ })).toBeVisible()
    await expect(page.getByRole('img', { name: "Profil d'intensité" })).toBeVisible()

    // Feedback post-séance non anxiogène
    await page.getByRole('button', { name: 'Valider ma séance' }).click()
    await expect(page.getByText("Comment c'était ?")).toBeVisible()
    await page.getByRole('button', { name: /Trop dur/i }).click()
    await page.getByRole('button', { name: 'Douleur' }).click()
    await expect(page.getByText(/Niveau de douleur/)).toBeVisible()

    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })
})
