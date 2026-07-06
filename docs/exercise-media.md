# Démos d'exercices renfo — WebP GymVisual

Chaque exercice actif a une démo animée **WebP** (source : GymVisual, licence
commerciale royalty-free) dans `public/exercises/<id>.webp`, servie par le CDN
GitHub Pages / Cloudflare.

- **Web** : `src/lib/renfoMedia.ts` → `getExerciseMediaUrl(id, location?)` renvoie
  `/exercises/<id>.webp`. `src/components/ExerciseMedia.tsx` l'affiche (le WebP
  s'anime seul) ou retombe sur un placeholder SVG animé.
- **Mobile** : `mobile/src/lib/renfoMedia.ts` pointe sur `https://vorcelab.app/exercises/…`
  (expo-image gère le WebP animé).

## Variante maison
5 exercices de force ont AUSSI une démo « maison » (poids de corps / haltère) en
plus de la version salle : `<id>.maison.webp` (squat_lourd, rdl, bulgare,
mollets_lourds, hip_thrust). Utilisée quand le lieu de séance sélectionné est
« maison ».

## Pipeline de conversion (référence)
GIF GymVisual (résolution `_360`) → WebP animé via `sharp` :
`sharp(gif, { animated: true }).webp({ quality: 72, effort: 5 })`.
~270 Ko GIF → ~77 Ko WebP. Le mapping référence GymVisual → id exercice est fait
à partir du bon de commande.

## Ajouter / remplacer une démo
1. Déposer `<id>.webp` (et éventuellement `<id>.maison.webp`) dans `public/exercises/`.
2. Ajouter l'`<id>` au set `COVERED` de `src/lib/renfoMedia.ts` ET
   `mobile/src/lib/renfoMedia.ts`.
