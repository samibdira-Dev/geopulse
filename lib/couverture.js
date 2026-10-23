import { delegationEn } from './recensement';
import { caMensuelMoyen } from './ventes';
import { mediane } from './simulation';

// Carte de couverture en hexagones : la Tunisie est découpée en hexagones réguliers (500 m, 1 km ou 2 km).
// Chaque hexagone habité est :
//   - couvert : il contient un point du réseau (point de vente ou client), ou il est dans la zone d'un de ces points
//     (hexagones à moins de ~1 km, rattachés au point le plus proche) ;
//   - non couvert : des habitants, aucun point du réseau à proximité.
// Le CA par habitant de chaque zone couverte (CA des points ÷ habitants de la zone) sert à estimer le potentiel des
// zones non couvertes : on prend les zones couvertes les plus semblables (densité, pouvoir d'achat de la délégation,
// concurrents pour 1 000 habitants) et on applique leur CA par habitant aux habitants de la zone non couverte.
// Fonctions pures, sans dépendance au navigateur.

const LAT0 = 30.24764;
const LNG0 = 7.51986;
const PAS = 0.0025;
const KY = 110.574; // km par degré de latitude
const KX = 111.32 * Math.cos((34 * Math.PI) / 180); // km par degré de longitude (latitude moyenne du pays)
const RAC3 = Math.sqrt(3);
const DECAL = 20000;
const cleHex = (q, r) => (q + DECAL) * 2 * DECAL + (r + DECAL);

export const TAILLES = [
  { km: 0.5, libelle: '500 m' },
  { km: 1, libelle: '1 km' },
  { km: 2, libelle: '2 km' },
];
// Zone d'un point : hexagones à moins d'environ 1 km (au moins l'anneau voisin).
export const anneauZone = (taille) => Math.max(1, Math.round(1 / taille));
// Population minimale d'une zone couverte pour mesurer un CA par habitant fiable.
const POP_MIN_ZONE = 300;
// Population minimale d'un hexagone non couvert pour lui attribuer un potentiel.
const POP_MIN_HEX = 30;
const VOISINS_K = 7;

export const ETATS = { point: 1, desservi: 2, non_couvert: 3 };

// Coordonnées hexagonales (hexagones « pointe en haut ») d'une position, pour une taille (distance entre centres, km).
function versHex(lat, lng, R) {
  const x = (lng - LNG0) * KX;
  const y = (lat - LAT0) * KY;
  const qf = ((RAC3 / 3) * x - y / 3) / R;
  const rf = ((2 / 3) * y) / R;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

function centreHex(q, r, R) {
  const x = R * RAC3 * (q + r / 2);
  const y = R * 1.5 * r;
  return [LAT0 + y / KY, LNG0 + x / KX];
}

/** Décalages (degrés) des 6 sommets d'un hexagone : [[dLat, dLng], …]. */
export function sommetsHex(taille) {
  const R = taille / RAC3;
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = ((60 * i + 30) * Math.PI) / 180;
    return [(R * Math.sin(a)) / KY, (R * Math.cos(a)) / KX];
  });
}

/** Indice de l'hexagone qui contient la position dans un résultat de analyserCouverture, ou -1. */
export function hexEn(res, lat, lng) {
  if (!res) return -1;
  const [q, r] = versHex(lat, lng, res.taille / RAC3);
  const i = res.index.get(cleHex(q, r));
  return i === undefined ? -1 : i;
}

