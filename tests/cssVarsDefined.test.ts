// Garde-fou : toute variable CSS `var(--vl-…)` utilisée dans le code source doit
// être DÉFINIE dans style.css. Régression réelle (ravito) : un composant utilisait
// `--vl-accent`, `--vl-border`, `--vl-surface-2`, `--vl-text-1` — variables
// inexistantes → bouton « Enregistrer » sans fond (invisible), rien ne se
// sauvegardait. Ce test empêche toute nouvelle référence à une variable fantôme.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve('.')

function readAll(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) readAll(p, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

// Variables définies dans style.css (base + thèmes light/dark).
const css = readFileSync(resolve(ROOT, 'style.css'), 'utf8')
const defined = new Set<string>()
for (const m of css.matchAll(/(--vl-[a-z0-9-]+)\s*:/gi)) defined.add(m[1])

// Variables réellement utilisées dans le code (TSX/TS de src/).
const used = new Map<string, string>() // var -> premier fichier
for (const file of readAll(resolve(ROOT, 'src'), ['.tsx', '.ts'])) {
  const content = readFileSync(file, 'utf8')
  // Uniquement les usages SANS valeur de repli : `var(--vl-x)` (et non
  // `var(--vl-x, #fallback)`, qui reste sûr même si la variable n'existe pas).
  for (const m of content.matchAll(/var\((--vl-[a-z0-9-]+)\s*\)/gi)) {
    if (!used.has(m[1])) used.set(m[1], file.replace(ROOT + '/', ''))
  }
}

describe('variables CSS --vl-* : toute référence est définie', () => {
  it('style.css définit un socle de variables', () => {
    expect(defined.size).toBeGreaterThan(15)
  })

  it('aucune variable --vl-* fantôme dans src/', () => {
    const phantom = [...used.entries()].filter(([v]) => !defined.has(v))
      .map(([v, f]) => `${v} (${f})`)
    expect(phantom, `Variables CSS non définies dans style.css :\n  ${phantom.join('\n  ')}`).toEqual([])
  })
})
