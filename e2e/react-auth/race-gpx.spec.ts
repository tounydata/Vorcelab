import { test, expect, type Page } from '@playwright/test'
import path from 'path'

// Mode série pour partager les mocks entre tests et éviter les race conditions
test.describe.configure({ mode: 'serial' })

// L'environnement Playwright (browser Chromium sandboxé) n'a pas accès au réseau
// externe (supabase.co). On mocke les appels REST avec page.route() pour rendre
// les tests autosuffisants, sans dépendance réseau ni données réelles.

const RACE_ID   = '00000000-0000-4000-a000-e2e000000001'  // UUID stable pour les tests
const RACE_NAME = 'E2E_TEST_RACE'
const GPX_FILE  = path.resolve('e2e/fixtures/simple-trail.gpx')

const MOCK_RACE = {
  id: RACE_ID,
  name: RACE_NAME,
  date: '2027-09-01',   // > J+10 → fetchForecastWeather retourne null sans appel réseau
  type: 'trail',
  distance: 5,
  goal_time: null,
  gpx_data: null,
  last_projection: null,
  user_id: 'e57f69c5-d779-4a4e-a240-1632a7df0b1f',
  created_at: '2026-01-01T00:00:00Z',
  strava_activity_id: null,
  athlete_profile: null,
  elevation: null,
}

async function setupSupabaseMocks(page: Page) {
  // race_calendar : liste (array) ou objet unique (.single())
  await page.route('**/rest/v1/race_calendar**', async route => {
    const accept = route.request().headers()['accept'] ?? ''
    const isSingle = accept.includes('vnd.pgrst.object')
    await route.fulfill({
      status: 200,
      contentType: isSingle ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: isSingle ? JSON.stringify(MOCK_RACE) : JSON.stringify([MOCK_RACE]),
    })
  })

  // strava_activities : liste vide
  await page.route('**/rest/v1/strava_activities**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // profiles : profil minimal
  await page.route('**/rest/v1/profiles**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      body: JSON.stringify({ fc_max: 180, prs: null, nutrition_level: 'standard' }),
    })
  })
}

test.describe('Race Strategy / GPX (authentifié)', () => {

  // ── Test 1 : liste des courses ─────────────────────────────────────────────
  test('liste des courses : E2E_TEST_RACE visible', async ({ page }) => {
    await setupSupabaseMocks(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/Vorcelab/app/#/race')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText(RACE_NAME)).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  // ── Test 2 : page stratégie ────────────────────────────────────────────────
  test('page stratégie : header course + zone upload GPX', async ({ page }) => {
    await setupSupabaseMocks(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/Vorcelab/app/#/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Attendre la fin du spinner de chargement de la course (requête mockée → rapide)
    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })

    await expect(page.locator('main').getByText(RACE_NAME)).toBeVisible()
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible()
    await expect(page.locator('main').getByText('← Stratégies')).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  // ── Test 3 : upload GPX → analyse ─────────────────────────────────────────
  test('upload GPX → analyse → sections + projection affichées', async ({ page }) => {
    await setupSupabaseMocks(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/Vorcelab/app/#/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Attendre que la course charge et que la zone upload soit prête
    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    // Upload via l'input masqué (setInputFiles fonctionne sur display:none)
    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(GPX_FILE)

    // Attendre que l'analyse se termine (spinner peut disparaître très vite car tout est local)
    await expect(page.locator('main').getByText('Calcul de la stratégie…')).not.toBeVisible({ timeout: 15_000 })

    // Bandeau stats
    await expect(page.locator('main').getByText('D+', { exact: true })).toBeVisible()
    await expect(page.locator('main').getByText('Distance')).toBeVisible()

    // Carte de projection
    await expect(page.locator('main').getByText('PROJECTION VORCELAB')).toBeVisible()

    // Plan de course (panneau ouvert par défaut openSections = true)
    await expect(page.locator('main').getByText('PLAN DE COURSE')).toBeVisible()
    await expect(page.locator('main').getByText(/Montée|Descente|Plat/).first()).toBeVisible()

    expect(errors).toHaveLength(0)
  })
})
