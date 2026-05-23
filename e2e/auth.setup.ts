import { test as setup, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { AUTH_FILE } from './constants'

const SUPA_URL  = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhbnpya2RncW1jY3R3dm5ibXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjYyNjksImV4cCI6MjA5MzAwMjI2OX0.sSjZ956YRpSpCFxDrYDntTvIGHnmVEbe3JDsjTJsze4'
const SUPA_KEY  = 'sb-wanzrkdgqmcctwvnbmuv-auth-token'

setup('créer la session de test', async ({ page }) => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email      = process.env.VORCELAB_TEST_EMAIL
  const password   = process.env.VORCELAB_TEST_PASSWORD

  if (!serviceKey || !email || !password) {
    throw new Error(
      'Variables manquantes. Copier .env.test.example → .env.test et renseigner :\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=...\n' +
      '  VORCELAB_TEST_EMAIL=...\n' +
      '  VORCELAB_TEST_PASSWORD=...'
    )
  }

  // ── 1. Créer le compte test (idempotent) ─────────────────────────────────
  const admin = createClient(SUPA_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr && !createErr.message.toLowerCase().includes('already')) {
    throw new Error(`Création du compte test impossible : ${createErr.message}`)
  }

  // ── 2. Récupérer une session (côté Node, pas de navigateur) ──────────────
  const client = createClient(SUPA_URL, SUPA_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { session }, error: signInErr } =
    await client.auth.signInWithPassword({ email, password })

  if (signInErr || !session) {
    throw new Error(
      `Connexion impossible (compte créé mais signIn échoue) : ${signInErr?.message ?? 'session null'}\n` +
      'Si le compte existait déjà avec un autre mot de passe, supprimer-le depuis le dashboard Supabase.'
    )
  }

  // ── 3. Injecter la session dans le localStorage du navigateur ─────────────
  await page.goto('http://localhost:4173/Vorcelab/app/#/')
  await page.evaluate(
    ([key, val]) => localStorage.setItem(key, val),
    [SUPA_KEY, JSON.stringify(session)] as [string, string]
  )
  await page.reload()

  // ── 4. Attendre que l'app reconnaisse la session (sidebar visible) ────────
  await expect(
    page.getByRole('navigation').first(),
    'Layout sidebar : la session doit être reconnue'
  ).toBeVisible({ timeout: 12_000 })

  // ── 5. Sauvegarder le storageState pour les tests suivants ────────────────
  await page.context().storageState({ path: AUTH_FILE })
})
