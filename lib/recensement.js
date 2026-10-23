import { normalizeGouvernorat } from './gouvernorats';

// Population et ménages des 265 délégations, en 2024. Fichier public/delegations-tn.geojson (contours + chiffres) :
// - population et ménages de chaque gouvernorat : INS, Recensement général de la population et de l'habitat 2024
//   (Bilan démographique) ;
// - délégation : chiffre officiel RGPH 2024 quand l'INS l'a publié (source « rgph2024 »), sinon répartition du total
//   du gouvernorat au prorata des habitants de la grille de 250 m (Meta / CIESIN) dans les contours de la délégation
//   (source « estimation ») ; ménages = population ÷ taille moyenne des ménages du gouvernorat (RGPH 2024).
// Contours : Overture Maps Foundation (divisions, octobre 2026), licence ODbL.

let chargement = null;

export function chargerDelegations() {
  if (!chargement) {
    chargement = fetch('/delegations-tn.geojson')
      .then((r) => {
        if (!r.ok) throw new Error('Délégations introuvables (HTTP ' + r.status + ')');
        return r.json();
      })
      .catch((e) => {
        chargement = null;
        throw e;
      });
  }
  return chargement;
}

const cle = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(delegation|del\.?)\s+(de\s+|d'|du\s+)?/, '').replace(/[^a-z]/g, '');

/**
 * Lignes démographiques : une par délégation du recensement, complétées du revenu et du potentiel saisis dans la table
 * decoupage_administratif quand la délégation y figure. Sans fichier de recensement, renvoie la table telle quelle.
 */
export function fusionnerDemographie(geojson, lignesTable = []) {
  if (!geojson || !geojson.features) return lignesTable;
  const table = new Map(lignesTable.map((d) => [`${normalizeGouvernorat(d.gouvernorat) || d.gouvernorat}|${cle(d.delegation)}`, d]));
  return geojson.features.map(({ properties: p }) => {
    const t = table.get(`${p.gouvernorat}|${cle(p.delegation)}`) || {};
    return {
      id: `${p.gouvernorat}|${p.delegation}`,
      gouvernorat: p.gouvernorat,
      delegation: p.delegation,
      population: p.population,
      nb_menages: p.nb_menages,
      surface_km2: p.surface_km2,
      source: p.source,
      revenu_moyen_tnd: t.revenu_moyen_tnd ?? null,
      potentiel_conso: t.potentiel_conso ?? null,
    };
  });
}

// Densité (hab./km²) et couleur associée, pour la carte des délégations.
export const PALIERS_DENSITE = [
  [5000, '#4c1d95', 'plus de 5 000'],
  [1000, '#6d28d9', '1 000 à 5 000'],
  [300, '#8b5cf6', '300 à 1 000'],
  [100, '#c4b5fd', '100 à 300'],
  [0, '#ede9fe', 'moins de 100'],
];
export function couleurDensite(densite) {
  return (PALIERS_DENSITE.find(([seuil]) => densite >= seuil) || PALIERS_DENSITE[PALIERS_DENSITE.length - 1])[1];
}
