// Tours contextuels par page : chaque étape pointe un élément réel (selector),
// le moteur (SpotlightTour) floute le reste et l'explique. Déclenché à l'entrée
// de la page (1ʳᵉ visite) et rejouable via « ? ».

export interface TourStep {
  selector: string
  title: string
  body: string
}

export interface PageTour {
  id: string
  match: (pathname: string) => boolean
  steps: TourStep[]
}

export const PAGE_TOURS: PageTour[] = [
  {
    id: 'dashboard',
    match: (p) => p === '/',
    steps: [
      { selector: '[data-tour="dash-race"]', title: 'Stratégie de course', body: 'Ta course visée, le compte à rebours et la projection Vorcelab de ton temps. Clique la carte pour ouvrir la stratégie détaillée (parcours, allures, ravito).' },
      { selector: '[data-tour="dash-state"]', title: 'Ton état du jour', body: 'Forme, fatigue et fraîcheur calculées depuis tes activités. Le graphe montre ta charge des 6 dernières semaines — survole pour le détail jour par jour.' },
      { selector: '[data-tour="dash-recent"]', title: 'Ce mois & tes sorties', body: 'Ton volume du mois et tes dernières séances. Clique une sortie pour son débrief détaillé (allure, FC, dérive, comparaison).' },
    ],
  },
  {
    id: 'coach',
    match: (p) => p === '/coach',
    steps: [
      { selector: '.coach-hero', title: 'Ton cap vers le jour J', body: "La course visée, le compte à rebours et la périodisation complète (base → développement → spécifique → affûtage → course). La frise te montre où tu en es et le volume du plan." },
      { selector: '.coach-engine', title: 'Ton moteur', body: "Ce que l'algo lit de toi : niveau (VDOT), forme (CTL), fraîcheur, durabilité, côtes. C'est ce qui calibre ton plan et justifie chaque séance." },
      { selector: '[data-tour="coach-week"]', title: 'Cette semaine', body: 'Tes séances proposées — jamais imposées. Tu choisis ta séance du jour, tu la lies à ton activité Strava, et le plan s’adapte à ton ressenti.' },
    ],
  },
  {
    id: 'renfo',
    match: (p) => p === '/renfo',
    steps: [
      { selector: '.rhero', title: 'Co-périodisation', body: "Ton bloc de renfo dialogue avec ta course : on protège tes séances clés et on évite d'empiler la fatigue (ex. pas de pliométrie après une grosse séance de côtes)." },
      { selector: '.rsuggest', title: 'Séance suggérée', body: "La séance recommandée d'après ta charge du moment. Tu peux la lancer directement… ou choisir librement ci-dessous." },
      { selector: '.rfocgrid', title: 'Ta bibliothèque', body: 'Tes séances par catégorie (force & puissance, mobilité & prévention), avec ce qui est recommandé ★ ou à éviter cette semaine.' },
    ],
  },
]
