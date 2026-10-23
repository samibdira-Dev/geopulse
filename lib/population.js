// Grille de population de la Tunisie (Meta / CIESIN, High Resolution Settlement Layer, licence CC BY 4.0),
// agrégée en carrés de 0,0025° (~250 m). Fichier public/population-tn.bin : triplets Uint16
// (indice de ligne, indice de colonne, habitants), triés par ligne puis par colonne.
const LAT0 = 30.24764;
const LNG0 = 7.51986;
const PAS = 0.0025;

let chargement = null;

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function chargerGrille() {
  if (!chargement) {
    chargement = fetch('/population-tn.bin')
      .then((r) => {
        if (!r.ok) throw new Error('Grille de population introuvable (HTTP ' + r.status + ')');
        return r.arrayBuffer();
      })
      .then((buf) => new Uint16Array(buf))
      .catch((e) => {
        chargement = null;
        throw e;
      });
  }
  return chargement;
}

// Premier triplet dont l'indice de ligne est >= ligne (recherche dichotomique).
function debutLigne(g, ligne) {
  let lo = 0;
  let hi = g.length / 3;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g[mid * 3] < ligne) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Parcourt les carrés habités dont le centre est à moins de rayonKm du point :
// visite(indice du carré dans la grille, latitude, longitude, habitants, distance).
export function parcourirRayon(g, lat, lng, rayonKm, visite) {
  const dLat = rayonKm / 110.574;
  const dLng = rayonKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const l0 = Math.max(0, Math.floor((lat - dLat - LAT0) / PAS));
  const l1 = Math.floor((lat + dLat - LAT0) / PAS);
  const c0 = Math.floor((lng - dLng - LNG0) / PAS);
  const c1 = Math.floor((lng + dLng - LNG0) / PAS);
  for (let i = debutLigne(g, l0) * 3; i < g.length && g[i] <= l1; i += 3) {
    const c = g[i + 1];
    if (c < c0 || c > c1) continue;
    const cLat = LAT0 + (g[i] + 0.5) * PAS;
    const cLng = LNG0 + (c + 0.5) * PAS;
    const d = distanceKm(lat, lng, cLat, cLng);
    if (d <= rayonKm) visite(i / 3, cLat, cLng, g[i + 2], d);
  }
}

// Parcourt les carrés habités des lignes l0 à l1 et des colonnes c0 à c1 de la grille : visite(ligne, colonne, habitants).
export function parcourirFenetre(g, l0, l1, c0, c1, visite) {
  for (let i = debutLigne(g, Math.max(0, l0)) * 3; i < g.length && g[i] <= l1; i += 3) {
    const c = g[i + 1];
    if (c >= c0 && c <= c1) visite(g[i], c, g[i + 2]);
  }
}

// Carrés habités dont le centre est à moins de rayonKm du point : [{ lat, lng, pop, distance }].
export function cellulesDansRayon(g, lat, lng, rayonKm) {
  const out = [];
  parcourirRayon(g, lat, lng, rayonKm, (i, cLat, cLng, pop, distance) => out.push({ lat: cLat, lng: cLng, pop, distance }));
  return out;
}

// Habitants des carrés dont le centre est à moins de rayonKm du point.
export function populationDansRayon(g, lat, lng, rayonKm) {
  return cellulesDansRayon(g, lat, lng, rayonKm).reduce((s, c) => s + c.pop, 0);
}
