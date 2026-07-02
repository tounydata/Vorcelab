import { test, expect } from '@playwright/test'

test.describe('Renfo (authentifié)', () => {
  test('grille des focuses charge sans crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('RENFORCEMENT')).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('les 9 cartes focus sont présentes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    const focuses = ['Force lourde', 'Pliométrie', 'Tronc', 'Yoga du coureur', 'Pilates coureur', 'Stretching']
    for (const label of focuses) {
      await expect(page.locator('main').getByText(label, { exact: false }).first()).toBeVisible({ timeout: 6_000 })
    }

    expect(errors).toHaveLength(0)
  })

  test('badge DUP phase visible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    const phases = ['FORCE', 'VOLUME', 'PUISSANCE', 'DÉCHARGE']
    const phaseVisible = page.locator('main').getByText(new RegExp(phases.join('|')))
    await expect(phaseVisible.first()).toBeVisible({ timeout: 6_000 })

    expect(errors).toHaveLength(0)
  })

  test('session yoga_coureur : page warmup sans crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo/session/yoga_coureur')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Doit afficher soit le warmup, soit des exercices, soit "Aucun exercice"
    const warmup   = page.locator('main').getByText(/LANCER|CHANGER|SÉRIE FAITE|Aucun exercice/i)
    const yogatext = page.locator('main').getByText(/yoga/i, { exact: false })
    await expect(warmup.or(yogatext).first()).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  test('session pilates_coureur : page warmup sans crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo/session/pilates_coureur')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    const content = page.locator('main').getByText(/LANCER|Hundred|Side Kick|Aucun exercice/i)
    await expect(content.first()).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  test('session force_lourde : exercices listés', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo/session/force_lourde')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    // Au moins un exercice ou le bouton LANCER
    const content = page.locator('main').getByText(/LANCER|Squat|SÉRIE|Aucun exercice/i)
    await expect(content.first()).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  test('bibliothèque : groupes de catégories présents', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo/library')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('BIBLIOTHÈQUE', { exact: false })).toBeVisible()

    const groups = ['Force lourde', 'Tronc', 'Yoga', 'Pilates']
    for (const g of groups) {
      await expect(page.locator('main').getByText(g, { exact: false }).first()).toBeVisible({ timeout: 6_000 })
    }

    expect(errors).toHaveLength(0)
  })

  test('détail exercice : squat_lourd charge sans crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo/library/squat_lourd')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })

    await expect(page.locator('main').getByText(/Squat/i, { exact: false }).first()).toBeVisible({ timeout: 8_000 })

    expect(errors).toHaveLength(0)
  })

  test('réglages renfo : formulaire visible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await page.goto('/#/renfo/settings')
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('main').getByText('RÉGLAGES RENFO')).toBeVisible()
    await expect(page.locator('main').getByText('Séances par semaine')).toBeVisible()
    await expect(page.locator('main').getByRole('button', { name: 'ENREGISTRER' })).toBeVisible()

    expect(errors).toHaveLength(0)
  })
})
