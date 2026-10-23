'use client';
import { useEffect, useState } from 'react';
import './accueil.css';
import Icon, { Logo } from '../components/icons';
import { APPAREILS, IconeEtape, etapes, useInstallation } from '../components/Installer';

// Page d'accueil publique : site vitrine qui présente GeoPulse, avec une icône pour l'installer sur l'appareil du visiteur.

const ETAPES = [
  ['upload', 'Importez votre réseau', 'Vos magasins, clients et concurrents depuis Excel ou votre ERP, avec leurs ventes mois par mois. Chaque point garde son code ERP.'],
  ['globe', 'Lisez votre territoire', 'Population au carré de 250 m, pouvoir d’achat, concurrence et zones couvertes ou délaissées, gouvernorat par gouvernorat.'],
  ['target', 'Décidez où ouvrir', 'Touchez la carte : GeoPulse estime le chiffre d’affaires du futur point, sa fourchette, sa note de fiabilité et son point mort.'],
];

const FONCTIONS = [
  ['pin', 'Carte du réseau', 'Vos points, ceux des concurrents et les grandes surfaces, par couleur et par type, filtrables d’un geste.'],
  ['target', 'Simulation de CA', 'Modèle de gravité calibré sur vos propres ventes, avec la cannibalisation de vos magasins voisins.'],
  ['split', 'Magasins jumeaux', 'Retrouve vos points qui ressemblent le plus à l’emplacement étudié et compare leurs résultats.'],
  ['wallet', 'Rentabilité', 'Loyer, charges et marge : point mort, délai de retour sur investissement et note de A à D.'],
  ['users', 'Démographie', 'Habitants autour de chaque point, dépense par habitant et potentiel du marché local.'],
  ['chart', 'Ventes ERP', 'Import mensuel des ventes, CA sur 12 mois et CA au m² de chaque point de vente.'],
  ['team', 'Équipe et rôles', 'Administrateur, manager, commercial : chacun voit et modifie ce que son rôle permet.'],
  ['history', 'Journal', 'Qui a créé, modifié ou validé quoi, et quand. Rien ne se perd.'],
];

const SECTEURS = ['Agroalimentaire', 'Volaille', 'Produits laitiers', 'Distribution de boissons', 'Pharmacie et parapharmacie', 'Habillement', 'Distribution alimentaire'];

