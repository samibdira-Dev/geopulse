import { parcourirFenetre } from './population';

// Zones accessibles en un temps donné (isochrones), en voiture ou à pied.
// Carte des vitesses public/vitesses-tn.dat (gzip) : un octet par carré de 0,0025° (~250 m), même grille que la
// population ; valeur = vitesse moyenne (km/h) de la meilleure route du carré, 3 = chemin piéton, 0 = pas de route.
// Routes : Overture Maps Foundation (transportation, octobre 2026, ODbL). Vitesses par catégorie de route, trafic
// compris, réduites de 35 % en ville dense. Le temps se propage de carré en carré (algorithme de Dijkstra).

const LAT0 = 30.24764;
const LNG0 = 7.51986;
const PAS = 0.0025;
const NL = 2960;
const NC = 1680;
const KM_LAT = PAS * 110.574;
// Vitesses hors route : marcher jusqu'à la route (voiture), marcher à travers champs (à pied).
const HORS_ROUTE_VOITURE = 6;
const PIETON = 4.5;
const PIETON_HORS_CHEMIN = 3;

export const DUREES = [5, 10, 15];

let chargement = null;
export function chargerVitesses() {
  if (!chargement) {
    chargement = fetch('/vitesses-tn.dat')
      .then((r) => {
        if (!r.ok || !r.body || typeof DecompressionStream === 'undefined') throw new Error('Carte des vitesses indisponible');
        return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      })
      .then((buf) => new Uint8Array(buf))
      .catch((e) => {
        chargement = null;
        throw e;
      });
  }
  return chargement;
}

// File de priorité minimale (tas binaire) sur des paires (temps, indice).
class Tas {
  constructor() { this.t = []; this.i = []; }
  get taille() { return this.t.length; }
  ajouter(t, i) {
    const T = this.t; const I = this.i;
    let k = T.length; T.push(t); I.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (T[p] <= t) break;
      T[k] = T[p]; I[k] = I[p]; k = p;
    }
    T[k] = t; I[k] = i;
  }
  retirer() {
    const T = this.t; const I = this.i;
    const t0 = T[0]; const i0 = I[0];
    const t = T.pop(); const i = I.pop();
    if (T.length) {
      let k = 0;
      for (;;) {
        let f = 2 * k + 1;
        if (f >= T.length) break;
        if (f + 1 < T.length && T[f + 1] < T[f]) f++;
        if (T[f] >= t) break;
        T[k] = T[f]; I[k] = I[f]; k = f;
      }
      T[k] = t; I[k] = i;
    }
    return [t0, i0];
  }
}

/**
 * Temps d'accès (minutes) depuis un point, jusqu'à maxMin minutes, en 'voiture' ou à 'pied'.
 * Renvoie { l0, c0, L, C, temps: Float64Array(L × C) (Infinity = hors d'atteinte), mode, maxMin }.
 */
