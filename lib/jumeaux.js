import { clesSurface, distanceKm, mediane } from './simulation';
import { populationDansRayon } from './population';
import { caMensuelMoyen } from './ventes';
import { scorePassage } from './generateurs';

// Méthode des « magasins jumeaux » : le CA d'un site est estimé à partir des points du réseau dont la zone
// lui ressemble le plus (habitants à 1 km et à 3 km, pression concurrentielle, surface, type d'exploitation et, quand
// cela améliore le test sur les ventes, le passage créé par les générateurs de trafic voisins).
// Elle ne dépend pas du modèle gravitaire, ce qui permet de contrôler l'une par l'autre.

export const NB_JUMEAUX = 3;
// Ressemblance minimale (en %) d'un jumeau « très proche ».
export const RESSEMBLANCE_FORTE = 75;
// Écart (en écarts-types, toutes caractéristiques confondues) ajouté quand le type d'exploitation diffère.
const PENALITE_TYPE = 1;
// Exposants d'ajustement de surface essayés : CA du jumeau × (surface du site ÷ surface du jumeau)^theta.
const THETAS = [0, 0.25, 0.5, 0.75, 1];

const CARACTERISTIQUES = [
  { cle: 'pop1', libelle: 'habitants à 1 km' },
  { cle: 'pop3', libelle: 'habitants à 3 km' },
  { cle: 'pression', libelle: 'pression concurrentielle' },
  { cle: 'surface', libelle: 'surface' },
  { cle: 'passage', libelle: 'passage (générateurs de trafic)' },
];

/**
 * Profil d'un site : habitants à 1 et 3 km, m² concurrents pour 1 000 habitants dans le rayon, habitants dans le rayon
 * (popR), surface, score de passage (null sans générateurs de trafic).
 * `concurrents` : [{ latitude, longitude, surface }] ; `generateurs` : lib/generateurs.js, ou null.
 */
export function profilSite(grille, lat, lng, rayonKm, concurrents, surface, generateurs = null) {
  const popR = populationDansRayon(grille, lat, lng, rayonKm);
  const m2 = concurrents.reduce((s, c) => s + (distanceKm(lat, lng, c.latitude, c.longitude) <= rayonKm ? c.surface : 0), 0);
  return {
    pop1: populationDansRayon(grille, lat, lng, 1),
    pop3: populationDansRayon(grille, lat, lng, 3),
    pression: m2 / Math.max(1, popR / 1000),
    popR,
    surface,
    passage: generateurs ? scorePassage(generateurs, lat, lng) : null,
  };
}

/**
 * Prépare le réseau : profil et CA de chaque point de vente (ou client) validé qui a un CA connu.
 * Renvoie null sans grille de population, sinon { refs, concurrents, surfaceMediane, echelles }.
 */