export default function Accueil() {
  const inst = useInstallation();
  const [fenetre, setFenetre] = useState(false);
  const [connecte, setConnecte] = useState(false);

  useEffect(() => {
    // Déjà connecté sur cet appareil : on propose d'ouvrir directement son espace.
    try { setConnecte(Object.keys(window.localStorage).some((k) => /^sb-.*-auth-token$/.test(k))); } catch (e) { /* stockage indisponible */ }
  }, []);

  const libelle = APPAREILS[inst.appareil].bouton;
  const installer = async () => {
    if (inst.direct && await inst.installer()) return;
    setFenetre(true);
  };

  return (
    <div className="acc">
      <header className="acc-nav">
        <a href="/" className="acc-marque"><Logo size={34} /><span>GeoPulse</span></a>
        <nav className="acc-liens">
          <a href="#fonctionnement">Fonctionnement</a>
          <a href="#fonctions">Fonctions</a>
          <a href="#secteurs">Secteurs</a>
        </nav>
        {inst.pret && !inst.installee && (
          <button type="button" onClick={installer} className="acc-icone-installer" title={libelle} aria-label={libelle}>
            <img src="/icons/icon-192.png" alt="" /><span>Installer</span>
          </button>
        )}
        <a href="/pro" className="acc-btn acc-btn-clair acc-petit">{connecte ? 'Ouvrir mon espace' : 'Se connecter'}</a>
      </header>

      <section className="acc-hero">
        <div className="acc-hero-texte">
          <span className="acc-badge">Géomarketing · Tunisie</span>
          <h1>Décidez où ouvrir.<br /><span className="acc-degrade">Avec des chiffres.</span></h1>
          <p>
            GeoPulse réunit sur une seule carte votre réseau, vos concurrents, la population et vos ventes, puis estime le
            chiffre d’affaires d’un nouvel emplacement avant que vous n’investissiez.
          </p>
          <div className="acc-actions">
            <a href="/pro#inscription" className="acc-btn acc-btn-principal">Demander l’ouverture</a>
            <a href="/pro" className="acc-btn acc-btn-fantome">{connecte ? 'Ouvrir mon espace' : 'Se connecter'}</a>
          </div>
          <div className="acc-chiffres">
            <div><b>24</b><span>gouvernorats couverts</span></div>
            <div><b>250 m</b><span>maille de population</span></div>
            <div><b>1 s</b><span>pour simuler un emplacement</span></div>
          </div>
        </div>
        <div className="acc-hero-visuel">
          <img className="acc-ecran" src="/accueil/ordinateur.jpg" alt="La carte GeoPulse sur ordinateur" />
          <img className="acc-telephone" src="/accueil/telephone.jpg" alt="GeoPulse sur téléphone" />
        </div>
      </section>

      <section id="fonctionnement" className="acc-section">
        <div className="acc-titre">
          <span className="acc-surtitre">Fonctionnement</span>
          <h2>Trois étapes, de vos fichiers à la décision</h2>
        </div>
        <div className="acc-etapes">
          {ETAPES.map(([icone, titre, texte], i) => (
            <div key={titre} className="acc-carte">
              <div className="acc-numero">{i + 1}</div>
              <div className="acc-pastille"><Icon name={icone} size={20} /></div>
              <h3>{titre}</h3>
              <p>{texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="fonctions" className="acc-section acc-fond">
        <div className="acc-titre">
          <span className="acc-surtitre">Fonctions</span>
          <h2>Tout ce qu’il faut pour piloter un réseau</h2>
        </div>
        <div className="acc-grille">
          {FONCTIONS.map(([icone, titre, texte]) => (
            <div key={titre} className="acc-fonction">
              <div className="acc-pastille"><Icon name={icone} size={19} /></div>
              <div><h3>{titre}</h3><p>{texte}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="secteurs" className="acc-section">
        <div className="acc-titre">
          <span className="acc-surtitre">Pour qui</span>
          <h2>Pensé pour les réseaux et les distributeurs</h2>
        </div>
        <div className="acc-profils">
          <div className="acc-carte">
            <div className="acc-pastille"><Icon name="store" size={20} /></div>
            <h3>Réseaux de points de vente</h3>
            <p>Magasins propres, franchisés ou en gérance : suivez chaque point, son CA au m² et sa zone, comparez-vous à la concurrence et validez vos ouvertures.</p>
          </div>
          <div className="acc-carte">
            <div className="acc-pastille"><Icon name="layers" size={20} /></div>
            <h3>Distributeurs</h3>
            <p>Placez vos clients sur la carte, repérez les zones couvertes et délaissées, et estimez le potentiel des régions où vous n’êtes pas encore.</p>
          </div>
        </div>
        <div className="acc-secteurs">{SECTEURS.map((s) => <span key={s}>{s}</span>)}</div>
        <div className="acc-confiance">
          <div><Icon name="checkCircle" size={18} /> Chaque société n’accède qu’à ses propres données.</div>
          <div><Icon name="checkCircle" size={18} /> Les nouveaux comptes sont validés par l’équipe GeoPulse.</div>
          <div><Icon name="checkCircle" size={18} /> Fonctionne sur ordinateur, tablette et téléphone.</div>
        </div>
      </section>

      <section className="acc-fin">
        <h2>Prêt à voir votre réseau autrement ?</h2>
        <p>Créez votre compte et demandez l’ouverture de votre société : l’équipe GeoPulse vous accompagne pour importer vos données.</p>
        <div className="acc-actions acc-centre-flex">
          <a href="/pro#inscription" className="acc-btn acc-btn-principal">Demander l’ouverture</a>
          <a href="/pro" className="acc-btn acc-btn-fantome">{connecte ? 'Ouvrir mon espace' : 'Se connecter'}</a>
        </div>
      </section>

      <footer className="acc-pied">
        <span className="acc-marque"><Logo size={26} /><span>GeoPulse</span></span>
        <span>Géomarketing de précision pour la Tunisie · © {new Date().getFullYear()}</span>
      </footer>

      {inst.pret && !inst.installee && (
        <button type="button" onClick={installer} className="acc-flottant" aria-label={libelle}>
          <img src="/icons/icon-192.png" alt="" /> <span>{libelle}</span>
        </button>
      )}

      {fenetre && (
        <div className="acc-voile" onClick={() => setFenetre(false)} role="presentation">
          <div className="acc-fenetre" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={libelle}>
            <div className="acc-fenetre-tete">
              <img src="/icons/icon-192.png" alt="" />
              <div>
                <b>{libelle}</b>
                <span>3 gestes, moins de 10 secondes</span>
              </div>
              <button type="button" onClick={() => setFenetre(false)} aria-label="Fermer">×</button>
            </div>
            <ol className="acc-liste-etapes">
              {etapes(inst.appareil, inst.navigateur).map(([icone, titre, texte], i) => (
                <li key={i}>
                  <span className="acc-etape-icone"><IconeEtape nom={icone} size={20} /></span>
                  <div><b>{i + 1}. {titre}</b><span>{texte}</span></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
