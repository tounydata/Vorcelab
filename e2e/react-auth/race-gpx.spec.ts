import { test, expect, type Page } from '@playwright/test'
import path from 'path'

// Mode série pour partager les mocks entre tests et éviter les race conditions
test.describe.configure({ mode: 'serial' })

// L'environnement Playwright (browser Chromium sandboxé) n'a pas accès au réseau
// externe (supabase.co). On mocke les appels REST avec page.route() pour rendre
// les tests autosuffisants, sans dépendance réseau ni données réelles.

const RACE_ID   = '00000000-0000-4000-a000-e2e000000001'  // UUID stable pour les tests
const RACE_NAME = 'E2E_TEST_RACE'
const GPX_FILE      = path.resolve('e2e/fixtures/simple-trail.gpx')
const GPX_MALFORMED = path.resolve('e2e/fixtures/malformed.gpx')
const GPX_NOT_GPX   = path.resolve('e2e/fixtures/not-a-gpx.txt')

// Points pour déclencher l'auto-analyse (race.gpx_data non nul, servie par le mock DB)
const GPX_POINTS_MINI = [
  { lat: 45.8000, lon: 6.8000, ele: 600 },
  { lat: 45.8025, lon: 6.8025, ele: 625 },
  { lat: 45.8050, lon: 6.8050, ele: 660 },
  { lat: 45.8075, lon: 6.8075, ele: 700 },
  { lat: 45.8100, lon: 6.8100, ele: 750 },
  { lat: 45.8150, lon: 6.8150, ele: 800 },
  { lat: 45.8200, lon: 6.8200, ele: 750 },
  { lat: 45.8250, lon: 6.8250, ele: 700 },
  { lat: 45.8275, lon: 6.8275, ele: 640 },
  { lat: 45.8300, lon: 6.8300, ele: 600 },
]

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

const MOCK_RACE_GOAL     = { ...MOCK_RACE, goal_time: '4h30' }
const MOCK_RACE_WITH_GPX = { ...MOCK_RACE, gpx_data: GPX_POINTS_MINI }

