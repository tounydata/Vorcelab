import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { MISSING_LEGAL_INFO } from '../lib/legalVersions'

const UPDATED = '21 juillet 2026'
const CONTACT_EMAIL = 'vorcelab@gmail.com'

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--vl-bg)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <Link to="/" style={{ textDecoration: 'none', fontFamily: 'var(--vl-display)', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--vl-ember)' }}>
            VORCELAB
          </Link>
          <Link to="/"><button className="hbtn">← Retour</button></Link>
        </div>

        <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(1.8rem, 5vw, 2.4rem)', fontWeight: 800, lineHeight: 1.05, margin: '0 0 6px' }}>
          {title}
        </h1>
        <div className="mlabel" style={{ marginBottom: '2rem' }}>Dernière mise à jour : {UPDATED}</div>

        <div className="legal-body" style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--vl-text-2)' }}>
          {children}
        </div>

        <div style={{ marginTop: '3rem', paddingTop: '1.25rem', borderTop: '1px solid var(--vl-line)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Link to="/legal/cgu" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>CGU / CGV</Link>
          <Link to="/legal/confidentialite" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Confidentialité</Link>
          <Link to="/legal/mentions" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Mentions légales</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Contact</a>
        </div>
      </div>
    </div>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontFamily: 'var(--vl-display)', fontSize: '1.15rem', fontWeight: 800, letterSpacing: '.02em', color: 'var(--vl-text)', margin: '2rem 0 .6rem' }}>{children}</h2>
}

function LegalContact() {
  return <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--vl-ember)' }}>{CONTACT_EMAIL}</a>
}

