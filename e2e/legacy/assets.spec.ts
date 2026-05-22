import { test, expect } from '@playwright/test'

// Test E — Legacy assets : pas de 404 sur les fichiers locaux
test.describe('Legacy — assets locaux', () => {
  test('aucun fichier local retourne 404', async ({ page }) => {
    const notFound: string[] = []

    page.on('response', resp => {
      const url = resp.url()
      // On ignore les CDN (supabase, cdn.jsdelivr, unpkg, fonts, etc.)
      if (!url.startsWith('http://localhost:4174')) return
      if (resp.status() === 404) notFound.push(url)
    })

    await page.goto('/legacy.html')
    // Laisser le temps aux imports ES module de se résoudre
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(3000)

    expect(
      notFound,
      `Fichiers 404 :\n${notFound.join('\n')}`
    ).toHaveLength(0)
  })

  test('main.js répond avec HTTP 200', async ({ page }) => {
    let mainJsStatus: number | null = null

    page.on('response', resp => {
      if (resp.url().includes('/main.js')) mainJsStatus = resp.status()
    })

    await page.goto('/legacy.html')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    expect(mainJsStatus, 'main.js doit être chargé').not.toBeNull()
    expect(mainJsStatus).toBe(200)
  })

  test('style.css répond avec HTTP 200', async ({ page }) => {
    let cssStatus: number | null = null

    page.on('response', resp => {
      if (resp.url().includes('/style.css')) cssStatus = resp.status()
    })

    await page.goto('/legacy.html')
    await page.waitForLoadState('domcontentloaded')

    expect(cssStatus, 'style.css doit être chargé').not.toBeNull()
    expect(cssStatus).toBe(200)
  })
})
