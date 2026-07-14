import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { MISSING_LEGAL_INFO } from '../lib/legalVersions'

// Pages légales publiques (CGU + confidentialité) — exigées avant d'encaisser
// des paiements (Stripe, RGPD). Rédaction type à faire valider par un
// professionnel avant une ouverture commerciale large.

function Shell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--vl-bg)' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.5rem 1.25rem 4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <Link to="/" style={{ textDecoration: 'none', fontFamily: 'var(--vl-display)', fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--vl-ember)' }}>
            VORCELAB
          </Link>
          <Link to="/"><button className="hbtn">← Retour</button></Link>
        </div>

        <h1 style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(1.8rem, 5vw, 2.4rem)', fontWeight: 800, lineHeight: 1.05, margin: '0 0 6px' }}>
          {title}
        </h1>
        <div className="mlabel" style={{ marginBottom: '2rem' }}>Dernière mise à jour : {updated}</div>

        <div className="legal-body" style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--vl-text-2)' }}>
          {children}
        </div>

        <div style={{ marginTop: '3rem', paddingTop: '1.25rem', borderTop: '1px solid var(--vl-line)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Link to="/legal/cgu" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>CGU / CGV</Link>
          <Link to="/legal/confidentialite" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Confidentialité</Link>
          <Link to="/legal/mentions" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Mentions légales</Link>
          <a href="mailto:hello@vorcelab.com" className="mlabel" style={{ color: 'var(--vl-text-3)' }}>Contact</a>
        </div>
      </div>
    </div>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontFamily: 'var(--vl-display)', fontSize: '1.15rem', fontWeight: 800, letterSpacing: '.02em', color: 'var(--vl-text)', margin: '2rem 0 .6rem' }}>{children}</h2>
}

export function MentionsPage() {
  return (
    <Shell title="Mentions légales" updated="2 juillet 2026">
      <H2>Éditeur</H2>
      <p>
        Vorcelab est édité par Tony Bollecker — contact :{' '}
        <a href="mailto:hello@vorcelab.com" style={{ color: 'var(--vl-ember)' }}>hello@vorcelab.com</a>.
      </p>

      <H2>Hébergement</H2>
      <p>
        Base de données, authentification et fonctions serveur : Supabase (infrastructure
        Amazon Web Services, région <code>eu-north-1</code>, Stockholm). Application web :
        GitHub Pages (GitHub, Inc.). Paiements : Stripe.
      </p>

      <H2>Propriété intellectuelle</H2>
      <p>
        L'ensemble du contenu, des moteurs de calcul, des formules et de l'interface est la
        propriété exclusive de l'éditeur. Toute reproduction ou réutilisation non autorisée
        est interdite.
      </p>

      <H2>Informations à compléter avant l'ouverture commerciale</H2>
      <p>
        Les mentions obligatoires suivantes doivent être renseignées et{' '}
        <strong>validées par un professionnel du droit</strong> avant toute mise en vente
        publique. Tant qu'elles sont incomplètes, le service n'est pas commercialement ouvert.
      </p>
      <ul style={{ paddingLeft: '1.2rem' }}>
        {MISSING_LEGAL_INFO.map((item) => (
          <li key={item}><em>[À compléter : {item}.]</em></li>
        ))}
      </ul>
    </Shell>
  )
}

