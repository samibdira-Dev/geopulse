import { normalizeGouvernorat } from './gouvernorats';

// Population et ménages des 265 délégations, en 2024. Fichier public/delegations-tn.geojson (contours + chiffres) :
// - population et ménages de chaque gouvernorat : INS, Recensement général de la population et de l'habitat 2024
//   (Bilan démographique) ;
// - délégation : chiffre officiel RGPH 2024 quand l'INS l'a publié (source « rgph2024 »), sinon répartition du total
//   du gouvernorat au prorata des habitants de la grille de 250 m (Meta / CIESIN) dans les contours de la délégation
//   (source « estimation ») ; ménages = population ÷ taille moyenne des ménages du gouvernorat (RGPH 2024).
// Contours : Overture Maps Foundation (divisions, octobre 2026), licence ODbL.
// Pouvoir d'achat : taux de pauvreté de chaque délégation (INS et Banque mondiale, « Carte de la pauvreté en Tunisie »,
// 2020, estimé sur le recensement 2014 et l'enquête consommation 2015) et indice de dépense par habitant qui en découle
// (1 = moyenne nationale), recalé pour que chaque région retrouve sa dépense moyenne de l'enquête INS 2021.

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
      pauvrete: p.pauvrete ?? null,
      pauvrete_source: p.pauvrete_source ?? null,
      indice_depense: p.indice_depense ?? null,
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

// Taux de pauvreté (%) et couleur associée, pour la carte du pouvoir d'achat.
export const PALIERS_PAUVRETE = [
  [30, '#b91c1c', 'plus de 30 %'],
  [20, '#f97316', '20 à 30 %'],
  [10, '#facc15', '10 à 20 %'],
  [5, '#86efac', '5 à 10 %'],
  [0, '#15803d', 'moins de 5 %'],
];
export function couleurPauvrete(taux) {
  return (PALIERS_PAUVRETE.find(([seuil]) => taux >= seuil) || PALIERS_PAUVRETE[PALIERS_PAUVRETE.length - 1])[1];
}

// Le point (lng, lat) est-il dans l'anneau ? (lancer de rayon)
function dansAnneau(anneau, lng, lat) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

function dansPolygone(rings, lng, lat) {
  return dansAnneau(rings[0], lng, lat) && !rings.slice(1).some((r) => dansAnneau(r, lng, lat));
}

const emprises = new WeakMap();
function emprise(f) {
  if (!emprises.has(f)) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    polys.forEach((p) => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    emprises.set(f, { polys, x0, y0, x1, y1 });
  }
  return emprises.get(f);
}

// Propriétés de la délégation qui contient la position, ou null.
export function delegationEn(geojson, lat, lng) {
  if (!geojson || !geojson.features || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const f of geojson.features) {
    const e = emprise(f);
    if (lng < e.x0 || lng > e.x1 || lat < e.y0 || lat > e.y1) continue;
    if (e.polys.some((p) => dansPolygone(p, lng, lat))) return f.properties;
  }
  return null;
}
