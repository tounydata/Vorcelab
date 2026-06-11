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
      { selector: '[data-tour="dash-coach"]', title: 'Ton coach, cette semaine', body: 'Ta semaine d’entraînement en un coup d’œil : course et renfo fusionnés, co-périodisés vers ta course cible. Ouvre ton plan complet avec « Mon plan ».' },
      { selector: '[data-tour="dash-recent"]', title: 'Ce mois & tes sorties', body: 'Ton volume du mois et tes dernières séances. Clique une sortie pour son débrief détaillé (allure, FC, dérive, comparaison).' },
    ],
  },
  {
    id: 'coach',
    match: (p) => p === '/coach',
    steps: [
      { selector: '.coach-hero', title: 'Ton cap vers le jour J', body: "La course visée, le compte à rebours et la périodisation complète (base → développement → spécifique → affûtage → course). La frise te montre où tu en es et le volume du plan." },
      { selector: '.coach-engine', title: 'Ton moteur', body: "Ce que l'algo lit de toi : niveau (VDOT), forme (CTL), fraîcheur, durabilité, côtes. C'est ce qui calibre ton plan et justifie chaque séance." },
      { selector: '[data-tour="coach-week"]', title: 'Cette semaine', body: 'Tes séances proposées — jamais imposées. Tu choisis ta séance du jour, tu la lies à ton activité Strava, et le plan s’adapte à ton ressenti. Ton renfo de la semaine est intégré juste en dessous.' },
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
  {
    id: 'strategy',
    match: (p) => p.startsWith('/race/'),
    steps: [
      { selector: '[data-tour="strat-plan"]', title: 'Ton plan de course', body: 'Ta projection de temps (prudent · cible · agressif) et le découpage du parcours. Le plan est calculé depuis le GPX et ton profil par gradient.' },
      { selector: '[data-tour="strat-sections"]', title: 'Sections clés', body: 'Les portions qui comptent (grosses montées, technique, final) avec l’effort attendu — pour savoir où pousser et où gérer.' },
      { selector: '[data-tour="strat-nutrition"]', title: 'Plan nutrition', body: 'Ton ravitaillement section par section (glucides · hydratation), basé sur les produits cochés dans ton profil. Déplie pour le détail.' },
    ],
  },
  {
    id: 'profile',
    match: (p) => p === '/profile',
    steps: [
      { selector: '[data-tour="profile-account"]', title: 'Ton profil', body: 'Commence ici : renseigne ton compte et tes données physio (FC max, VO2max). C’est ce qui calibre tes allures et ton coach — plus c’est complet, plus c’est juste.' },
      { selector: '[data-tour="profile-settings"]', title: 'Tes paramètres', body: 'C’est ici que tu connectes Strava (indispensable pour analyser tes sorties), choisis ton orientation coach (plaisir / mix / performance), tes jours par semaine et ton objectif renfo.' },
      { selector: '[data-tour="profile-nutrition"]', title: 'Tes produits nutrition', body: 'Coche ici tes gels / boissons / barres par marque : ils alimentent automatiquement ton plan de ravitaillement en stratégie de course.' },
    ],
  },
]
