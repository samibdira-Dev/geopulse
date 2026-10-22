import { normalizeGouvernorat, sameGouvernorat } from './gouvernorats';

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

function mediane(valeurs) {
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
 * surfaces : surfaces des gouvernorats ; cleCA : clé du champ numérique utilisé comme CA.
 */
export function simuler({ position, rayonKm, points, typesById, demographie, surfaces, cleCA }) {
  const r = rayonKm;
  const zoneKm2 = Math.PI * r * r;
  const categorie = (p) => (typesById[p.type_id] || {}).categorie;
  const valides = points.filter((p) => p.statut === 'valide');
  const avecDistance = (liste) => liste
    .map((p) => ({ ...p, distance: distanceKm(position.lat, position.lng, p.latitude, p.longitude) }))
    .sort((a, b) => a.distance - b.distance);

  // Population : densité moyenne du gouvernorat × surface de la zone.
  const gouv = normalizeGouvernorat(position.gouvernorat);
  const stats = gouv ? statsGouvernorat(demographie, gouv) : null;
  const surface = gouv ? surfaces[gouv] : null;
  const densite = stats && stats.population && surface ? stats.population / surface : null;
  const population = densite ? Math.round(densite * zoneKm2) : null;
  const menages = densite && stats.menages ? Math.round((stats.menages / surface) * zoneKm2) : null;

  // Cannibalisation : part de la zone déjà couverte par les points de vente de la société.
  const reseau = avecDistance(valides.filter((p) => categorie(p) === 'point_de_vente'));
  const proches = reseau.filter((p) => p.distance < 2 * r);
  const cannibalisation = partCouverte(position.lat, position.lng, r, proches);

  // Concurrence dans la zone.
  const concurrents = avecDistance(valides.filter((p) => categorie(p) === 'concurrent'));
  const concurrentsZone = concurrents.filter((p) => p.distance <= r);

  // CA : médiane du champ choisi sur les points de vente existants. Dans la partie déjà couverte,
  // la clientèle se partage avec le PDV existant : le nouveau point n'en garde que la moitié.
  const valeursCA = cleCA
    ? reseau.map((p) => Number((p.donnees || {})[cleCA])).filter((v) => Number.isFinite(v) && v > 0)
    : [];
  const caReference = mediane(valeursCA);
  const caEstime = caReference != null ? Math.round(caReference * (1 - cannibalisation / 2)) : null;

  return {
    gouvernorat: gouv,
    zoneKm2,
    densite,
    population,
    menages,
    revenu: stats ? stats.revenu : null,
    delegations: stats ? stats.delegations : 0,
    cannibalisation,
    reseauProches: proches.slice(0, 3),
    plusProche: reseau[0] || null,
    concurrentsZone,
    plusProcheConcurrent: concurrents[0] || null,
    nbValeursCA: valeursCA.length,
    caReference,
    caEstime,
  };
}
