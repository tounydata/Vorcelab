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
      { selector: '[data-tour="dash-race"]', title: 'Ta stratégie de course', body: 'Le cœur de Vorcelab : ta course visée, le compte à rebours et la projection de ton temps. Clique la carte pour ouvrir la stratégie détaillée (parcours, allures, ravito).' },
      { selector: '[data-tour="dash-coach"]', title: 'Ton coach, aujourd’hui', body: 'La séance proposée du jour (jamais imposée — tu choisis), ton renfo, et ton rythme des 7 derniers jours. Touche la carte pour ouvrir ton plan complet.' },
      { selector: '[data-tour="dash-state"]', title: 'Ton état du jour', body: 'Forme, fatigue et fraîcheur calculées depuis tes activités. Le graphe montre ta charge des 6 dernières semaines — survole pour le détail jour par jour.' },
      { selector: '[data-tour="dash-recent"]', title: 'Ce mois & tes sorties', body: 'Ton volume du mois et tes dernières séances. Clique une sortie pour son débrief détaillé (allure, FC, dérive, comparaison). ⚑ Pense à étiqueter tes courses comme « course » : c’est ce qui nourrit ton calibrage (VDOT/VMA). Et avec « ⇅ Réorganiser », range ton dashboard dans l’ordre que TU veux.' },
    ],
  },
  {
    id: 'coach',
    match: (p) => p === '/coach',
    steps: [
      { selector: '.coach-hero', title: 'Ton cap vers le jour J', body: "La course visée, le compte à rebours et la périodisation complète (base → développement → spécifique → affûtage → course). La frise te montre où tu en es et le volume du plan." },
      { selector: '[data-tour="coach-week"]', title: 'Ta semaine, séance par séance', body: "Le menu de ta semaine — course ET renfo, intégrés et co-périodisés. Clique une séance pour son détail : pour la course, profil + liaison Strava ; pour le renfo, la suggestion et les catégories (excentrique, tronc…). Tu choisis, rien n'est imposé. (« Ton moteur » VDOT/VMA/forme vit désormais dans Profil › LABO.)" },
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
