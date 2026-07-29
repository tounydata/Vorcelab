import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/20260729110343_admin_lab_readonly_support.sql'),
  'utf8',
).toLowerCase()

const snapshotFunction = migration.slice(
  migration.indexOf('create or replace function public.admin_get_user_support_snapshot'),
  migration.indexOf('create or replace function public.admin_get_data_access_log'),
)

describe('labo admin sécurisé', () => {
  it('journalise chaque ouverture avec un motif obligatoire', () => {
    expect(migration).toContain('create table if not exists public.admin_data_access_log')
    expect(snapshotFunction).toContain('char_length(clean_reason) < 8')
    expect(snapshotFunction).toContain('insert into public.admin_data_access_log')
  })

  it('contrôle le rôle admin côté serveur', () => {
    expect(snapshotFunction).toContain('is_admin is true')
    expect(snapshotFunction).toContain("raise exception 'forbidden'")
    expect(snapshotFunction).toContain('security definer')
    expect(snapshotFunction).toContain('set search_path = public, pg_temp')
  })

  it('retire les RPC sensibles à anon et PUBLIC', () => {
    expect(migration).toContain(
      'revoke execute on function public.admin_get_user_support_snapshot(uuid, text)\n  from anon, public',
    )
    expect(migration).toContain(
      'grant execute on function public.admin_get_user_support_snapshot(uuid, text)\n  to authenticated',
    )
    expect(migration).toContain(
      'revoke all on table public.admin_data_access_log from anon, authenticated, public',
    )
  })

  it('ne renvoie jamais les secrets de connexion ou de paiement', () => {
    expect(snapshotFunction).not.toContain('st.access_token')
    expect(snapshotFunction).not.toContain('st.refresh_token')
    expect(snapshotFunction).not.toContain('p.stripe_customer_id')
    expect(snapshotFunction).not.toContain('sa.raw_data')
    expect(snapshotFunction).not.toContain('sa.raw,')
  })

  it('rend les parcours d’écriture inoffensifs en prévisualisation', () => {
    const oneRm = readFileSync(resolve('src/components/coach/OneRMTestPopup.tsx'), 'utf8')
    const onboarding = readFileSync(resolve('src/components/onboarding/Onboarding.tsx'), 'utf8')
    const upgrade = readFileSync(resolve('src/components/UpgradeModal.tsx'), 'utf8')

    expect(oneRm).toContain('if (previewMode) return')
    expect(onboarding).toContain('if (previewMode || !user) return')
    expect(upgrade).toContain('if (effectivePreviewMode)')
    expect(upgrade).toContain('previewMode || isSupportSessionWindow()')
    expect(upgrade).toContain('MODE TEST · AUCUN PAIEMENT')
  })
})
