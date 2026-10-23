import { parcourirFenetre } from './population';
import { calculerIsochrone } from './isochrones';
import { CAPTES_MIN, clesSurface, mediane } from './simulation';
import { forces } from './huff';
import { caMensuelMoyen } from './ventes';

// Modèle de partage (Huff) sur les temps de trajet réels : la zone de chaque point est ce qu'on atteint en
// N minutes (en voiture ou à pied) par les routes, et l'attraction d'un point baisse avec le temps de trajet
// et non plus avec la distance à vol d'oiseau. Une rivière, une autoroute sans sortie ou une sebkha ne sont
// plus « à côté ». Le réseau préparé a la même forme que celui de lib/huff.js (preparerMoteur), ce qui permet
// de réutiliser le test « un magasin caché » et le réglage du modèle (lib/fiabilite.js).

const NC = 1680;
const PAS_KM2 = 0.0025 * 110.574 * 0.0025 * 111.32;
// Temps minimal (minutes) : un habitant à côté du magasin compte comme à 1 minute (évite la division par 0).
const TEMPS_MIN = 1;
const attendre = () => new Promise((ok) => setTimeout(ok, 0));

// Carrés habités atteints en maxMin minutes : visite(indice du carré, habitants, temps).
function parcourirIso(grille, iso, maxMin, visite) {
  parcourirFenetre(grille, iso.l0, iso.l0 + iso.L - 1, iso.c0, iso.c0 + iso.C - 1, (l, c, pop) => {
    const t = iso.temps[(l - iso.l0) * iso.C + (c - iso.c0)];
    if (t <= maxMin) visite(l * NC + c, pop, t);
  });
}

/**
 * Prépare le réseau pour un temps de trajet : zone de chaque point = carrés atteints en maxMin minutes.
 * Asynchrone (un isochrone par point, ~2 ms chacun) : rend la main au navigateur, `progression(0..1)` informe,
 * `annule()` arrête. Renvoie null sans grille ni vitesses.
 */
