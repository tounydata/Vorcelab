// Prépare `dist/` pour la publication statique. Logique partagée entre
// GitHub Pages (deploy-pages.yml) et Cloudflare Pages (build command).
//
//   node scripts/pages-postbuild.mjs --github      → + 404.html (fallback SPA
//                                                     GH Pages) + CNAME
//   node scripts/pages-postbuild.mjs --cloudflare  → rien de plus : CF Pages
//                                                     fait le fallback SPA
//                                                     nativement (200) et le
//                                                     domaine est géré côté CF
//
// Dans les deux cas : matérialise les pages publiques du sitemap en vraies
// copies d'index.html (réponse 200, indexable) avec canonical + og:url propres
// à chaque page — sinon chaque copie garderait le canonical de la home et
// Google replierait tout sur vorcelab.app/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const mode = process.argv[2]
if (mode !== '--github' && mode !== '--cloudflare') {
  console.error('Usage: node scripts/pages-postbuild.mjs --github | --cloudflare')
  process.exit(1)
}

const DIST = 'dist'
const ORIGIN = 'https://vorcelab.app'
const PUBLIC_ROUTES = ['login', 'demo', 'legal/cgu', 'legal/confidentialite']

const index = readFileSync(`${DIST}/index.html`, 'utf8')

for (const route of PUBLIC_ROUTES) {
  mkdirSync(`${DIST}/${route}`, { recursive: true })
  const html = index
    .replaceAll(`href="${ORIGIN}/"`, `href="${ORIGIN}/${route}/"`)
    .replaceAll(`content="${ORIGIN}/"`, `content="${ORIGIN}/${route}/"`)
  writeFileSync(`${DIST}/${route}/index.html`, html)
}

if (mode === '--github') {
  writeFileSync(`${DIST}/404.html`, index)
  writeFileSync(`${DIST}/CNAME`, 'vorcelab.app\n')
}

console.log(`pages-postbuild ${mode} : ${PUBLIC_ROUTES.length} routes générées`)
