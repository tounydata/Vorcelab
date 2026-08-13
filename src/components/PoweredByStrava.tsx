/**
 * Attribution « Powered by Strava », logo OFFICIEL.
 *
 * Les Brand Guidelines Strava imposent d'utiliser le logo fourni, sans le modifier,
 * l'animer ni le recolorer, et exigent qu'il reste distinct du logo de l'application
 * et jamais plus proéminent que lui. C'est pourquoi il est servi tel quel depuis
 * `/public/strava` et contraint en largeur.
 *
 * Deux variantes officielles sont installées ; on choisit selon le fond plutôt que de
 * teinter l'asset en CSS, ce que les guidelines interdisent. L'interface Vorcelab est
 * sombre, d'où la variante BLANCHE par défaut : sur la version orange, le mot
 * « POWERED BY » est encre foncée et devient illisible sur fond noir.
 */
export function PoweredByStrava({ variant = 'white' }: { variant?: 'orange' | 'white' }) {
  const file =
    variant === 'white'
      ? 'api_logo_pwrdBy_strava_horiz_white.svg'
      : 'api_logo_pwrdBy_strava_horiz_orange.svg'

  return (
    <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
      <img
        src={`${import.meta.env.BASE_URL}strava/${file}`}
        alt="Powered by Strava"
        // Bornée : l'attribution ne doit jamais dominer l'identité de Vorcelab.
        style={{ width: '100%', maxWidth: 88, height: 'auto', display: 'block' }}
      />
    </div>
  )
}