export function calculerIsochrone(vitesses, lat, lng, { mode = 'voiture', maxMin = 15 } = {}) {
  const vMax = mode === 'voiture' ? 100 : PIETON;
  const portee = Math.ceil(((vMax * maxMin) / 60 / KM_LAT) * 1.05) + 2;
  const l = Math.floor((lat - LAT0) / PAS);
  const c = Math.floor((lng - LNG0) / PAS);
  const l0 = Math.max(0, l - portee);
  const c0 = Math.max(0, c - portee);
  const L = Math.min(NL, l + portee + 1) - l0;
  const C = Math.min(NC, c + portee + 1) - c0;
  const kmLng = PAS * 111.32 * Math.cos((lat * Math.PI) / 180);
  const diag = Math.hypot(KM_LAT, kmLng);
  const vitesse = (k) => {
    const v = vitesses[(l0 + Math.floor(k / C)) * NC + c0 + (k % C)];
    if (mode === 'voiture') return v > 3 ? v : HORS_ROUTE_VOITURE;
    return v > 0 ? PIETON : PIETON_HORS_CHEMIN;
  };
  const temps = new Float64Array(L * C).fill(Infinity);
  const depart = (l - l0) * C + (c - c0);
  if (l < 0 || l >= NL || c < 0 || c >= NC) return { l0, c0, L, C, temps, mode, maxMin };
  temps[depart] = 0;
  const tas = new Tas();
  tas.ajouter(0, depart);
  const voisins = [[-1, 0, KM_LAT], [1, 0, KM_LAT], [0, -1, kmLng], [0, 1, kmLng], [-1, -1, diag], [-1, 1, diag], [1, -1, diag], [1, 1, diag]];
  while (tas.taille) {
    const [t, k] = tas.retirer();
    if (t > temps[k]) continue;
    const kl = Math.floor(k / C);
    const kc = k % C;
    const vk = vitesse(k);
    for (const [dl, dc, km] of voisins) {
      const nl = kl + dl;
      const nc = kc + dc;
      if (nl < 0 || nl >= L || nc < 0 || nc >= C) continue;
      const n = nl * C + nc;
      // Moitié du trajet à la vitesse du carré de départ, moitié à celle du carré d'arrivée.
      const tn = t + ((km / 2) / vk + (km / 2) / vitesse(n)) * 60;
      if (tn < temps[n] && tn <= maxMin) {
        temps[n] = tn;
        tas.ajouter(tn, n);
      }
    }
  }
  return { l0, c0, L, C, temps, mode, maxMin };
}

// Temps d'accès (minutes) jusqu'à une position, Infinity si hors d'atteinte.
export function tempsJusqua(iso, lat, lng) {
  const l = Math.floor((lat - LAT0) / PAS) - iso.l0;
  const c = Math.floor((lng - LNG0) / PAS) - iso.c0;
  if (l < 0 || l >= iso.L || c < 0 || c >= iso.C) return Infinity;
  return iso.temps[l * iso.C + c];
}

// Habitants à moins de chaque durée : { 5: n, 10: n, 15: n }.
export function habitantsParDuree(grille, iso, durees = DUREES) {
  const out = Object.fromEntries(durees.map((d) => [d, 0]));
  parcourirFenetre(grille, iso.l0, iso.l0 + iso.L - 1, iso.c0, iso.c0 + iso.C - 1, (l, c, pop) => {
    const t = iso.temps[(l - iso.l0) * iso.C + (c - iso.c0)];
    durees.forEach((d) => { if (t <= d) out[d] += pop; });
  });
  return out;
}

// Surface accessible (km²) en moins de d minutes.
export function surfaceKm2(iso, d) {
  let n = 0;
  for (let k = 0; k < iso.temps.length; k++) if (iso.temps[k] <= d) n++;
  const lat = LAT0 + (iso.l0 + iso.L / 2) * PAS;
  return n * KM_LAT * PAS * 111.32 * Math.cos((lat * Math.PI) / 180);
}

export const COULEURS_DUREES = { 5: [91, 33, 182], 10: [139, 92, 246], 15: [221, 214, 254] };
const OPACITES = { 5: 230, 10: 170, 15: 120 };

// Image des zones (une couleur par durée) et son emprise, pour une couche ImageOverlay de Leaflet.
export function imageIsochrone(iso, durees = DUREES) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = iso.C;
  canvas.height = iso.L;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(iso.C, iso.L);
  for (let l = 0; l < iso.L; l++) {
    for (let c = 0; c < iso.C; c++) {
      const t = iso.temps[l * iso.C + c];
      const d = durees.find((x) => t <= x);
      if (d == null) continue;
      const p = ((iso.L - 1 - l) * iso.C + c) * 4; // l'image se lit du nord au sud
      const [r, g, b] = COULEURS_DUREES[d] || COULEURS_DUREES[15];
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = OPACITES[d] || 120;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    url: canvas.toDataURL(),
    bounds: [[LAT0 + iso.l0 * PAS, LNG0 + iso.c0 * PAS], [LAT0 + (iso.l0 + iso.L) * PAS, LNG0 + (iso.c0 + iso.C) * PAS]],
  };
}
