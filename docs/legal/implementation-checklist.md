# Checklist d’alignement juridique Vorcelab

Date de référence : 21 juillet 2026

Les pages légales décrivent le fonctionnement cible. Les paiements réels doivent rester désactivés tant que les éléments marqués bloquants ne sont pas terminés.

## Bloquants administratifs

- [ ] Immatriculer l’entreprise individuelle / micro-entreprise.
- [ ] Renseigner le SIREN / SIRET.
- [ ] Renseigner une adresse professionnelle publique.
- [ ] Renseigner un numéro de téléphone professionnel.
- [ ] Adhérer à un médiateur de la consommation et publier ses coordonnées.
- [ ] Remplacer GitHub Pages par un hébergement adapté à l’exploitation commerciale et publier l’identité complète de l’hébergeur.
- [ ] Faire une validation finale des textes et du parcours de commande avant lancement.

## Inscription et consentements

- [ ] Exiger nom, prénom, e-mail et date de naissance complète.
- [ ] Réserver l’inscription aux personnes de 18 ans ou plus.
- [ ] Rendre la connexion Strava nécessaire aux fonctions principales.
- [ ] Ajouter une case obligatoire d’acceptation des CGU et de reconnaissance de la politique de confidentialité.
- [ ] Ajouter une case distincte, décochée par défaut, de consentement explicite au traitement des données sportives et physiologiques susceptibles de révéler l’état de santé.
- [ ] Bloquer la finalisation de l’inscription sans les deux acceptations.
- [ ] Conserver la version, la date, l’heure et la preuve de chaque acceptation.

## Paiement et abonnement

- [ ] Conserver une seule offre PRO à 5 € TTC/mois ou 50 € TTC/an.
- [ ] Afficher la périodicité, le renouvellement automatique et le prix total avant paiement.
- [ ] Ajouter une case distincte demandant l’activation immédiate avant la fin du délai de rétractation.
- [ ] Utiliser des boutons explicites : « S’abonner et payer 5 € TTC par mois » et « S’abonner et payer 50 € TTC par an ».
- [ ] Envoyer une confirmation durable contenant l’offre, le prix, la date, la version des CGV, la résiliation et la rétractation.
- [ ] Prévoir sept jours de régularisation après un échec de paiement avant suspension PRO.
- [ ] Permettre la résiliation web depuis Vorcelab et le portail Stripe, effective à la fin de la période payée.
- [ ] Prévoir la gestion App Store et Google Play pour les achats mobiles.
- [ ] Informer au moins soixante jours avant une hausse de prix applicable au renouvellement.

## Rétractation

- [ ] Ajouter une fonctionnalité accessible « Renoncer au contrat ici » pendant les quatorze jours suivant la souscription.
- [ ] Demander les informations nécessaires à l’identification du contrat.
- [ ] Ajouter une validation finale « Confirmer la rétractation ».
- [ ] Envoyer immédiatement un accusé de réception horodaté.
- [ ] Couper l’accès PRO lors du traitement.
- [ ] Calculer le montant proportionnel au service déjà fourni.
- [ ] Rembourser le solde sur le moyen de paiement d’origine.

## Données et compte

- [ ] Ajouter un export ZIP contenant JSON, CSV et GPX, sans mots de passe, secrets ou jetons.
- [ ] Conserver les factures et données comptables dix ans.
- [ ] Limiter les journaux techniques et de sécurité à douze mois maximum.
- [ ] Supprimer les sauvegardes résiduelles au plus tard trente jours après la suppression du compte.
- [ ] Détecter les comptes inactifs depuis deux ans et envoyer un avertissement trente jours avant suppression.
- [ ] Lors de la déconnexion Strava, supprimer les jetons mais demander explicitement si les activités importées doivent être supprimées.
- [ ] Lors de la suppression du compte, résilier l’abonnement web et rappeler à l’utilisateur de vérifier les abonnements Apple/Google.
- [ ] Garder les fonctions d’export, de résiliation et de suppression accessibles même quand une nouvelle version des CGU attend une acceptation.

## Partage de stratégies

- [ ] Générer les liens publics uniquement après une action volontaire.
- [ ] Utiliser des jetons aléatoires non devinables.
- [ ] Faire expirer les liens après trente jours.
- [ ] Permettre leur révocation à tout moment.
- [ ] Supprimer le lien avec la stratégie ou le compte.
- [ ] Ajouter `noindex` et exclure ces pages du sitemap.
- [ ] Ne pas permettre le téléchargement direct du GPX depuis le lien.

## GPX mutualisés

- [ ] Mutualiser uniquement le tracé et les informations objectives de la course.
- [ ] Ne jamais associer publiquement l’identité de l’importateur au tracé commun.
- [ ] Prévoir une fonction d’administration pour corriger, remplacer ou retirer un tracé.

## Services tiers et sécurité

- [ ] Vérifier que Sentry ne reçoit ni e-mail, ni jeton, ni trace GPS complète, ni donnée sportive sensible.
- [ ] Maintenir à jour la liste des fournisseurs : Supabase, Strava, Stripe, Apple, Google, Sentry, Open-Meteo, MapTiler, OpenStreetMap, Overpass API, OVHcloud et hébergeur web.
- [ ] Mettre à jour la politique avant d’ajouter un outil d’analyse d’audience, de publicité ou un fournisseur d’IA externe recevant des données utilisateur.
- [ ] Utiliser uniquement des traceurs nécessaires tant qu’aucune bannière de consentement n’est mise en place.

## Vérifications finales

- [ ] Vérifier que `MISSING_LEGAL_INFO` est vide uniquement quand tous les prérequis sont réellement satisfaits.
- [ ] Tester la réacceptation après changement de version des CGU ou de la politique de confidentialité.
- [ ] Tester les parcours inscription, paiement, résiliation, rétractation, export et suppression sur web, iOS et Android.