export function preparerReseau({ rayonKm, points, typesById, champs = [], grille, ventes = {}, cleCA, generateurs = null }) {
  if (!grille) return null;
  const categorie = (p) => (typesById[p.type_id] || {}).categorie;
  const valides = points.filter((p) => p.statut === 'valide');
  const reseau = valides.filter((p) => ['point_de_vente', 'client'].includes(categorie(p)));
  const aVentes = reseau.some((p) => (caMensuelMoyen(ventes[p.id]) || 0) > 0);
  const caDe = (p) => (aVentes ? caMensuelMoyen(ventes[p.id]) : Number((p.donnees || {})[cleCA]));
  const cles = clesSurface(champs);
  const surfaceDe = (p) => {
    const v = Number((p.donnees || {})[cles[p.type_id]]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const surfaceMediane = mediane(reseau.map(surfaceDe).filter((v) => v != null)) || 1;
  const surfaceMedianeConc = mediane(valides.filter((p) => categorie(p) === 'concurrent').map(surfaceDe).filter((v) => v != null)) || surfaceMediane;
  const concurrents = valides
    .filter((p) => categorie(p) === 'concurrent')
    .map((p) => ({ latitude: p.latitude, longitude: p.longitude, surface: surfaceDe(p) || surfaceMedianeConc }));
  const refs = reseau.filter((p) => caDe(p) > 0).map((p) => ({
    id: p.id,
    nom: p.nom,
    type_id: p.type_id,
    gouvernorat: p.gouvernorat,
    latitude: p.latitude,
    longitude: p.longitude,
    ca: caDe(p),
    profil: profilSite(grille, p.latitude, p.longitude, rayonKm, concurrents, surfaceDe(p) || surfaceMediane, generateurs),
  }));
  // Échelle de chaque caractéristique : écart-type de son logarithme sur le réseau (0 = inutilisable).
  const echelles = {};
  CARACTERISTIQUES.forEach(({ cle }) => {
    if (refs.some((r) => r.profil[cle] == null)) { echelles[cle] = 0; return; }
    const v = refs.map((r) => Math.log1p(r.profil[cle]));
    const m = v.reduce((s, x) => s + x, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1));
    echelles[cle] = sd > 1e-6 ? sd : 0;
  });
  return { rayonKm, refs, concurrents, surfaceMediane, echelles };
}

// Écart entre deux profils, en écarts-types du réseau (distance euclidienne sur les logarithmes).
// `passage` : compter ou non le score de passage.
function ecartProfils(a, b, echelles, passage) {
  let s = 0;
  CARACTERISTIQUES.forEach(({ cle }) => {
    if (cle === 'passage' && !passage) return;
    if (echelles[cle] && a[cle] != null && b[cle] != null) s += ((Math.log1p(a[cle]) - Math.log1p(b[cle])) / echelles[cle]) ** 2;
  });
  return Math.sqrt(s);
}

// Ressemblance en % : 100 si identique, environ 88 à un écart-type, 61 à deux, 32 à trois.
const ressemblance = (d) => Math.round(100 * Math.exp(-(d * d) / 8));

/**
 * Estime le CA d'un site d'après ses jumeaux. `exclus` : id d'un point à ignorer (test « un magasin caché »).
 * Renvoie null s'il y a moins de NB_JUMEAUX points de comparaison, sinon
 * { estime, jumeaux: [{ id, nom, type_id, ca, caAjuste, ressemblance, profil }], tresProches }.
 */
export function estimerParJumeaux(reseau, profil, { typeId = null, theta = 0.5, exclus = null, passage = false } = {}) {
  if (!reseau) return null;
  const candidats = reseau.refs.filter((r) => r.id !== exclus);
  if (candidats.length < NB_JUMEAUX) return null;
  const classes = candidats
    .map((r) => {
      const d = Math.sqrt(ecartProfils(profil, r.profil, reseau.echelles, passage) ** 2 + (typeId && r.type_id !== typeId ? PENALITE_TYPE ** 2 : 0));
      return { r, d };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, NB_JUMEAUX);
  // Moyenne pondérée par la ressemblance (poids 1 ÷ (écart + 0,25)), après ajustement de surface.
  let somme = 0;
  let poids = 0;
  const jumeaux = classes.map(({ r, d }) => {
    const caAjuste = r.ca * (profil.surface / r.profil.surface) ** theta;
    const w = 1 / (d + 0.25);
    somme += w * caAjuste;
    poids += w;
    return { id: r.id, nom: r.nom, type_id: r.type_id, ca: r.ca, caAjuste, ressemblance: ressemblance(d), profil: r.profil };
  });
  return {
    estime: Math.round(somme / poids),
    jumeaux,
    tresProches: jumeaux.filter((j) => j.ressemblance >= RESSEMBLANCE_FORTE).length,
  };
}

/**
 * Test « un magasin caché » de la méthode, et choix de l'ajustement de surface (theta) et de la prise en compte du
 * passage qui y donnent le plus petit écart médian. Le passage n'est retenu que s'il réduit l'écart d'au moins
 * 1 point. Renvoie null s'il y a moins de 4 points avec un CA, sinon
 * { theta, passage, n, erreurMediane, erreurSansPassage, estimes: Map(id -> CA estimé) }.
 */
export function testerJumeaux(reseau) {
  if (!reseau || reseau.refs.length < NB_JUMEAUX + 1) return null;
  const tester = (passage) => {
    let meilleur = null;
    THETAS.forEach((theta) => {
      const estimes = new Map();
      const ecarts = [];
      reseau.refs.forEach((r) => {
        const e = estimerParJumeaux(reseau, r.profil, { typeId: r.type_id, theta, exclus: r.id, passage });
        if (!e || !(e.estime > 0)) return;
        estimes.set(r.id, e.estime);
        ecarts.push(Math.abs(e.estime - r.ca) / r.ca);
      });
      const erreur = mediane(ecarts);
      if (erreur != null && (!meilleur || erreur < meilleur.erreurMediane)) meilleur = { theta, passage, n: ecarts.length, erreurMediane: erreur, estimes };
    });
    return meilleur;
  };
  const sans = tester(false);
  const avec = reseau.echelles.passage ? tester(true) : null;
  if (!sans) return avec;
  const choisi = avec && avec.erreurMediane < sans.erreurMediane - 0.01 ? avec : sans;
  return { ...choisi, erreurSansPassage: sans.erreurMediane, erreurAvecPassage: avec ? avec.erreurMediane : null };
}