export async function preparerMoteurTrajet({ vitesses, grille, mode, maxMin, points, typesById, champs = [], ventes = {}, cleCA }, progression = () => {}, annule = () => false) {
  if (!grille || !vitesses) return null;
  const categorie = (p) => (typesById[p.type_id] || {}).categorie;
  const valides = points.filter((p) => p.statut === 'valide');
  const reseau = valides.filter((p) => ['point_de_vente', 'client'].includes(categorie(p)));
  const concurrents = valides.filter((p) => categorie(p) === 'concurrent');
  const aVentes = reseau.some((p) => (caMensuelMoyen(ventes[p.id]) || 0) > 0);
  const caDe = (p) => (aVentes ? caMensuelMoyen(ventes[p.id]) : Number((p.donnees || {})[cleCA]));
  const cles = clesSurface(champs);
  const surfaceDe = (p) => {
    const v = Number((p.donnees || {})[cles[p.type_id]]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const surfaceMediane = mediane(reseau.map(surfaceDe).filter((v) => v != null)) || 1;
  const magasins = [...reseau, ...concurrents];
  const refs = [];
  magasins.forEach((m, i) => {
    if (i < reseau.length && caDe(m) > 0) refs.push({ i, id: m.id, nom: m.nom, ca: caDe(m) });
  });

  const indexCarre = new Map();
  const pop = [];
  const debut = new Int32Array(magasins.length + 1);
  const carres = [];
  const temps = [];
  for (let s = 0; s < magasins.length; s++) {
    if (s % 40 === 0) {
      progression(s / magasins.length);
      await attendre();
      if (annule()) return null;
    }
    const m = magasins[s];
    debut[s] = carres.length;
    const iso = calculerIsochrone(vitesses, m.latitude, m.longitude, { mode, maxMin });
    parcourirIso(grille, iso, maxMin, (k, habitants, t) => {
      let c = indexCarre.get(k);
      if (c === undefined) { c = pop.length; indexCarre.set(k, c); pop.push(habitants); }
      carres.push(c);
      temps.push(Math.max(TEMPS_MIN, t));
    });
  }
  debut[magasins.length] = carres.length;
  progression(1);

  // Voisins d'un point testé : les points testés dont la zone partage au moins un carré avec la sienne.
  const proprietaires = new Map();
  refs.forEach((x, k) => {
    for (let q = debut[x.i]; q < debut[x.i + 1]; q++) {
      const c = carres[q];
      const l = proprietaires.get(c);
      if (l) { if (l[l.length - 1] !== k) l.push(k); } else proprietaires.set(c, [k]);
    }
  });
  const voisins = refs.map((x, k) => {
    const v = new Set();
    for (let q = debut[x.i]; q < debut[x.i + 1]; q++) (proprietaires.get(carres[q]) || []).forEach((j) => { if (j !== k) v.add(j); });
    return [...v];
  });
  // Surface de la zone de chaque point testé (km²), pour la densité de population.
  const surfaceZone = refs.map((x) => Math.max(PAS_KM2, (debut[x.i + 1] - debut[x.i]) * PAS_KM2));

  return {
    rayonKm: null, mode, maxMin, magasins, refs, voisins, surfaceDe, surfaceMediane, surfaceZone, indexCarre,
    debut, carres: Int32Array.from(carres), distances: Float64Array.from(temps), pop: Float64Array.from(pop),
  };
}

/**
 * Estime un nouveau point avec le réseau préparé par preparerMoteurTrajet et un réglage { alpha, beta, gamma }.
 * Renvoie null sans point de référence, sinon { caEstime, habitantsCaptes, caParHabitant, transfert,
 * cannibalisationCA, population, zoneKm2, densite, nbReferences }.
 */
export function estimerTrajet(moteur, reglage, { vitesses, grille, lat, lng, surface }) {
  const { alpha, beta, gamma = 1 } = reglage;
  const { refs, debut, carres, pop, indexCarre } = moteur;
  const { f, somme } = forces(moteur, alpha, beta);
  const captes = (s, extra) => {
    let h = 0;
    for (let q = debut[s]; q < debut[s + 1]; q++) {
      const c = carres[q];
      h += (pop[c] * f[q]) / (somme[c] + (extra ? extra.get(c) || 0 : 0));
    }
    return h;
  };
  const ratios = refs.map((x) => {
    const h = captes(x.i, null);
    return h >= CAPTES_MIN ? x.ca / h ** gamma : null;
  }).filter((v) => v != null);
  if (!ratios.length) return null;
  const k = mediane(ratios);

  // Zone du nouveau point et sa force sur chaque carré.
  const iso = calculerIsochrone(vitesses, lat, lng, { mode: moteur.mode, maxMin: moteur.maxMin });
  const attraction = (Number(surface) > 0 ? Number(surface) : moteur.surfaceMediane) ** alpha;
  const fNouveau = new Map(); // indice compact du carré -> force du nouveau point (carrés déjà desservis)
  let h = 0;
  let population = 0;
  let nbCarres = 0;
  parcourirIso(grille, iso, moteur.maxMin, (cle, habitants, t) => {
    const fn = attraction / Math.max(TEMPS_MIN, t) ** beta;
    const c = indexCarre.get(cle);
    const s = c === undefined ? 0 : somme[c];
    h += (habitants * fn) / (s + fn);
    population += habitants;
    nbCarres += 1;
    if (c !== undefined) fNouveau.set(c, fn);
  });
  const caEstime = Math.round(k * h ** gamma);

  // Transfert : clientèle prise à vos points (ceux qui ont un CA connu) dont la zone recoupe celle du nouveau point.
  let transfert = 0;
  refs.forEach((x) => {
    let touche = false;
    for (let q = debut[x.i]; q < debut[x.i + 1] && !touche; q++) touche = fNouveau.has(carres[q]);
    if (!touche) return;
    transfert += k * (captes(x.i, null) ** gamma - captes(x.i, fNouveau) ** gamma);
  });
  transfert = Math.round(transfert);
  const zoneKm2 = Math.max(PAS_KM2, nbCarres * PAS_KM2);
  return {
    caEstime,
    habitantsCaptes: h,
    caParHabitant: h > 0 ? caEstime / h : null,
    transfert,
    cannibalisationCA: caEstime > 0 ? Math.min(1, transfert / caEstime) : 0,
    population: Math.round(population),
    zoneKm2,
    densite: population / zoneKm2,
    nbReferences: ratios.length,
  };
}
