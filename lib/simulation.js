import { normalizeGouvernorat, sameGouvernorat } from './gouvernorats';
import { cellulesDansRayon, populationDansRayon } from './population';
import { caMensuelMoyen } from './ventes';
import { captesReseau } from './huff';

// Calculs du simulateur d'emplacement. Tout est fait à partir des données réelles
// (points de la société, découpage INS, contours des gouvernorats) : aucune valeur inventée.

const R_TERRE_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

// Distance à vol d'oiseau entre deux positions (km).
export function distanceKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRE_KM * Math.asin(Math.sqrt(a));
}

// Part de la zone (disque de rayon r autour de lat/lng) déjà à moins de r d'un des points :
// échantillonnage sur une grille, pour compter une seule fois les zones couvertes par plusieurs PDV.
function partCouverte(lat, lng, r, proches) {
  if (!proches.length) return 0;
  const N = 30;
  const kLat = 1 / 110.574;
  const kLng = 1 / (111.32 * Math.cos(rad(lat)));
  let dedans = 0;
  let couvert = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = ((i + 0.5) / N) * 2 * r - r;
      const y = ((j + 0.5) / N) * 2 * r - r;
      if (x * x + y * y > r * r) continue;
      dedans++;
      const pLat = lat + y * kLat;
      const pLng = lng + x * kLng;
      if (proches.some((p) => distanceKm(pLat, pLng, p.latitude, p.longitude) <= r)) couvert++;
    }
  }
  return dedans ? couvert / dedans : 0;
}

// Surface d'un anneau de coordonnées [lng, lat] (km², projection locale).
function surfaceAnneau(ring) {
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111.32 * Math.cos(rad(lat0));
  const ky = 110.574;
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][0] * kx * ring[i][1] * ky - ring[i][0] * kx * ring[j][1] * ky;
  }
  return Math.abs(s) / 2;
}

// Surface de chaque gouvernorat (km²) à partir du GeoJSON.
export function surfacesGouvernorats(geojson) {
  const out = {};
  if (!geojson || !geojson.features) return out;
  geojson.features.forEach((f) => {
    const pr = f.properties || {};
    const nom = normalizeGouvernorat(pr.shapeName || pr.nom || pr.name || pr.name_fr || pr.NAME_1);
    const g = f.geometry;
    if (!nom || !g) return;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const km2 = polys.reduce((s, rings) => s + surfaceAnneau(rings[0]) - rings.slice(1).reduce((t, r) => t + surfaceAnneau(r), 0), 0);
    out[nom] = (out[nom] || 0) + km2;
  });
  return out;
}

// Chiffres du gouvernorat : population, ménages, revenu moyen pondéré par la population.
export function statsGouvernorat(demographie, gouvernorat) {
  const lignes = demographie.filter((d) => sameGouvernorat(d.gouvernorat, gouvernorat));
  const population = lignes.reduce((s, d) => s + (Number(d.population) || 0), 0);
  const menages = lignes.reduce((s, d) => s + (Number(d.nb_menages) || 0), 0);
  const avecRevenu = lignes.filter((d) => Number(d.revenu_moyen_tnd) > 0 && Number(d.population) > 0);
  const popRevenu = avecRevenu.reduce((s, d) => s + Number(d.population), 0);
  const revenu = popRevenu ? avecRevenu.reduce((s, d) => s + Number(d.revenu_moyen_tnd) * Number(d.population), 0) / popRevenu : null;
  return { delegations: lignes.length, population, menages, revenu };
}

// Modèle de partage (Huff) : chaque carré de 250 m répartit ses habitants entre les points qui le
// desservent (à moins du rayon), au prorata de surface^alpha ÷ distance^beta. Distance minimale 100 m.
// CA = k × habitants captés^gamma (gamma < 1 : chaque habitant de plus rapporte un peu moins).
// Réglages par défaut ; lib/fiabilite.js les ajuste sur les ventes de la société (calibrerModele).
export const REGLAGE_DEFAUT = { alpha: 1, beta: 2, gamma: 1 };
const DISTANCE_MIN_KM = 0.1;
// Points de référence qui captent moins de 100 habitants : ignorés (zone non représentative).
export const CAPTES_MIN = 100;

// Champ « surface » de chaque type : premier champ numérique dont le libellé parle de surface ou de m².
export function clesSurface(champs) {
  const out = {};
  champs
    .filter((c) => c.type_champ === 'nombre' && /surface|m2|m²/i.test(c.cle + ' ' + c.libelle))
    .sort((a, b) => a.ordre - b.ordre)
    .forEach((c) => { if (!(c.type_id in out)) out[c.type_id] = c.cle; });
  return out;
}