export function CguPage() {
  return (
    <Shell title="Conditions générales d'utilisation et de vente" updated="2 juillet 2026">
      <H2>1. L'éditeur</H2>
      <p>
        Vorcelab (« le Service ») est édité par Tony Bollecker — contact :{' '}
        <a href="mailto:hello@vorcelab.com" style={{ color: 'var(--vl-ember)' }}>hello@vorcelab.com</a>.
        {' '}<em>[À compléter : forme juridique, SIREN et adresse dès immatriculation.]</em>
      </p>

      <H2>2. Le service</H2>
      <p>
        Vorcelab est une application de coaching pour la course à pied et le trail :
        stratégie de course à partir d'une trace GPX (allures, ravitaillements, nutrition),
        plan d'entraînement algorithmique vers une course cible, suivi de charge et
        renforcement musculaire. Les analyses sont calculées de manière déterministe à
        partir de tes données ; aucune donnée d'activité n'est transmise à un service
        d'intelligence artificielle externe.
      </p>

      <H2>3. Avertissement santé — important</H2>
      <p>
        Vorcelab fournit des indications d'entraînement à titre informatif. Elles ne
        constituent ni un avis médical, ni un suivi par un professionnel de santé ou un
        entraîneur diplômé. Consulte un médecin avant de débuter ou d'intensifier une
        pratique sportive, en particulier en cas d'antécédents cardiaques, de blessure ou
        de douleur. Tu restes seul juge de ton état de forme : en cas de malaise, arrête
        l'effort. L'utilisation des plans et stratégies se fait sous ta responsabilité.
      </p>

      <H2>4. Compte</H2>
      <p>
        La création d'un compte requiert une adresse e-mail valide. Tu es responsable de
        la confidentialité de tes identifiants. Tu peux supprimer ton compte à tout moment
        depuis les Réglages — la suppression efface l'ensemble de tes données (voir la{' '}
        <Link to="/legal/confidentialite" style={{ color: 'var(--vl-ember)' }}>politique de confidentialité</Link>).
      </p>

      <H2>5. Offre gratuite et abonnement PRO</H2>
      <p>
        L'offre gratuite donne accès aux fonctionnalités de base (dont une stratégie de
        course GPX et les premières semaines du plan d'entraînement). L'abonnement PRO,
        mensuel ou annuel, débloque l'ensemble des fonctionnalités. Les prix sont affichés
        dans l'application avant tout paiement, en euros et toutes taxes comprises.
      </p>
      <p>
        Le paiement est opéré par <strong>Stripe</strong> ; Vorcelab ne stocke aucune
        donnée bancaire. L'abonnement est reconduit tacitement à chaque échéance et peut
        être résilié à tout moment ; la résiliation prend effet à la fin de la période
        payée, qui reste acquise.
      </p>

      <H2>6. Droit de rétractation</H2>
      <p>
        Conformément à l'article L221-28 du Code de la consommation, l'accès immédiat au
        contenu numérique après paiement emporte renonciation expresse au droit de
        rétractation de 14 jours. En cas de problème, écris-nous : nous cherchons toujours
        une solution raisonnable.
      </p>

      <H2>7. Données Strava</H2>
      <p>
        La connexion à Strava est optionnelle et utilise l'autorisation officielle Strava
        (OAuth). Tu peux la révoquer à tout moment depuis les Réglages de Vorcelab ou
        depuis ton compte Strava. L'utilisation des données Strava respecte les conditions
        de l'API Strava. Vorcelab n'est pas affilié à Strava. « Strava » est une marque de
        Strava, Inc.
      </p>

      <H2>8. Responsabilité et disponibilité</H2>
      <p>
        Le Service est fourni « en l'état ». Les projections (temps de course, allures,
        charge) sont des estimations statistiques, sans garantie de résultat. Vorcelab ne
        saurait être tenu responsable des dommages indirects liés à l'utilisation du
        Service ni d'une indisponibilité temporaire. La responsabilité de l'éditeur est en
        tout état de cause limitée aux sommes versées au titre des 12 derniers mois.
      </p>

      <H2>9. Propriété intellectuelle</H2>
      <p>
        L'application, sa marque et ses contenus sont protégés. Tes données (activités,
        courses, mesures) restent les tiennes ; tu concèdes à Vorcelab le droit de les
        traiter uniquement pour te fournir le Service.
      </p>

      <H2>10. Droit applicable</H2>
      <p>
        Les présentes conditions sont soumises au droit français. En cas de litige, une
        solution amiable sera recherchée avant toute action ; tu peux également recourir
        gratuitement à un médiateur de la consommation.
      </p>
    </Shell>
  )
}

