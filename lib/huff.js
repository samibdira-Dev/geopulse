import { parcourirRayon } from './population';
import { CAPTES_MIN, clesSurface, distanceKm, mediane } from './simulation';
import { caMensuelMoyen } from './ventes';

// Moteur rapide du modèle de partage (mêmes calculs que habitantsCaptes() de lib/simulation.js), pour le test
// « un magasin caché » sur un grand réseau. Les couples (point, carré de 250 m à moins du rayon) sont calculés
// une fois ; cacher un point ne modifie que les carrés de sa zone, et seulement pour ses voisins.

const DISTANCE_MIN_KM = 0.1;

/**
 * Prépare le réseau pour un rayon : points de la société avec un CA connu (refs) et tous les points en concurrence.
 * Renvoie null sans grille, sinon { refs, magasins, surfaceDe, surfaceMediane, couples… }.
 */
export function preparerMoteur({ rayonKm: r, points, typesById, champs = [], grille, ventes = {}, cleCA }) {
  if (!grille) return null;
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

  // Couples (point, carré) : début de chaque point dans les tableaux, carré (indice compact), distance.
  const indexCarre = new Map();
  const pop = [];
  const debut = new Int32Array(magasins.length + 1);
  const carres = [];
  const distances = [];
  magasins.forEach((m, s) => {
    debut[s] = carres.length;
    parcourirRayon(grille, m.latitude, m.longitude, r, (k, la, lo, habitants, d) => {
      let c = indexCarre.get(k);
      if (c === undefined) { c = pop.length; indexCarre.set(k, c); pop.push(habitants); }
      carres.push(c);
      distances.push(Math.max(DISTANCE_MIN_KM, d));
    });
  });
  debut[magasins.length] = carres.length;

  // Voisins (à moins de 2 × rayon) de chaque point testé, parmi les points testés.
  const voisins = refs.map((a) => refs
    .map((b, k) => (b !== a && distanceKm(magasins[a.i].latitude, magasins[a.i].longitude, magasins[b.i].latitude, magasins[b.i].longitude) <= 2 * r ? k : -1))
    .filter((k) => k >= 0));

  return {
    rayonKm: r, magasins, refs, voisins, surfaceDe, surfaceMediane,
    debut, carres: Int32Array.from(carres), distances: Float64Array.from(distances), pop: Float64Array.from(pop),
  };
}

// Habitants dans le rayon de chaque point testé (pour la densité).
export function habitantsZone(moteur, k) {
  const s = moteur.refs[k].i;
  let t = 0;
  for (let q = moteur.debut[s]; q < moteur.debut[s + 1]; q++) t += moteur.pop[moteur.carres[q]];
  return t;
}

// Forces de chaque couple pour un réglage, et somme des forces de chaque carré.
export function forces(moteur, alpha, beta) {
  const { magasins, debut, carres, distances, pop, surfaceDe, surfaceMediane } = moteur;
  const f = new Float64Array(carres.length);
  const somme = new Float64Array(pop.length);
  for (let s = 0; s < magasins.length; s++) {
    const attraction = (surfaceDe(magasins[s]) || surfaceMediane) ** alpha;
    for (let q = debut[s]; q < debut[s + 1]; q++) {
      f[q] = attraction / distances[q] ** beta;
      somme[carres[q]] += f[q];
    }
  }
  return { f, somme };
}

// Habitants captés par chaque point testé, avec tout le réseau : Map(id -> habitants).
export function captesReseau(moteur, alpha, beta) {
  const { refs, debut, carres, pop } = moteur;
  const { f, somme } = forces(moteur, alpha, beta);
  return new Map(refs.map((x) => {
    let h = 0;
    for (let q = debut[x.i]; q < debut[x.i + 1]; q++) h += (pop[carres[q]] * f[q]) / somme[carres[q]];
    return [x.id, h];
  }));
}

/**
 * Test « un magasin caché » pour un couple (alpha, beta) et plusieurs gamma.
 * Renvoie, pour chaque gamma, la liste des estimations : [{ k (indice dans refs), estime }].
 */
export function estimationsCachees(moteur, alpha, beta, gammas) {
  const { refs, voisins, debut, carres, pop } = moteur;
  const { f, somme } = forces(moteur, alpha, beta);
  const captes = (s, delta) => {
    let h = 0;
    for (let q = debut[s]; q < debut[s + 1]; q++) {
      const c = carres[q];
      h += pop[c] * f[q] * (delta ? 1 / (somme[c] - delta[c]) : 1 / somme[c]);
    }
    return h;
  };
  const h = refs.map((x) => captes(x.i, null));
  const delta = new Float64Array(pop.length);
  const res = gammas.map(() => []);
  const valeurs = new Float64Array(refs.length);
  refs.forEach((cache, k) => {
    const s = cache.i;
    // Retire le point caché des carrés de sa zone…
    for (let q = debut[s]; q < debut[s + 1]; q++) delta[carres[q]] = f[q];
    // … et recalcule ses voisins (les autres gardent leurs habitants captés).
    const hSans = new Map(voisins[k].map((v) => [v, captes(refs[v].i, delta)]));
    for (let q = debut[s]; q < debut[s + 1]; q++) delta[carres[q]] = 0;
    gammas.forEach((gamma, gi) => {
      let n = 0;
      refs.forEach((x, v) => {
        if (v === k) return;
        const hv = hSans.has(v) ? hSans.get(v) : h[v];
        if (hv >= CAPTES_MIN) valeurs[n++] = x.ca / hv ** gamma;
      });
      if (!n) return;
      const k_ = mediane(Array.from(valeurs.subarray(0, n)));
      const estime = k_ * h[k] ** gamma;
      if (estime > 0) res[gi].push({ k, estime });
    });
  });
  return res;
}
