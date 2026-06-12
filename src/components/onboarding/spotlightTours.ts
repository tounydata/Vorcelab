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
      { selector: '[data-tour="dash-today"]', title: "Ta séance d'aujourd'hui", body: 'La première chose à savoir en ouvrant l’app : ce que tu fais aujourd’hui — course et renfo. Touche la carte pour ouvrir ton plan complet.' },
      { selector: '[data-tour="dash-state"]', title: 'Ton état du jour', body: 'Forme, fatigue et fraîcheur calculées depuis tes activités. Le graphe montre ta charge des 6 dernières semaines — survole pour le détail jour par jour.' },
      { selector: '[data-tour="dash-race"]', title: 'Ta course visée', body: 'Le compte à rebours et la projection Vorcelab de ton temps. Clique la carte pour ouvrir la stratégie détaillée (parcours, allures, ravito).' },
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
      { selector: '[data-tour="coach-week"]', title: 'Cette semaine', body: 'Tes séances proposées — jamais imposées. Tu choisis ta séance du jour, tu la lies à ton activité Strava, et le plan s’adapte à ton ressenti.' },
      { selector: '[data-tour="coach-renfo"]', title: 'Ton renfo, intégré', body: "Le renforcement vit ici, co-périodisé avec ta course : séance suggérée selon ta charge, bibliothèque par focus, et gestion de tes séances récentes (liaison Strava incluse)." },
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
      { selector: '[data-tour="profile-account"]', title: 'Ton profil', body: 'Commence ici : renseigne tes données physio (FC max, VO2max) et tes records. C’est ce qui calibre tes allures et ton coach — plus c’est complet, plus c’est juste.' },
      { selector: '[data-tour="profile-settings"]', title: 'Tes réglages', body: 'Tout ce qui configure l’app vit ici : connexion Strava, orientation coach, matériel renfo, produits nutrition et ton compte.' },
    ],
  },
  {
    id: 'settings',
    match: (p) => p === '/profile/settings',
    steps: [
      { selector: '[data-tour="settings-strava"]', title: 'Connexion Strava', body: 'Connecte ta montre : indispensable pour analyser tes sorties, calculer ta charge et estimer ta VO2max. Tu peux forcer une synchro ou te déconnecter ici.' },
      { selector: '[data-tour="settings-app"]', title: 'Ton coach & ton matériel', body: 'Orientation (plaisir / mix / performance), jours de course par semaine, objectif renfo et matériel disponible — c’est ce qui calibre ton plan.' },
      { selector: '[data-tour="profile-nutrition"]', title: 'Tes produits nutrition', body: 'Coche ici tes gels / boissons / barres par marque : ils alimentent automatiquement ton plan de ravitaillement en stratégie de course.' },
    ],
  },
]