export function PrivacyPage() {
  return (
    <Shell title="Politique de confidentialité" updated="2 juillet 2026">
      <p style={{ fontStyle: 'italic' }}>
        En bref : tes données servent uniquement à faire fonctionner ton coaching.
        Pas de publicité, pas de revente, pas de traqueurs tiers, pas d'IA externe sur
        tes activités. Tu peux tout supprimer en un clic.
      </p>

      <H2>1. Responsable de traitement</H2>
      <p>
        Tony Bollecker — <a href="mailto:hello@vorcelab.com" style={{ color: 'var(--vl-ember)' }}>hello@vorcelab.com</a>.
        {' '}<em>[À compléter dès immatriculation.]</em>
      </p>

      <H2>2. Données collectées</H2>
      <p>
        <strong>Compte</strong> : adresse e-mail, mot de passe (haché par notre
        hébergeur d'authentification, jamais lisible).<br />
        <strong>Profil sportif</strong> : les mesures que tu renseignes (poids, taille,
        FC max, records, matériel de renforcement…).<br />
        <strong>Activités</strong> : si tu connectes Strava, tes activités et leurs
        données (GPS, fréquence cardiaque, allure) sont synchronisées pour calculer ton
        profil de coureur et adapter ton plan.<br />
        <strong>Courses</strong> : les courses et traces GPX que tu ajoutes.<br />
        <strong>Usage</strong> : des événements produit internes (ex. « séance
        consultée ») pour améliorer l'application — sans traqueur tiers ni cookie
        publicitaire.
      </p>

      <H2>3. Finalités et bases légales</H2>
      <p>
        Fournir le coaching et la stratégie de course (exécution du contrat) ·
        gérer l'abonnement PRO via Stripe (exécution du contrat) · mesurer l'usage
        interne et sécuriser le Service (intérêt légitime). Aucune décision produisant
        des effets juridiques n'est prise de façon automatisée.
      </p>

      <H2>4. Où sont tes données</H2>
      <p>
        Les données sont hébergées chez <strong>Supabase</strong> (base de données et
        authentification, région Union européenne — Stockholm). Le site est servi par
        <strong> GitHub Pages</strong>. Les paiements sont traités par <strong>Stripe</strong>
        (certifié PCI-DSS) — Vorcelab ne voit jamais ta carte. Les fonds de carte
        (MapTiler, CARTO) reçoivent uniquement les requêtes de tuiles nécessaires à
        l'affichage. Tes activités ne sont <strong>jamais</strong> transmises à un
        fournisseur d'IA externe.
      </p>

      <H2>5. Données Strava</H2>
      <p>
        La connexion Strava utilise le protocole officiel OAuth : tes identifiants Strava
        ne passent jamais par Vorcelab, et les jetons d'accès sont stockés côté serveur,
        jamais dans ton navigateur. Tu peux déconnecter Strava à tout moment (Réglages) —
        cela supprime les jetons. L'usage des données respecte les conditions de l'API
        Strava.
      </p>

      <H2>6. Durées de conservation</H2>
      <p>
        Tes données sont conservées tant que ton compte est actif. La suppression du
        compte (Réglages → Supprimer mon compte) efface immédiatement et définitivement
        profil, activités, courses, journaux de séance et événements d'usage. Les données
        de facturation Stripe sont conservées par Stripe selon ses obligations légales.
      </p>

      <H2>7. Tes droits (RGPD)</H2>
      <p>
        Tu disposes des droits d'accès, de rectification, d'effacement, de portabilité,
        de limitation et d'opposition. Exerce-les directement dans l'application
        (profil modifiable, suppression de compte intégrée) ou par e-mail :{' '}
        <a href="mailto:hello@vorcelab.com" style={{ color: 'var(--vl-ember)' }}>hello@vorcelab.com</a>.
        Tu peux aussi saisir la CNIL (cnil.fr).
      </p>

      <H2>8. Cookies</H2>
      <p>
        Vorcelab n'utilise pas de cookies publicitaires ni de mesure d'audience tierce.
        Seul le stockage local du navigateur est utilisé pour ta session de connexion et
        tes préférences (thème, visites guidées).
      </p>
    </Shell>
  )
}
