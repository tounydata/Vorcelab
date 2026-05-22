import { test, expect } from '@playwright/test'

// Erreurs d'init CDN : non-fatales — indiquent un environnement sans internet
const CDN_ERRORS = ['window.supabase', 'createClient', 'is not defined', 'is undefined']

function fatalErrors(pageErrors: string[]) {
  return pageErrors.filter(msg => !CDN_ERRORS.some(pattern => msg.includes(pattern)))
}

// Test A — Legacy smoke
test.describe('Legacy — smoke', () => {
  test('title contient VORCELAB', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/legacy.html')

    await expect(page).toHaveTitle(/VORCELAB/)
    // Les erreurs CDN (Supabase non chargé) ne font pas échouer ce test
    expect(fatalErrors(pageErrors), 'erreur JS fatale').toHaveLength(0)
  })

  test('texte VORCELAB visible dans le HTML statique', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))

    await page.goto('/legacy.html')

    // .splash-wordmark et .auth-brand-title sont dans le HTML — visibles sans JS
    await expect(
      page.locator('.splash-wordmark, .auth-brand-title').first()
    ).toBeVisible({ timeout: 8000 })

    expect(fatalErrors(pageErrors), 'erreur JS fatale').toHaveLength(0)
  })

  test('formulaire de connexion visible si CDN accessible', async ({ page }) => {
    await page.goto('/legacy.html')

    // Le formulaire #loginForm nécessite que Supabase CDN soit chargé.
    // Sans internet → skip proprement plutôt que fail.
    const cdnLoaded = await page.evaluate(
      () => typeof (window as Record<string, unknown>)['supabase'] !== 'undefined'
    )
    test.skip(!cdnLoaded, 'CDN Supabase inaccessible — internet requis pour ce test')

    await expect(page.locator('#loginForm')).toBeVisible({ timeout: 12000 })
    await expect(page.locator('#loginEmail')).toBeVisible()
    await expect(page.locator('#loginPassword')).toBeVisible()
  })
})