function MissingLegalInfo() {
  return (
    <div style={{ padding: '1rem', border: '1px solid var(--vl-line)', borderRadius: 12, margin: '1rem 0' }}>
      <strong>Informations à compléter avant l'ouverture des paiements</strong>
      <ul style={{ paddingLeft: '1.2rem', marginBottom: 0 }}>
        {MISSING_LEGAL_INFO.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

export function MentionsPage() {
  return (
    <Shell title="Mentions légales">
      <H2>1. Éditeur</H2>
      <p>
        Le site et l'application Vorcelab sont édités par <strong>Anthony Bollecker</strong>,
        entrepreneur individuel devant exercer sous le nom commercial <strong>Vorcelab</strong>.
      </p>
      <p>
        SIREN : <em>à compléter après immatriculation</em><br />
        Adresse professionnelle : <em>à compléter avant ouverture commerciale</em><br />
        Téléphone professionnel : <em>à compléter avant ouverture commerciale</em><br />
        Adresse électronique : <LegalContact /><br />
        Site : <a href="https://vorcelab.app" style={{ color: 'var(--vl-ember)' }}>https://vorcelab.app</a>
      </p>
      <p>
        Sous réserve de l'application de la franchise en base de TVA, les factures porteront
        la mention « TVA non applicable, article 293 B du Code général des impôts ».
      </p>

      <H2>2. Directeur de la publication</H2>
      <p>Le directeur de la publication est <strong>Anthony Bollecker</strong>.</p>

      <H2>3. Hébergement et infrastructure</H2>
      <p>
        L'application web de pré-lancement est servie par <strong>GitHub Pages</strong>.
        L'hébergeur commercial définitif devra être indiqué ici avant l'activation des paiements.
      </p>
      <p>
        La base de données, l'authentification et certaines fonctions serveur sont fournies
        par <strong>Supabase</strong>, sur une infrastructure située dans l'Union européenne,
        actuellement dans la région AWS <code>eu-north-1</code> à Stockholm.
      </p>
      <p>
        Le nom de domaine vorcelab.app est enregistré auprès d'<strong>OVHcloud</strong>.
        Les paiements web sont traités par <strong>Stripe</strong>. Les achats mobiles seront
        traités par Apple ou Google selon la plateforme utilisée.
      </p>

      <H2>4. Objet du service</H2>
      <p>
        Vorcelab est un service d'analyse et d'accompagnement sportif permettant notamment
        de synchroniser des activités Strava, d'analyser des performances, de créer des plans
        et stratégies de course et d'exploiter des données sportives fournies par l'utilisateur.
      </p>

      <H2>5. Propriété intellectuelle</H2>
      <p>
        La structure, l'interface, l'identité visuelle, les contenus originaux, les moteurs de
        calcul, les algorithmes et les bases de données de Vorcelab sont protégés. Toute
        reproduction, extraction, adaptation ou réutilisation non autorisée est interdite.
        Les marques et services de tiers restent la propriété de leurs titulaires respectifs.
      </p>

      <H2>6. Responsabilité</H2>
      <p>
        Les analyses, plans, stratégies, allures et projections sont fournis à titre informatif.
        Ils ne constituent ni un avis médical, ni un diagnostic, ni une garantie de résultat.
        L'utilisateur reste responsable de sa pratique, de son état de santé, de son équipement
        et du respect des consignes de sécurité et des organisateurs.
      </p>

      <H2>7. Contact et signalement</H2>
      <p>
        Toute question, réclamation, demande relative aux données personnelles ou signalement
        d'un tracé GPX peut être adressé à <LegalContact />.
      </p>

      <H2>8. Médiation de la consommation</H2>
      <p>
        Après une réclamation écrite préalable restée sans solution satisfaisante, le consommateur
        pourra saisir gratuitement le médiateur de la consommation auquel Vorcelab aura adhéré.
        Ses coordonnées seront publiées avant l'ouverture commerciale.
      </p>

      <H2>9. Droit applicable</H2>
      <p>Les présentes mentions légales sont soumises au droit français.</p>

      <MissingLegalInfo />
    </Shell>
  )
}

export function CguPage() {
  return (
    <Shell title="Conditions générales d'utilisation et de vente">
      <H2>1. Éditeur et champ d'application</H2>
      <p>
        Vorcelab (« le Service ») est édité par <strong>Anthony Bollecker</strong>, entrepreneur
        individuel devant exercer sous le nom commercial Vorcelab. Contact : <LegalContact />.
      </p>
      <p>
        Les présentes conditions régissent la création d'un compte, l'utilisation du Service et
        la souscription à Vorcelab PRO. Le Service est destiné uniquement aux consommateurs majeurs
        agissant à des fins personnelles.
      </p>

      <H2>2. Compte et accès</H2>
      <p>
        Vorcelab est réservé aux personnes âgées de 18 ans ou plus. La création d'un compte nécessite
        un nom, un prénom, une adresse électronique valide et une date de naissance complète. Le sexe
        ou le genre est facultatif. La connexion peut être réalisée par e-mail et mot de passe, Google
        ou Apple.
      </p>
      <p>
        La connexion à Strava est nécessaire pour utiliser les fonctions principales. Le compte et
        l'abonnement sont strictement personnels, mais peuvent être utilisés sur plusieurs appareils
        appartenant au même utilisateur.
      </p>

      <H2>3. Service et stratégie offerte</H2>
      <p>
        Vorcelab permet notamment la synchronisation d'activités sportives, l'analyse de données de
        performance, la création de profils, de plans et de stratégies de course, ainsi que l'import
        de traces GPX de courses futures.
      </p>
      <p>
        Chaque compte bénéficie d'une stratégie de course offerte une seule fois à son ouverture.
        Cette stratégie ne constitue pas une période d'essai de l'abonnement PRO.
      </p>

      <H2>4. Avertissement santé</H2>
      <p>
        Les analyses, recommandations, plans et stratégies sont informatifs. Ils ne remplacent pas
        un avis médical, un diagnostic ou le suivi d'un professionnel de santé ou du sport. Vorcelab
        ne garantit aucun résultat sportif. L'utilisateur demeure seul responsable de sa pratique et
        doit interrompre l'effort et consulter un professionnel en cas de doute, douleur ou malaise.
      </p>

      <H2>5. Vorcelab PRO et prix</H2>
      <p>Vorcelab propose une formule PRO selon deux périodicités :</p>
      <ul>
        <li><strong>5 € TTC par mois</strong> ;</li>
        <li><strong>50 € TTC par an</strong>, payés intégralement au début de chaque période annuelle.</li>
      </ul>
      <p>
        L'abonnement donne accès au même compte PRO sur le web, iOS et Android, sous réserve de la
        bonne association de l'achat au compte Vorcelab.
      </p>

      <H2>6. Paiement et renouvellement</H2>
      <p>
        Les paiements web sont traités par Stripe. Les achats iOS et Android sont traités par l'App Store
        ou Google Play. Vorcelab ne stocke aucun numéro complet de carte bancaire.
      </p>
      <p>
        L'abonnement est renouvelé automatiquement par périodes successives d'un mois ou d'un an jusqu'à
        sa résiliation.
      </p>

      <H2>7. Résiliation</H2>
      <p>
        L'utilisateur peut résilier à tout moment. Pour un achat web, la résiliation est effectuée depuis
        le portail client Stripe ou la fonction de résiliation disponible dans Vorcelab. Pour un achat
        mobile, elle est effectuée dans les réglages de l'App Store ou de Google Play.
      </p>
      <p>
        La résiliation prend effet à la fin de la période déjà payée. L'accès PRO reste disponible jusqu'à
        cette date et la période en cours n'est pas remboursée, sauf droit légal contraire.
      </p>

      <H2>8. Échec de paiement</H2>
      <p>
        En cas d'échec de paiement, l'utilisateur dispose de sept jours pour régulariser. À défaut,
        l'accès PRO peut être suspendu sans suppression immédiate du compte ni de ses données.
      </p>

      <H2>9. Droit de rétractation</H2>
      <p>
        Le consommateur dispose de quatorze jours à compter de la conclusion du contrat pour exercer
        son droit de rétractation. Il peut demander expressément l'activation immédiate de Vorcelab PRO
        avant la fin de ce délai.
      </p>
      <p>
        En cas de rétractation après le commencement du service, l'accès PRO est coupé dès le traitement
        de la demande. Le consommateur reste redevable du montant proportionnel au service fourni jusqu'à
        la communication de sa décision ; le solde est remboursé sur le moyen de paiement d'origine.
      </p>
      <p>
        La demande peut être effectuée via la fonctionnalité « Renoncer au contrat ici » disponible pendant
        le délai légal ou par une déclaration dénuée d'ambiguïté envoyée à <LegalContact />. Un accusé de
        réception est transmis sans délai sur un support durable.
      </p>

      <H2>10. Informations et consentements au paiement</H2>
      <p>Avant le paiement, l'utilisateur doit voir le prix, la périodicité et le renouvellement automatique.</p>
      <p>Les cases suivantes doivent être distinctes et décochées par défaut :</p>
      <ul>
        <li>« J'ai lu et j'accepte les Conditions générales d'utilisation et de vente de Vorcelab. »</li>
        <li>
          « Je demande expressément l'activation immédiate de Vorcelab PRO avant la fin du délai légal de
          rétractation de quatorze jours. Je reconnais qu'en cas de rétractation après le commencement du
          service, je resterai redevable du montant proportionnel au service déjà fourni. »
        </li>
      </ul>
      <p>
        Le bouton final doit indiquer clairement « S'abonner et payer 5 € TTC par mois » ou
        « S'abonner et payer 50 € TTC par an ».
      </p>

      <H2>11. Confirmation de souscription</H2>
      <p>
        Après paiement, l'utilisateur reçoit sur un support durable l'offre souscrite, son prix, sa date
        d'activation, la version des présentes conditions acceptée, la procédure de résiliation, la procédure
        de rétractation et la date du prochain renouvellement.
      </p>

      <H2>12. Modification des prix</H2>
      <p>
        Toute hausse de prix est annoncée au moins soixante jours avant le renouvellement concerné. Elle ne
        s'applique pas rétroactivement à une période déjà payée. L'utilisateur peut résilier avant son entrée
        en vigueur.
      </p>

      <H2>13. Traces GPX et base commune</H2>
      <p>
        L'utilisateur peut importer une trace GPX relative à une course future et garantit disposer du droit
        de l'utiliser et de la transmettre. Le tracé et les informations objectives relatives à la course
        peuvent être intégrés automatiquement à une base commune accessible aux autres utilisateurs.
      </p>
      <p>
        L'identité de l'importateur n'est pas associée au tracé mutualisé. Vorcelab peut corriger, remplacer
        ou retirer un tracé erroné, obsolète, modifié par l'organisateur ou contesté de manière fondée.
      </p>

      <H2>14. Partage d'une stratégie</H2>
      <p>
        L'utilisateur peut générer volontairement un lien public vers une stratégie de course future. Ce lien
        peut afficher son nom, son prénom, le tracé prévu, les lieux de départ et d'arrivée et les informations
        de stratégie. Toute personne possédant le lien peut consulter ces informations.
      </p>
      <p>
        Le lien est protégé par un identifiant aléatoire, exclu de l'indexation dans la mesure techniquement
        possible, valable trente jours, révocable et supprimé avec la stratégie ou le compte. Il ne permet pas
        le téléchargement direct du fichier GPX.
      </p>

      <H2>15. Partage d'une activité passée</H2>
      <p>
        L'utilisateur peut générer manuellement une image transparente affichant la distance, le dénivelé,
        le temps écoulé et, à son choix, une représentation schématique du parcours ou un profil altimétrique.
        Cette image ne contient ni nom ni prénom et peut afficher le logo Vorcelab.
      </p>

      <H2>16. Suspension et suppression</H2>
      <p>
        Vorcelab peut suspendre ou supprimer un compte en cas de fraude, non-paiement, atteinte à la sécurité,
        détournement du Service ou violation grave des présentes conditions. Sauf urgence de sécurité ou fraude
        manifeste, un avertissement est envoyé avant la suppression définitive.
      </p>
      <p>
        L'utilisateur peut supprimer son compte après une confirmation renforcée. La suppression entraîne la
        résiliation de l'abonnement web et l'effacement des données actives. Les abonnements Apple ou Google
        doivent également être vérifiés dans les réglages de la plateforme concernée.
      </p>

      <H2>17. Disponibilité et arrêt du service</H2>
      <p>
        Vorcelab peut interrompre temporairement le Service pour maintenance, mise à jour, sécurité ou incident
        technique. Une interruption temporaire ne donne pas automatiquement droit à indemnisation, sauf droit
        légal impératif, faute de l'éditeur ou interruption anormalement longue.
      </p>
      <p>
        En cas d'arrêt définitif, les abonnés sont informés au moins soixante jours à l'avance lorsque cela est
        possible et la partie payée correspondant à la période postérieure à l'arrêt est remboursée.
      </p>

      <H2>18. Modification des conditions</H2>
      <p>
        Toute modification importante est présentée dans Vorcelab au moyen d'une fenêtre demandant une nouvelle
        acceptation. Les fonctions permettant de résilier, d'exporter les données et de supprimer le compte
        restent accessibles même si l'utilisation principale est bloquée dans l'attente de l'acceptation.
      </p>

      <H2>19. Données personnelles</H2>
      <p>
        Le traitement des données est décrit dans la <Link to="/legal/confidentialite" style={{ color: 'var(--vl-ember)' }}>politique de confidentialité</Link>.
        Le traitement de données physiologiques susceptibles de révéler l'état de santé, notamment la fréquence
        cardiaque, repose sur un consentement explicite distinct.
      </p>

      <H2>20. Réclamation, médiation et droit applicable</H2>
      <p>
        Toute réclamation doit d'abord être adressée à <LegalContact />. En l'absence de résolution amiable,
        le consommateur pourra saisir gratuitement le médiateur désigné dans les mentions légales. Les présentes
        conditions sont soumises au droit français, sans priver le consommateur des règles impératives qui le protègent.
      </p>

      <MissingLegalInfo />
    </Shell>
  )
}

export function PrivacyPage() {
  return (
    <Shell title="Politique de confidentialité et cookies">
      <p style={{ fontStyle: 'italic' }}>
        Vos données servent à fournir et sécuriser Vorcelab. Elles ne sont ni revendues, ni utilisées pour
        de la publicité ciblée. Vous pouvez les exporter et supprimer votre compte.
      </p>

      <H2>1. Responsable du traitement</H2>
      <p>
        Le responsable du traitement est <strong>Anthony Bollecker</strong>, entrepreneur individuel devant
        exercer sous le nom commercial Vorcelab. Contact : <LegalContact />. Le SIREN, l'adresse professionnelle
        et le téléphone professionnel seront complétés avant l'ouverture commerciale.
      </p>

      <H2>2. Données collectées</H2>
      <p><strong>Données de compte :</strong> nom, prénom, adresse électronique, date de naissance complète, sexe ou genre facultatif, photo de profil, identifiants techniques et preuves d'acceptation des documents juridiques.</p>
      <p><strong>Données Strava et sportives :</strong> types d'activités, dates, durées, distances, allures, vitesses, dénivelés, altitudes, fréquence cardiaque lorsqu'elle est disponible, puissance, cadence, coordonnées et tracés GPS et données de performance.</p>
      <p><strong>Données relatives aux courses :</strong> nom, date, distance, dénivelé, traces GPX, stratégies, plans, allures, ravitaillements, projections et liens publics créés volontairement.</p>
      <p><strong>Données techniques :</strong> adresse IP, appareil, navigateur, système, dates de connexion, journaux de sécurité, erreurs et événements internes nécessaires au fonctionnement et à l'amélioration du Service.</p>
      <p><strong>Données de paiement :</strong> statut de l'abonnement, offre, dates de facturation et identifiants techniques de transaction. Vorcelab ne stocke aucune donnée complète de carte bancaire.</p>
      <p>Vorcelab ne demande pas la taille, le poids, les blessures, les douleurs, les maladies ou les antécédents médicaux déclarés.</p>

      <H2>3. Finalités et bases juridiques</H2>
      <p>
        Les données sont traitées pour créer et sécuriser le compte, synchroniser Strava, produire les analyses,
        plans et stratégies, gérer les abonnements, permettre les partages volontaires, fournir l'assistance,
        prévenir la fraude, respecter les obligations comptables et améliorer la fiabilité technique.
      </p>
      <p>
        Ces traitements reposent selon les cas sur l'exécution du contrat, une obligation légale, l'intérêt
        légitime de Vorcelab ou le consentement explicite de l'utilisateur.
      </p>

      <H2>4. Données physiologiques</H2>
      <p>
        La fréquence cardiaque et certaines données physiologiques peuvent révéler des informations relatives
        à la santé. Leur traitement repose sur un consentement explicite distinct, recueilli au moyen d'une case
        décochée par défaut lors de l'inscription.
      </p>
      <p>
        Sans ce consentement, l'inscription ne peut pas être finalisée car ces traitements font partie du
        fonctionnement central de Vorcelab. Le consentement peut être retiré ; ce retrait peut rendre impossible
        l'utilisation des fonctions qui dépendent de ces données.
      </p>

      <H2>5. Fournisseurs et destinataires</H2>
      <p>Vorcelab utilise notamment :</p>
      <ul>
        <li>Supabase pour la base de données, l'authentification, les fonctions serveur et les e-mails techniques ;</li>
        <li>Strava pour la synchronisation des activités ;</li>
        <li>Stripe, Apple et Google pour les paiements et achats intégrés ;</li>
        <li>Sentry pour le signalement des erreurs lorsqu'il est activé ;</li>
        <li>Open-Meteo pour les données météorologiques ;</li>
        <li>MapTiler, OpenStreetMap et Overpass API pour les cartes, terrains et surfaces ;</li>
        <li>OVHcloud pour le nom de domaine et l'hébergeur retenu pour l'application web.</li>
      </ul>
      <p>
        Aucune donnée d'activité n'est transmise à Anthropic, Claude ou à un autre fournisseur d'intelligence
        artificielle externe dans la configuration actuelle.
      </p>

      <H2>6. Localisation et transferts</H2>
      <p>
        Les données principales sont hébergées par Supabase dans l'Union européenne, actuellement dans la région
        de Stockholm. Certains fournisseurs peuvent traiter des informations hors de l'Espace économique européen ;
        les mécanismes de transfert applicables et le principe de minimisation sont alors utilisés.
      </p>

      <H2>7. Connexion et déconnexion Strava</H2>
      <p>
        Les identifiants Strava ne sont jamais demandés directement par Vorcelab. L'autorisation utilise OAuth et
        les jetons sont stockés côté serveur. Lors de la déconnexion, les jetons sont supprimés, le compte Vorcelab
        reste ouvert et l'utilisateur peut choisir de supprimer ou de conserver les activités déjà importées.
        Aucune suppression de ces activités n'est effectuée sans accord explicite.
      </p>

      <H2>8. Partages</H2>
      <p>
        Un lien de stratégie créé volontairement peut afficher le nom, le prénom, le tracé d'une course future,
        les lieux de départ et d'arrivée et les informations de stratégie. Il est valable trente jours, révocable,
        protégé par un identifiant aléatoire et exclu de l'indexation dans la mesure techniquement possible.
      </p>
      <p>
        Le partage d'une activité passée produit uniquement une image générée volontairement. Elle peut contenir
        la distance, le dénivelé, le temps écoulé, une représentation schématique du parcours, un profil altimétrique
        et le logo Vorcelab, mais pas le nom ou le prénom.
      </p>

      <H2>9. Base commune de GPX</H2>
      <p>
        Les traces GPX de courses futures importées peuvent être intégrées automatiquement à une base commune.
        Seuls le tracé et les renseignements objectifs relatifs à la course sont mutualisés ; l'identité de
        l'importateur n'est pas publiée ni associée au tracé partagé.
      </p>

      <H2>10. Durées de conservation</H2>
      <ul>
        <li>Compte actif : pendant l'utilisation du Service.</li>
        <li>Compte inactif : suppression possible après deux ans sans connexion ni action, après avertissement trente jours avant.</li>
        <li>Sauvegardes techniques après suppression : trente jours maximum.</li>
        <li>Factures et données comptables : dix ans.</li>
        <li>Journaux techniques et de sécurité : douze mois maximum, sauf nécessité justifiée.</li>
      </ul>

      <H2>11. Export, suppression et droits</H2>
      <p>
        L'utilisateur peut exporter ses données depuis son compte sous la forme d'une archive ZIP contenant une
        copie JSON, des fichiers CSV pour les principales catégories et les traces GPX disponibles. L'export ne
        contient aucun mot de passe, secret technique, jeton Strava ou donnée bancaire complète.
      </p>
      <p>
        L'utilisateur dispose, selon les conditions prévues par la réglementation, des droits d'accès, de
        rectification, d'effacement, de limitation, de portabilité, de retrait du consentement et d'opposition.
        Les demandes peuvent être effectuées depuis Vorcelab ou à <LegalContact />.
      </p>
      <p>
        La suppression du compte est protégée par une confirmation renforcée. Elle entraîne l'effacement des données
        actives, de la photo de profil, des liens publics et des autorisations Strava, sous réserve des sauvegardes
        temporaires et obligations légales de conservation.
      </p>

      <H2>12. Cookies et stockage local</H2>
      <p>
        Vorcelab utilise uniquement les cookies, jetons ou mécanismes de stockage strictement nécessaires à
        l'authentification, à la sécurité, au maintien de la session, au paiement et aux préférences indispensables.
        Aucun cookie publicitaire, Meta Pixel, Google Analytics ou outil de prospection n'est utilisé actuellement.
      </p>
      <p>
        Si des outils non essentiels de mesure d'audience, de publicité ou de personnalisation sont ajoutés,
        ils ne seront activés qu'après le recueil d'un consentement valable.
      </p>

      <H2>13. E-mails</H2>
      <p>
        Vorcelab envoie uniquement des e-mails techniques et contractuels : confirmation de compte, réinitialisation
        du mot de passe, paiement, renouvellement, résiliation, rétractation, incident de sécurité ou suppression
        prochaine d'un compte inactif. Aucune newsletter ou prospection commerciale n'est envoyée actuellement.
      </p>

      <H2>14. Sécurité et contact</H2>
      <p>
        Vorcelab met en œuvre des mesures destinées à protéger les données contre l'accès non autorisé, la perte,
        l'altération ou la divulgation. Pour toute demande relative aux données personnelles : <LegalContact />.
        L'utilisateur peut également introduire une réclamation auprès de la CNIL.
      </p>

      <MissingLegalInfo />
    </Shell>
  )
}
