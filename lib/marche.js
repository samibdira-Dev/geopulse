import { normalizeGouvernorat } from './gouvernorats';
import { mediane } from './simulation';

// Potentiel de marché d'une zone : ce que ses habitants dépensent chaque mois dans le secteur, tous magasins confondus.
// Source : INS, Enquête nationale sur le budget, la consommation et le niveau de vie des ménages 2021 (EBCNV 2021).
// Dépense moyenne nationale : 5 468 TND par personne et par an ; parts du budget par poste (Volume A, annexe 2).

const DEPENSE_NATIONALE_AN = 5468;

// Dépense par habitant et par an (TND, prix 2021) pour chaque secteur, avec les postes INS utilisés.
export const SECTEURS = {
  alimentaire: { libelle: 'Alimentaire', depenseAn: 1645, postes: 'produits alimentaires et boissons non alcoolisées (30,1 % du budget)' },
  agroalimentaire: { libelle: 'Agroalimentaire', depenseAn: 1645, postes: 'produits alimentaires et boissons non alcoolisées (30,1 % du budget)' },
  pharmacie: { libelle: 'Pharmacie et parapharmacie', depenseAn: Math.round(DEPENSE_NATIONALE_AN * 0.058), postes: 'produits pharmaceutiques (3,8 %) et soins personnels (2,0 %)' },
  habillement: { libelle: 'Habillement', depenseAn: Math.round(DEPENSE_NATIONALE_AN * 0.116), postes: 'vêtements, chaussures et accessoires (11,6 %)' },
  boissons: { libelle: 'Distribution de boissons', depenseAn: Math.round(DEPENSE_NATIONALE_AN * 0.025), postes: 'boissons non alcoolisées et plats préparés (2,5 %)' },
  laitiers: { libelle: 'Produits laitiers', depenseAn: Math.round(DEPENSE_NATIONALE_AN * 0.044), postes: 'lait, produits laitiers et œufs (4,4 %)' },
};

// Dépense moyenne par personne et par an selon la région (EBCNV 2021, tableau 3), rapportée à la moyenne nationale.
const DEPENSE_REGION_AN = {
  'Grand Tunis': 6874, 'Nord-Est': 5057, 'Nord-Ouest': 4493, 'Centre-Est': 6130,
  'Centre-Ouest': 3614, 'Sud-Est': 4675, 'Sud-Ouest': 4847,
};
const REGION_DU_GOUVERNORAT = {
  Tunis: 'Grand Tunis', Ariana: 'Grand Tunis', 'Ben Arous': 'Grand Tunis', Manouba: 'Grand Tunis',
  Nabeul: 'Nord-Est', Zaghouan: 'Nord-Est', Bizerte: 'Nord-Est',
  'Béja': 'Nord-Ouest', Jendouba: 'Nord-Ouest', 'Le Kef': 'Nord-Ouest', Siliana: 'Nord-Ouest',
  Sousse: 'Centre-Est', Monastir: 'Centre-Est', Mahdia: 'Centre-Est', Sfax: 'Centre-Est',
  Kairouan: 'Centre-Ouest', Kasserine: 'Centre-Ouest', 'Sidi Bouzid': 'Centre-Ouest',
  'Gabès': 'Sud-Est', Medenine: 'Sud-Est', Tataouine: 'Sud-Est',
  Gafsa: 'Sud-Ouest', Tozeur: 'Sud-Ouest', 'Kébili': 'Sud-Ouest',
};

// Région INS et indice de dépense (1 = moyenne nationale) d'un gouvernorat ; indice 1 si inconnu.
export function indiceRegional(gouvernorat) {
  const region = REGION_DU_GOUVERNORAT[normalizeGouvernorat(gouvernorat)] || null;
  return { region, indice: region ? DEPENSE_REGION_AN[region] / DEPENSE_NATIONALE_AN : 1 };
}

// Dépense mensuelle par habitant retenue pour un type : valeur saisie, sinon celle du secteur (INS). null si aucun secteur.
export function depenseDuType(type) {
  const e = (type && type.exploitation) || {};
  const saisie = Number(e.depense_hab_mois);
  if (saisie > 0) return { mensuelle: saisie, secteur: SECTEURS[e.secteur] || null, saisie: true };
  const s = SECTEURS[e.secteur];
  return s ? { mensuelle: s.depenseAn / 12, secteur: s, saisie: false } : null;
}

// Potentiel de marché mensuel (TND) : habitants × dépense mensuelle × indice régional.
export function potentielMarche(population, depenseMensuelle, gouvernorat) {
  if (!(population > 0) || !(depenseMensuelle > 0)) return null;
  const { region, indice } = indiceRegional(gouvernorat);
  return { potentiel: population * depenseMensuelle * indice, region, indice };
}

/**
 * Repères du réseau (jumeaux.preparerReseau) : part de marché captée et pression concurrentielle médianes de vos points.
 */
export function reperesReseau(reseau, depenseMensuelle) {
  if (!reseau || !reseau.refs.length) return null;
  const parts = depenseMensuelle > 0
    ? reseau.refs.map((r) => {
      const pm = potentielMarche(r.profil.popR, depenseMensuelle, r.gouvernorat);
      return pm ? r.ca / pm.potentiel : null;
    }).filter((v) => v != null)
    : [];
  return {
    partMediane: mediane(parts),
    pressionMediane: mediane(reseau.refs.map((r) => r.profil.pression)),
  };
}
