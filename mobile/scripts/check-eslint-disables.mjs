#!/usr/bin/env node
// Garde-fou anti-dette (audit — point 2) : empêche l'apparition de NOUVELLES
// désactivations ESLint non justifiées.
//
// Règles appliquées :
//   1. Chaque `eslint-disable[-next-line|-line]` de mobile/src DOIT porter une
//      justification, sous la forme `-- <raison>` (convention ESLint).
//   2. Le nombre total de désactivations ne peut pas DÉPASSER la baseline
//      ci-dessous. Pour en ajouter une, il faut la justifier ET abaisser
//      volontairement la baseline dans un commit dédié → visible en revue.
//
// But : le lint reste à 0 warning, et la dette d'exceptions ne peut que
// diminuer, jamais gonfler en douce.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname
// Baseline = nombre d'exceptions existantes, toutes justifiées (voir README).
// Abaisse cette valeur quand tu en supprimes ; ne l'augmente jamais sans revue.
// 21 → 22 (P1.1) : loader natif du GPX de la course cible dans useCoachPlan
// (reset au changement de cible → setState synchrone dans un effet ; même motif
// légitime que l'effet isLoading, faute de data-loader framework en natif).
const BASELINE = 22

const DISABLE_RE = /eslint-disable(?:-next-line|-line)?\b/
// justification = un `--` suivi d'au moins un mot, sur la même ligne.
const JUSTIFIED_RE = /--\s+\S/

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.(t|j)sx?$/.test(e.name)) out.push(p)
  }
  return out
}

let total = 0
const unjustified = []
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!DISABLE_RE.test(line)) return
    total++
    if (!JUSTIFIED_RE.test(line)) {
      unjustified.push(`${file.replace(SRC, 'src/')}:${i + 1}  ${line.trim()}`)
    }
  })
}

let failed = false
if (unjustified.length) {
  console.error(`\n✗ ${unjustified.length} désactivation(s) ESLint SANS justification ( -- raison ) :`)
  unjustified.forEach((u) => console.error('   ' + u))
  failed = true
}
if (total > BASELINE) {
  console.error(`\n✗ ${total} désactivations ESLint > baseline ${BASELINE}. Justifie-la ET abaisse la baseline (revue).`)
  failed = true
}

if (failed) process.exit(1)
console.log(`✓ Désactivations ESLint : ${total}/${BASELINE}, toutes justifiées.`)