async function setupSupabaseMocks(page: Page, raceVariant: Record<string, unknown> = MOCK_RACE) {
  // race_calendar : GET → données mock / PATCH → 204 No Content (save GPX/projection)
  await page.route('**/rest/v1/race_calendar**', async route => {
    const method = route.request().method()
    if (method === 'PATCH') {
      // Simulate successful save without returning body (standard PostgREST 204)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    const accept = route.request().headers()['accept'] ?? ''
    const isSingle = accept.includes('vnd.pgrst.object')
    await route.fulfill({
      status: 200,
      contentType: isSingle ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: isSingle ? JSON.stringify(raceVariant) : JSON.stringify([raceVariant]),
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

    await page.goto('/race')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText(RACE_NAME)).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  // ── Test 2 : page stratégie ────────────────────────────────────────────────
  test('page stratégie : header course + zone upload GPX', async ({ page }) => {
    await setupSupabaseMocks(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/race/${RACE_ID}`)
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

    await page.goto(`/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(GPX_FILE)

    // Spinner peut disparaître très vite (analyse locale pure)
    await expect(page.locator('main').getByText('Calcul de la stratégie…')).not.toBeVisible({ timeout: 15_000 })

    // Bandeau stats
    await expect(page.locator('main').getByText('D+', { exact: true })).toBeVisible()
    await expect(page.locator('main').getByText('Distance')).toBeVisible()

    // Carte de projection
    await expect(page.locator('main').getByText('PROJECTION VORCELAB')).toBeVisible()

    // Plan de course (openSections = true par défaut)
    await expect(page.locator('main').getByText('PLAN DE COURSE')).toBeVisible()
    await expect(page.locator('main').getByText(/Montée|Descente|Plat/).first()).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  // ── Test 4 : goal_time ─────────────────────────────────────────────────────
  test('goal_time : section OBJECTIF + label d\'alignement affiché', async ({ page }) => {
    await setupSupabaseMocks(page, MOCK_RACE_GOAL)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(GPX_FILE)
    await expect(page.locator('main').getByText('Calcul de la stratégie…')).not.toBeVisible({ timeout: 15_000 })

    // OBJECTIF affiché avec la valeur et le label d'alignement (Réaliste / Ambitieux / etc.)
    // exact: true requis car getByText est case-insensitive par défaut et matcherait aussi "Objectif 4h30"
    await expect(page.locator('main').getByText('OBJECTIF', { exact: true })).toBeVisible()
    await expect(page.locator('main').getByText('4h30', { exact: true })).toBeVisible()
    await expect(
      page.locator('main').getByText(/Très conservateur|Conservateur|Réaliste|Ambitieux|Très ambitieux/).first()
    ).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  // ── Test 5 : Leaflet ──────────────────────────────────────────────────────
  test('Leaflet : .leaflet-container rendu via auto-analyse (gpx_data en DB)', async ({ page }) => {
    await setupSupabaseMocks(page, MOCK_RACE_WITH_GPX)
    // Abort les tuiles CartoCDN pour éviter les requêtes réseau externes
    await page.route('**/basemaps.cartocdn.com/**', route => route.abort())
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // gpx_data non nul → auto-analyse sans upload manuel → résultats directs
    await expect(page.locator('main').getByText('PROJECTION VORCELAB')).toBeVisible({ timeout: 15_000 })

    // Leaflet crée le conteneur .leaflet-container dans le DOM
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  // ── Test 6 : Plan Nutrition ────────────────────────────────────────────────
  test('Plan Nutrition : accordéon s\'ouvre et affiche le tableau', async ({ page }) => {
    await setupSupabaseMocks(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(GPX_FILE)
    await expect(page.locator('main').getByText('Calcul de la stratégie…')).not.toBeVisible({ timeout: 15_000 })

    // Accordéon fermé par défaut → table absente, header visible
    const nutritionBtn = page.locator('main').getByRole('button', { name: /PLAN NUTRITION/ })
    await expect(nutritionBtn).toBeVisible()
    await expect(page.locator('main table')).not.toBeVisible()

    // Clic → table affichée avec les colonnes
    await nutritionBtn.click()
    await expect(page.locator('main table')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('main table').getByText('Moment', { exact: true })).toBeVisible()
    await expect(page.locator('main table').getByText('Glucides', { exact: true })).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  // ── Test 7 : GPX malformé ─────────────────────────────────────────────────
  test('GPX malformé (<2 pts) → zone upload réapparaît sans crash', async ({ page }) => {
    await setupSupabaseMocks(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(GPX_MALFORMED)

    // handleGpxFile retourne tôt si points < 2 → pas de résultat, upload zone réapparaît
    await expect(page.locator('main').getByText('Calcul de la stratégie…')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    expect(errors).toHaveLength(0)
  })

  // ── Test 8 : fichier non-GPX ──────────────────────────────────────────────
  test('fichier non-GPX (texte brut) → zone upload réapparaît sans crash', async ({ page }) => {

    await setupSupabaseMocks(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(`/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(GPX_NOT_GPX)

    // DOMParser parse le texte brut comme XML → aucun trkpt → points < 2 → zone réapparaît
    await expect(page.locator('main').getByText('Calcul de la stratégie…')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    expect(errors).toHaveLength(0)
  })

  // ── Test 9 : PATCH envoyé avec gpx_data + last_projection après upload ────
  test('upload GPX → PATCH race_calendar envoyé avec gpx_data et last_projection', async ({ page }) => {
    let patchBody: Record<string, unknown> | null = null

    // Override le mock race_calendar pour capturer le PATCH
    await page.route('**/rest/v1/race_calendar**', async route => {
      const method = route.request().method()
      if (method === 'PATCH') {
        try { patchBody = JSON.parse(route.request().postData() ?? '{}') } catch { /* ignore */ }
        await route.fulfill({ status: 204, body: '' })
        return
      }
      const accept = route.request().headers()['accept'] ?? ''
      const isSingle = accept.includes('vnd.pgrst.object')
      await route.fulfill({
        status: 200,
        contentType: isSingle ? 'application/vnd.pgrst.object+json' : 'application/json',
        body: isSingle ? JSON.stringify(MOCK_RACE) : JSON.stringify([MOCK_RACE]),
      })
    })
    await page.route('**/rest/v1/strava_activities**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/profiles**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.pgrst.object+json',
        body: JSON.stringify({ fc_max: 180, prs: null, nutrition_level: 'standard' }),
      })
    })

    await page.goto(`/race/${RACE_ID}`)
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('Chargement…', { exact: true })).not.toBeVisible({ timeout: 8_000 })
    await expect(page.locator('main').getByText('CHARGER LE GPX')).toBeVisible({ timeout: 5_000 })

    const fileInput = page.locator('input[type="file"][accept=".gpx"]')
    await fileInput.setInputFiles(GPX_FILE)

    // Attendre la projection (signe que handleGpxFile a terminé + PATCH envoyé)
    await expect(page.locator('main').getByText('PROJECTION VORCELAB')).toBeVisible({ timeout: 15_000 })
    // Attendre l'indicateur de sauvegarde
    await expect(page.locator('main').getByText(/GPX sauvegardé|Sauvegarde/)).toBeVisible({ timeout: 5_000 })

    // Vérifier que le PATCH a bien été envoyé
    expect(patchBody).not.toBeNull()
    expect(Array.isArray(patchBody!['gpx_data'])).toBe(true)
    expect((patchBody!['gpx_data'] as unknown[]).length).toBeGreaterThan(0)
    expect(patchBody!['last_projection']).toBeDefined()
    const proj = patchBody!['last_projection'] as Record<string, unknown>
    expect(typeof proj['cible']).toBe('number')
    expect(typeof proj['prudent']).toBe('number')
    expect(typeof proj['agressif']).toBe('number')
    expect(['good', 'medium', 'low']).toContain(proj['confidence'])
  })
})
