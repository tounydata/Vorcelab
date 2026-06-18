// Capture d'écran d'un écran *connecté* de l'app, en local, pour faire du design
// sans coder à l'aveugle. Pointe sur le projet Supabase dev via .env.local.
//
//   node scripts/shot.mjs [route] [sortie.png]
//
// Exemples :
//   node scripts/shot.mjs                       → dashboard → /tmp/shot.png
//   node scripts/shot.mjs '/#/calendrier' cal.png
//
// Lancer DEPUIS le dossier projet (sinon @playwright/test introuvable).
// Le navigateur chromium est dans /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH).

import { chromium } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'

// Le navigateur préinstallé peut ne pas matcher la version de Playwright. On
// cherche un chromium sous /opt/pw-browsers (SHOT_CHROME force un chemin précis).
function findChrome() {
  if (process.env.SHOT_CHROME) return process.env.SHOT_CHROME
  const root = '/opt/pw-browsers'
  if (!existsSync(root)) return null
  for (const d of readdirSync(root).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
    const p = `${root}/${d}/chrome-linux/chrome`
    if (existsSync(p)) return p
  }
  return null
}
const CHROME = findChrome()

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173'
const EMAIL = process.env.SHOT_EMAIL ?? 'test@vorcelab.app'
const PASSWORD = process.env.SHOT_PASSWORD ?? 'vorcelabtest123'

const route = process.argv[2] ?? '/'
const out = process.argv[3] ?? '/tmp/shot.png'

const url = (r) => `${BASE}/${r.replace(/^\//, '')}`

// Le navigateur préinstallé peut ne pas matcher la version de Playwright : on
// autorise un chemin explicite (SHOT_CHROME) pour éviter un re-téléchargement.
const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  // L'environnement headless intercepte le TLS avec une CA inconnue de Chromium :
  // toute requête HTTPS (Supabase, fonts) échouait en « Failed to fetch »
  // (net::ERR_CERT_AUTHORITY_INVALID). On ignore l'erreur de certif (capture only).
  args: ['--ignore-certificate-errors'],
})
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()

// Diagnostics : on veut voir les erreurs réseau (ex. « Failed to fetch ») et console.
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text())
})
page.on('requestfailed', (r) => {
  console.log('[requestfailed]', r.method(), r.url(), '→', r.failure()?.errorText)
})
page.on('response', (r) => {
  if (r.url().includes('/auth/v1/')) console.log('[auth]', r.status(), r.url())
})

await page.goto(url('/'), { waitUntil: 'networkidle' })

// Déjà connecté ? (formulaire absent) → on saute le login.
const emailInput = page.locator('input[type=email]').first()
if (await emailInput.count()) {
  console.log('Login…')
  await emailInput.fill(EMAIL)
  await page.locator('input[type=password]').first().fill(PASSWORD)
  await page.locator('button[type=submit]').first().click()

  // On attend que l'écran d'auth disparaisse (connexion réussie) OU un message d'erreur.
  await Promise.race([
    page.waitForSelector('#authScreen', { state: 'detached', timeout: 20000 }).catch(() => {}),
    page.waitForSelector('.auth-msg', { timeout: 20000 }).catch(() => {}),
  ])
  const err = await page.locator('.auth-msg').first().textContent().catch(() => null)
  if (err) console.log('[auth-msg]', err.trim())
}

// Route demandée (hash router).
if (route !== '/') {
  await page.goto(url(route), { waitUntil: 'networkidle' })
}
await page.waitForTimeout(800)

await page.screenshot({ path: out, fullPage: true })
console.log('→', out)

await browser.close()