// Positions relatives des hexagones à moins de n anneaux (centre compris).
function voisinage(n) {
  const out = [];
  for (let dq = -n; dq <= n; dq++) {
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) out.push([dq, dr, (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2]);
  }
  return out;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * Analyse la couverture du réseau.
 * Entrées : grille de population (Uint16Array), délégations (GeoJSON du recensement, facultatif), points, typesById,
 * ventes (id -> ventes_resume), cleCA (champ de CA saisi, utilisé sans ventes importées), taille (km).
 * Renvoie { taille, anneau, aireHex, index, hex[], zones[], prometteuses[], sousExploitees[], gouvernorats[], totaux,
 * test, ratioMedian, avecCA } (voir le détail plus bas), ou null sans grille.
 */
export function analyserCouverture({ grille, delegations = null, points, typesById, ventes = {}, cleCA = null, taille = 0.5 }) {
  if (!grille) return null;
  const R = taille / RAC3;
  const aireHex = 1.5 * RAC3 * R * R;
  const anneau = anneauZone(taille);
  const autour = voisinage(anneau);

  // 1. Hexagones habités : somme des carrés de 250 m de la grille.
  const index = new Map();
  const hex = [];
  const obtenir = (q, r) => {
    const k = cleHex(q, r);
    let i = index.get(k);
    if (i === undefined) {
      i = hex.length;
      index.set(k, i);
      hex.push({ q, r, pop: 0, nbReseau: 0, nbCA: 0, ca: 0, nbConc: 0, zone: -1, dist: Infinity, etat: 0, ratio: null, pot: 0 });
    }
    return i;
  };
  for (let i = 0; i < grille.length; i += 3) {
    const lat = LAT0 + (grille[i] + 0.5) * PAS;
    const lng = LNG0 + (grille[i + 1] + 0.5) * PAS;
    const [q, r] = versHex(lat, lng, R);
    hex[obtenir(q, r)].pop += grille[i + 2];
  }

  // 2. Points du réseau et concurrents.
  const categorie = (p) => (typesById[p.type_id] || {}).categorie;
  const valides = points.filter((p) => p.statut === 'valide' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  const reseau = valides.filter((p) => ['point_de_vente', 'client'].includes(categorie(p)));
  const concurrents = valides.filter((p) => categorie(p) === 'concurrent');
  const aVentes = reseau.some((p) => (caMensuelMoyen(ventes[p.id]) || 0) > 0);
  const caDe = (p) => {
    const v = aVentes ? caMensuelMoyen(ventes[p.id]) : Number((p.donnees || {})[cleCA]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  reseau.forEach((p) => {
    const [q, r] = versHex(p.latitude, p.longitude, R);
    const h = hex[obtenir(q, r)];
    h.nbReseau += 1;
    const ca = caDe(p);
    if (ca != null) { h.nbCA += 1; h.ca += ca; }
  });
  concurrents.forEach((p) => {
    const [q, r] = versHex(p.latitude, p.longitude, R);
    const i = index.get(cleHex(q, r));
    if (i !== undefined) hex[i].nbConc += 1;
  });

  // 3. Zone de chaque hexagone du réseau : hexagones habités à moins de `anneau`, rattachés au plus proche.
  const sources = [];
  hex.forEach((h, i) => { if (h.nbReseau > 0) sources.push(i); });
  sources.forEach((s) => {
    const c = hex[s];
    autour.forEach(([dq, dr, d]) => {
      const j = index.get(cleHex(c.q + dq, c.r + dr));
      if (j === undefined) return;
      const h = hex[j];
      if (d < h.dist || (d === h.dist && hex[h.zone].nbReseau < c.nbReseau)) { h.dist = d; h.zone = s; }
    });
  });

  // 4. Délégation de chaque hexagone (pouvoir d'achat, nom, gouvernorat), avec un cache d'environ 2 km.
  const cacheDel = new Map();
  const delDe = (lat, lng) => {
    if (!delegations) return null;
    const k = Math.round(lat * 50) * 100000 + Math.round(lng * 50);
    if (!cacheDel.has(k)) cacheDel.set(k, delegationEn(delegations, lat, lng));
    return cacheDel.get(k);
  };
  // Nom exact (sans le cache) pour les hexagones affichés dans les listes.
  const nommer = (h) => {
    const d = delegations ? delegationEn(delegations, h.lat, h.lng) : null;
    if (d) { h.delegation = d.delegation; h.gouvernorat = d.gouvernorat; }
    return h;
  };
  hex.forEach((h) => {
    const [lat, lng] = centreHex(h.q, h.r, R);
    h.lat = lat;
    h.lng = lng;
    const d = delDe(lat, lng);
    h.delegation = d ? d.delegation : null;
    h.gouvernorat = d ? d.gouvernorat : null;
    h.indice = d && Number.isFinite(d.indice_depense) ? d.indice_depense : 1;
    h.etat = h.nbReseau > 0 ? ETATS.point : h.zone >= 0 ? ETATS.desservi : h.pop > 0 ? ETATS.non_couvert : 0;
  });

  // Mesures du voisinage d'un hexagone (même étendue qu'une zone) : densité, concurrents pour 1 000 habitants.
  const nbPositions = autour.length;
  const mesures = (h) => {
    let pop = 0;
    let conc = 0;
    autour.forEach(([dq, dr]) => {
      const j = index.get(cleHex(h.q + dq, h.r + dr));
      if (j !== undefined) { pop += hex[j].pop; conc += hex[j].nbConc; }
    });
    return [Math.log1p(pop / (nbPositions * aireHex)), h.indice, Math.log1p((1000 * conc) / Math.max(pop, 100))];
  };

  // 5. Zones couvertes : CA, habitants, CA par habitant.
  const parZone = new Map(sources.map((s) => [s, { hexes: [], pop: 0, nbConc: 0 }]));
  hex.forEach((h, i) => {
    if (h.zone < 0) return;
    const z = parZone.get(h.zone);
    z.hexes.push(i);
    z.pop += h.pop;
    z.nbConc += h.nbConc;
  });
  const zones = sources.map((s) => {
    const c = nommer(hex[s]);
    const z = parZone.get(s);
    const complet = c.nbCA === c.nbReseau;
    const ratio = complet && c.ca > 0 && z.pop >= POP_MIN_ZONE ? c.ca / z.pop : null;
    return { i: s, lat: c.lat, lng: c.lng, delegation: c.delegation, gouvernorat: c.gouvernorat, nbPoints: c.nbReseau, ca: c.ca, pop: z.pop, nbConc: z.nbConc, hexes: z.hexes, ratio, x: mesures(c) };
  });
  zones.forEach((z) => z.hexes.forEach((i) => { hex[i].ratio = z.ratio; }));

  // 6. Modèle : CA par habitant des zones couvertes les plus semblables (k plus proches voisins, moyenne géométrique).
  const apprentissage = zones.filter((z) => z.ratio != null);
  const avecCA = apprentissage.length >= 5;
  let predire = () => null;
  let densiteMin = -Infinity;
  if (avecCA) {
    // Pas d'estimation pour un lieu moins dense que toutes vos zones : aucune zone semblable pour le comparer.
    densiteMin = Math.min(...apprentissage.map((z) => z.x[0])) - 0.1;
    const moy = [0, 1, 2].map((d) => apprentissage.reduce((s, z) => s + z.x[d], 0) / apprentissage.length);
    const ect = [0, 1, 2].map((d) => Math.sqrt(apprentissage.reduce((s, z) => s + (z.x[d] - moy[d]) ** 2, 0) / apprentissage.length) || 1);
    const norm = (x) => x.map((v, d) => (v - moy[d]) / ect[d]);
    apprentissage.forEach((z) => { z.n = norm(z.x); });
    predire = (x, exclu = null) => {
      const n = norm(x);
      // Les VOISINS_K zones les plus proches, gardées triées (plus rapide qu'un tri complet pour chaque hexagone).
      const k = [];
      for (const z of apprentissage) {
        if (z === exclu) continue;
        const d = (n[0] - z.n[0]) ** 2 + (n[1] - z.n[1]) ** 2 + (n[2] - z.n[2]) ** 2;
        if (k.length === VOISINS_K && d >= k[VOISINS_K - 1][0]) continue;
        let j = Math.min(k.length, VOISINS_K - 1);
        while (j > 0 && k[j - 1][0] > d) { k[j] = k[j - 1]; j -= 1; }
        k[j] = [d, z];
      }
      k.forEach((x) => { x[0] = Math.sqrt(x[0]); });
      let sp = 0;
      let sl = 0;
      k.forEach(([d, z]) => { const p = 1 / (d + 0.25); sp += p; sl += p * Math.log(z.ratio); });
      return { ratio: Math.exp(sl / sp), semblables: k.map(([, z]) => z) };
    };
  }

  // 7. Test : chaque zone couverte est estimée sans elle-même, comparée à son CA réel.
  const erreurs = [];
  apprentissage.forEach((z) => {
    const p = predire(z.x, z);
    z.ratioPrevu = p.ratio;
    z.caPrevu = p.ratio * z.pop;
    erreurs.push(Math.abs(z.caPrevu / z.ca - 1));
  });
  const test = erreurs.length ? { n: erreurs.length, erreurMediane: mediane(erreurs) } : null;

  // 8. Potentiel des hexagones non couverts.
  const nonCouverts = [];
  hex.forEach((h, i) => {
    if (h.etat !== ETATS.non_couvert) return;
    if (avecCA && h.pop >= POP_MIN_HEX) {
      const x = mesures(h);
      if (x[0] < densiteMin) h.horsReferences = true;
      else {
        const p = predire(x);
        h.ratio = p.ratio;
        h.pot = h.pop * p.ratio;
      }
    }
    nonCouverts.push(i);
  });

  // 9. Zones les plus prometteuses : potentiel des hexagones non couverts autour de chaque hexagone ; on garde le
  // meilleur, puis on écarte ses voisins pour proposer des zones distinctes.
  const prometteuses = [];
  if (avecCA) {
    const candidats = nonCouverts.filter((i) => hex[i].pot > 0).map((i) => {
      const h = hex[i];
      let pot = 0;
      let pop = 0;
      let conc = 0;
      autour.forEach(([dq, dr]) => {
        const j = index.get(cleHex(h.q + dq, h.r + dr));
        if (j === undefined) return;
        conc += hex[j].nbConc;
        if (hex[j].etat === ETATS.non_couvert) { pot += hex[j].pot; pop += hex[j].pop; }
      });
      return { i, pot, pop, conc };
    }).sort((a, b) => b.pot - a.pot);
    const pris = new Set();
    const ecart = voisinage(2 * anneau);
    for (const c of candidats) {
      if (prometteuses.length >= 50) break;
      if (pris.has(c.i)) continue;
      const h = nommer(hex[c.i]);
      ecart.forEach(([dq, dr]) => {
        const j = index.get(cleHex(h.q + dq, h.r + dr));
        if (j !== undefined) pris.add(j);
      });
      const p = predire(mesures(h));
      let proche = Infinity;
      reseau.forEach((m) => { proche = Math.min(proche, distanceKm(h.lat, h.lng, m.latitude, m.longitude)); });
      prometteuses.push({
        i: c.i, lat: h.lat, lng: h.lng, delegation: h.delegation, gouvernorat: h.gouvernorat,
        pop: c.pop, potentiel: c.pot, caParHab: c.pop > 0 ? c.pot / c.pop : null, concurrents: c.conc,
        indice: h.indice, distanceReseau: Number.isFinite(proche) ? proche : null,
        semblables: p.semblables.slice(0, 3).map((z) => z.delegation || z.gouvernorat || 'Zone'),
      });
    }
  }

  // 10. Zones couvertes sous le niveau de zones semblables : manque à gagner = CA attendu − CA réel.
  const sousExploitees = apprentissage
    .filter((z) => z.caPrevu > z.ca)
    .map((z) => ({ i: z.i, lat: z.lat, lng: z.lng, delegation: z.delegation, gouvernorat: z.gouvernorat, nbPoints: z.nbPoints, pop: z.pop, ca: z.ca, caPrevu: z.caPrevu, manque: z.caPrevu - z.ca }))
    .sort((a, b) => b.manque - a.manque)
    .slice(0, 20);

  // 11. Bilan par gouvernorat et totaux.
  const parGouv = new Map();
  const totaux = { pop: 0, popCouverte: 0, ca: 0, potentiel: 0, points: reseau.length, hexCouverts: 0, hexNonCouverts: 0, popHorsReferences: 0 };
  hex.forEach((h) => {
    const g = h.gouvernorat || 'Hors délégation';
    if (!parGouv.has(g)) parGouv.set(g, { gouvernorat: g, pop: 0, popCouverte: 0, ca: 0, potentiel: 0, points: 0 });
    const x = parGouv.get(g);
    x.pop += h.pop;
    x.ca += h.ca;
    x.points += h.nbReseau;
    x.potentiel += h.pot;
    totaux.pop += h.pop;
    totaux.ca += h.ca;
    totaux.potentiel += h.pot;
    if (h.etat === ETATS.point || h.etat === ETATS.desservi) {
      x.popCouverte += h.pop;
      totaux.popCouverte += h.pop;
      totaux.hexCouverts += 1;
    } else if (h.etat === ETATS.non_couvert) {
      totaux.hexNonCouverts += 1;
      if (h.horsReferences) totaux.popHorsReferences += h.pop;
    }
  });
  const gouvernorats = [...parGouv.values()]
    .filter((g) => g.pop > 0 && g.gouvernorat !== 'Hors délégation')
    .map((g) => ({ ...g, couverture: g.pop > 0 ? g.popCouverte / g.pop : 0 }))
    .sort((a, b) => b.potentiel - a.potentiel || b.pop - a.pop);

  // Paliers de couleur : CA par habitant des zones couvertes (tiers) et potentiel des hexagones non couverts.
  const quantile = (v, q) => (v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : null);
  const ratios = apprentissage.map((z) => z.ratio).sort((a, b) => a - b);
  const pots = nonCouverts.map((i) => hex[i].pot).filter((v) => v > 0).sort((a, b) => a - b);
  const paliers = {
    ratio: [quantile(ratios, 1 / 3), quantile(ratios, 2 / 3)],
    pot: [quantile(pots, 0.4), quantile(pots, 0.7), quantile(pots, 0.9)],
  };

  return {
    taille, anneau, aireHex, index, hex, zones, prometteuses, sousExploitees, gouvernorats, totaux, test, paliers, avecCA,
    ratioMedian: ratios.length ? mediane(ratios) : null,
  };
}

// Couleurs de la carte.
export const COULEURS = {
  couvert: ['#bbf7d0', '#4ade80', '#15803d'], // CA par habitant faible, moyen, fort
  couvertSansCA: '#86efac',
  pot: ['#fef3c7', '#fdba74', '#f97316', '#dc2626'], // potentiel faible à très fort
  faible: '#e2e8f0', // non couvert, trop peu d'habitants ou potentiel inconnu
};

/** Couleur de remplissage d'un hexagone, ou null s'il n'est pas dessiné. */
export function couleurHex(res, h) {
  if (h.etat === ETATS.point || h.etat === ETATS.desservi) {
    if (h.ratio == null) return COULEURS.couvertSansCA;
    const [a, b] = res.paliers.ratio;
    return COULEURS.couvert[h.ratio < a ? 0 : h.ratio < b ? 1 : 2];
  }
  if (h.etat === ETATS.non_couvert) {
    if (!(h.pot > 0)) return h.pop >= POP_MIN_HEX && !res.avecCA ? COULEURS.pot[1] : COULEURS.faible;
    const [a, b, c] = res.paliers.pot;
    return COULEURS.pot[h.pot < a ? 0 : h.pot < b ? 1 : h.pot < c ? 2 : 3];
  }
  return null;
}