// Habitants captés par `cible` parmi `magasins` (tous ont { latitude, longitude, attraction }).
export function habitantsCaptes(grille, cible, magasins, r, beta) {
  const voisins = magasins.filter((m) => m === cible || distanceKm(cible.latitude, cible.longitude, m.latitude, m.longitude) <= 2 * r);
  const force = (m, cell) => m.attraction / Math.max(DISTANCE_MIN_KM, distanceKm(cell.lat, cell.lng, m.latitude, m.longitude)) ** beta;
  let total = 0;
  cellulesDansRayon(grille, cible.latitude, cible.longitude, r).forEach((cell) => {
    let somme = 0;
    voisins.forEach((m) => {
      if (m === cible || distanceKm(cell.lat, cell.lng, m.latitude, m.longitude) <= r) somme += force(m, cell);
    });
    total += (cell.pop * force(cible, cell)) / somme;
  });
  return total;
}

export function mediane(valeurs) {
  if (!valeurs.length) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Champs numériques utilisables comme chiffre d'affaires (on propose d'abord ceux qui parlent de CA).
export function champsCA(champs, typeIds) {
  const nums = champs.filter((c) => c.type_champ === 'nombre' && typeIds.includes(c.type_id));
  const score = (c) => (/(^|_)ca(_|$)|chiffre|vente|revenu/i.test(c.cle + ' ' + c.libelle) ? 0 : 1);
  const vus = new Set();
  return nums.sort((a, b) => score(a) - score(b)).filter((c) => (vus.has(c.cle) ? false : vus.add(c.cle)));
}

/**
 * Simule un emplacement.
 * position : { lat, lng, gouvernorat } ; rayonKm : rayon de la zone ;
 * points : points de la société ; typesById : id -> type ; demographie : lignes INS ;
 * surfaces : surfaces des gouvernorats ; grille : grille de population (lib/population.js), ou null ;
 * ventes : synthèse des ventes par point (id -> ventes_resume), ou {} ;
 * cleCA : clé du champ numérique utilisé comme CA quand il n'y a pas de ventes importées ;
 * champs : champs des types (pour trouver la surface) ; surfaceNouveau : surface du point simulé (m²) ;
 * moteur : réseau préparé par lib/huff.js pour ce rayon et ces points (facultatif, accélère le calcul).
 */
