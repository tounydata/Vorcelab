import { test, expect } from '@playwright/test'

// Test B — React app smoke
test.describe('React app — smoke', () => {
  test('page title contains VORCELAB', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/')

    await expect(page).toHaveTitle(/VORCELAB/)
    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })

  test('affiche la landing quand non authentifié (nouveau visiteur)', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/')

    // Visiteur sans session passée → landing marketing avec CTA
    await expect(page.getByText('VORCELAB').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'CRÉER MON COMPTE →' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible()

    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })

  test('affiche la page de connexion sur /login', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/login')

    // Deux occurrences dans le DOM (panneau pitch desktop + bandeau marque mobile)
    await expect(page.getByText('LE LABORATOIRE DU COUREUR').first()).toBeVisible()
    await expect(page.getByPlaceholder('ton@email.com')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connexion sans mot de passe' })).toBeVisible()

    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })

  test('landing → CTA → login', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'CRÉER MON COMPTE →' }).click()
    await expect(page.getByPlaceholder('ton@email.com')).toBeVisible()
  })

  test('pages légales publiques accessibles', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/legal/cgu')
    // Cible le TITRE (h1) : depuis #518, le texte « Conditions générales… »
    // apparaît aussi dans la case de consentement → getByText large = ambigu.
    await expect(page.getByRole('heading', { name: "Conditions générales d'utilisation et de vente" })).toBeVisible()

    await page.goto('/legal/confidentialite')
    await expect(page.getByRole('heading', { name: 'Politique de confidentialité' })).toBeVisible()

    expect(pageErrors, 'aucune erreur JS non gérée').toHaveLength(0)
  })
})