export function simuler({ position, rayonKm, points, typesById, champs = [], demographie, surfaces, grille, ventes = {}, cleCA, surfaceNouveau, reglage = REGLAGE_DEFAUT, moteur = null }) {
  const { alpha, beta, gamma = 1 } = reglage;
  const r = rayonKm;
  const zoneKm2 = Math.PI * r * r;
  const categorie = (p) => (typesById[p.type_id] || {}).categorie;
  const valides = points.filter((p) => p.statut === 'valide');
  const avecDistance = (liste) => liste
    .map((p) => ({ ...p, distance: distanceKm(position.lat, position.lng, p.latitude, p.longitude) }))
    .sort((a, b) => a.distance - b.distance);

  // Population : somme de la grille dans le cercle ; à défaut, densité moyenne du gouvernorat × surface.
  const gouv = normalizeGouvernorat(position.gouvernorat);
  const stats = gouv ? statsGouvernorat(demographie, gouv) : null;
  const surface = gouv ? surfaces[gouv] : null;
  const densiteGouv = stats && stats.population && surface ? stats.population / surface : null;
  const sourcePopulation = grille ? 'grille' : densiteGouv ? 'gouvernorat' : null;
  const population = grille
    ? Math.round(populationDansRayon(grille, position.lat, position.lng, r))
    : densiteGouv ? Math.round(densiteGouv * zoneKm2) : null;
  const densite = population != null ? population / zoneKm2 : null;
  // Ménages : population divisée par la taille moyenne des ménages du gouvernorat (INS).
  const tailleMenage = stats && stats.population && stats.menages ? stats.population / stats.menages : null;
  const menages = population != null && tailleMenage ? Math.round(population / tailleMenage) : null;

  // Cannibalisation : part de la zone déjà couverte par les points de vente de la société.
  // Réseau de la société : ses points de vente et, pour un distributeur, ses clients.
  const reseau = avecDistance(valides.filter((p) => ['point_de_vente', 'client'].includes(categorie(p))));
  const proches = reseau.filter((p) => p.distance < 2 * r);
  const cannibalisation = partCouverte(position.lat, position.lng, r, proches);

  // Concurrence dans la zone.
  const concurrents = avecDistance(valides.filter((p) => categorie(p) === 'concurrent'));
  const concurrentsZone = concurrents.filter((p) => p.distance <= r);

  // CA de référence de vos points : ventes importées en priorité, sinon le champ choisi.
  const aVentes = reseau.some((p) => (caMensuelMoyen(ventes[p.id]) || 0) > 0);
  const aChamp = !!cleCA && reseau.some((p) => Number((p.donnees || {})[cleCA]) > 0);
  const sourceCA = aVentes ? 'ventes' : aChamp ? 'champ' : null;
  const caDe = (p) => (sourceCA === 'ventes' ? caMensuelMoyen(ventes[p.id]) : Number((p.donnees || {})[cleCA]));
  const refs = sourceCA ? reseau.filter((p) => caDe(p) > 0) : [];
  const caReference = mediane(refs.map(caDe));

  // Surfaces (m²) : champ « surface » de chaque type ; à défaut, la surface médiane de vos points.
  const cles = clesSurface(champs);
  const surfaceDe = (p) => Number((p.donnees || {})[cles[p.type_id]]);
  const surfacesConnues = reseau.map(surfaceDe).filter((v) => Number.isFinite(v) && v > 0);
  const surfaceMediane = mediane(surfacesConnues);
  const surfaceNouveauOk = Number(surfaceNouveau) > 0 ? Number(surfaceNouveau) : surfaceMediane;
  const attraction = (p) => {
    const v = surfaceDe(p);
    return (Number.isFinite(v) && v > 0 ? v : surfaceMediane || 1) ** alpha;
  };


  let methodeCA = null;
  let caEstime = null;
  let caParHabitant = null;
  let habitantsCaptes_ = null;
  let transfert = null;
  let nbReferences = refs.length;
  let cannibalisationCA = null;
  if (refs.length && grille) {
    // 1. Calibrage : CA mensuel ÷ habitants captés^gamma, pour chacun de vos points qui a un CA.
    const magasins = [...reseau, ...concurrents].map((p) => ({ ...p, attraction: attraction(p) }));
    const parId = Object.fromEntries(magasins.map((m) => [m.id, m]));
    // Avec un moteur préparé pour ce rayon (lib/huff.js), mêmes habitants captés, calculés bien plus vite.
    const hReseau = moteur && moteur.rayonKm === r ? captesReseau(moteur, alpha, beta) : null;
    const ratios = refs
      .map((p) => {
        const h = hReseau && hReseau.has(p.id) ? hReseau.get(p.id) : habitantsCaptes(grille, parId[p.id], magasins, r, beta);
        return h >= CAPTES_MIN ? caDe(p) / h ** gamma : null;
      })
      .filter((v) => v != null);
    if (ratios.length) {
      const k = mediane(ratios);
      nbReferences = ratios.length;
      // 2. Nouveau point : habitants captés carré par carré, face à vos points et aux concurrents.
      const nouveau = { id: '__nouveau', latitude: position.lat, longitude: position.lng, attraction: (surfaceNouveauOk || 1) ** alpha };
      const avecNouveau = [...magasins, nouveau];
      habitantsCaptes_ = habitantsCaptes(grille, nouveau, avecNouveau, r, beta);
      caEstime = Math.round(k * habitantsCaptes_ ** gamma);
      caParHabitant = habitantsCaptes_ > 0 ? caEstime / habitantsCaptes_ : null;
      // 3. Transfert : clientèle que le nouveau point prend à vos points voisins.
      transfert = Math.round(proches.reduce((s, p) => {
        const m = parId[p.id];
        return s + k * (habitantsCaptes(grille, m, magasins, r, beta) ** gamma - habitantsCaptes(grille, m, avecNouveau, r, beta) ** gamma);
      }, 0));
      cannibalisationCA = caEstime > 0 ? Math.min(1, transfert / caEstime) : 0;
      methodeCA = 'huff';
    }
  }
  if (methodeCA == null && caReference != null) {
    // Sans grille de population : médiane du réseau, réduite de moitié sur la partie déjà couverte.
    caEstime = Math.round(caReference * (1 - cannibalisation / 2));
    methodeCA = 'mediane';
  }

  return {
    gouvernorat: gouv,
    zoneKm2,
    densite,
    population,
    sourcePopulation,
    menages,
    revenu: stats ? stats.revenu : null,
    delegations: stats ? stats.delegations : 0,
    cannibalisation,
    reseauProches: proches.slice(0, 3),
    plusProche: reseau[0] || null,
    concurrentsZone,
    plusProcheConcurrent: concurrents[0] || null,
    nbValeursCA: nbReferences,
    methodeCA,
    caParHabitant,
    habitantsCaptes: habitantsCaptes_,
    transfert,
    cannibalisationCA,
    surfaceNouveau: surfaceNouveauOk,
    surfaceMediane,
    caParM2: caEstime != null && surfaceNouveauOk ? caEstime / surfaceNouveauOk : null,
    sourceCA,
    caReference,
    caEstime,
  };
}
