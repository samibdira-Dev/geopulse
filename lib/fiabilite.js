import { REGLAGE_DEFAUT, mediane } from './simulation';
import { estimationsCachees, habitantsZone, preparerMoteur } from './huff';

// Fiabilité du CA estimé : test « un magasin caché » sur le réseau de la société.
// Chaque point qui a un CA connu est retiré à son tour, puis estimé par le simulateur à partir des autres ;
// l'écart entre estimation et réel mesure la précision du modèle sur CE réseau.

function quantile(valeurs, q) {
  if (!valeurs.length) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const i = (v.length - 1) * q;
  const bas = Math.floor(i);
  return v[bas] + (v[Math.ceil(i)] - v[bas]) * (i - bas);
}

/**
 * Lance le test. Mêmes paramètres que simuler() (sans position ni surfaceNouveau), dont le réglage du modèle.
 * Renvoie null s'il n'y a rien à tester, sinon :
 * { n, erreurMediane, ratioBas, ratioHaut, densiteBasse, densiteHaute, details: [{ id, nom, reel, estime, erreur }] }
 * ratioBas / ratioHaut : réel ÷ estimé aux quantiles 10 % et 90 % (bornes de la fourchette).
 */
export function testerModele({ reglage = REGLAGE_DEFAUT, moteur, ...params }) {
  return testerAvecMoteur(moteur || preparerMoteur(params), reglage);
}

// Même test, sur un réseau déjà préparé (lib/huff.js) : le point caché est estimé comme un nouveau point
// de même surface, à partir des autres points (calculs identiques à simuler(), sans la cannibalisation).
function testerAvecMoteur(moteur, reglage) {
  if (!moteur) return null;
  const { refs } = moteur;
  if (refs.length < 3) return { n: refs.length, details: [] };
  const zoneKm2 = Math.PI * moteur.rayonKm ** 2;
  const densites = refs.map((x, k) => habitantsZone(moteur, k) / zoneKm2);
  const details = estimationsCachees(moteur, reglage.alpha, reglage.beta, [reglage.gamma ?? 1])[0].map(({ k, estime }) => {
    const x = refs[k];
    const e = Math.round(estime);
    return { id: x.id, nom: x.nom, reel: x.ca, estime: e, erreur: (e - x.ca) / x.ca };
  });
  if (!details.length) return { n: 0, details };
  const ratios = details.map((d) => d.reel / d.estime);
  return {
    n: details.length,
    erreurMediane: quantile(details.map((d) => Math.abs(d.erreur)), 0.5),
    ratioBas: quantile(ratios, 0.1),
    ratioHaut: quantile(ratios, 0.9),
    densiteBasse: quantile(densites, 0.1),
    densiteHaute: quantile(densites, 0.9),
    details: details.sort((a, b) => Math.abs(b.erreur) - Math.abs(a.erreur)),
  };
}

/**
 * Test des deux méthodes ensemble : pour chaque point, le CA estimé est la moyenne du modèle gravitaire
 * (`test`, de testerModele) et des magasins jumeaux (`testJumeaux`, de lib/jumeaux.js).
 * Sans jumeaux, renvoie `test` tel quel. Ajoute erreurGravitaire et erreurJumeaux (écarts médians de chaque méthode).
 */
export function combinerTests(test, testJumeaux) {
  if (!test || !test.details || !test.details.length || !testJumeaux) return test;
  const details = test.details
    .filter((d) => testJumeaux.estimes.has(d.id))
    .map((d) => {
      const jumeaux = testJumeaux.estimes.get(d.id);
      const estime = (d.estime + jumeaux) / 2;
      return { ...d, estimeGravitaire: d.estime, estimeJumeaux: jumeaux, estime, erreur: (estime - d.reel) / d.reel };
    });
  if (!details.length) return test;
  const ratios = details.map((d) => d.reel / d.estime);
  return {
    ...test,
    n: details.length,
    erreurMediane: quantile(details.map((d) => Math.abs(d.erreur)), 0.5),
    erreurGravitaire: quantile(details.map((d) => Math.abs(d.estimeGravitaire - d.reel) / d.reel), 0.5),
    erreurJumeaux: testJumeaux.erreurMediane,
    ratioBas: quantile(ratios, 0.1),
    ratioHaut: quantile(ratios, 0.9),
    details: details.sort((a, b) => Math.abs(b.erreur) - Math.abs(a.erreur)),
  };
}

// Écart relatif entre les deux méthodes pour un site (0 = elles donnent le même CA).
export function ecartMethodes(caGravitaire, caJumeaux) {
  if (!(caGravitaire > 0) || !(caJumeaux > 0)) return null;
  return Math.abs(caGravitaire - caJumeaux) / ((caGravitaire + caJumeaux) / 2);
}

// Note de confiance d'une estimation, de A à D, d'après le test et la ressemblance du site au réseau.
// `croise` (facultatif) : { ecart entre méthodes, tresProches : nombre de jumeaux très ressemblants }.
export function noteConfiance(test, res, croise = null) {
  if (!test || !res || res.caEstime == null || test.n < 5) {
    return { note: 'D', label: 'Pas de chiffre fiable', conseil: 'Moins de 5 points avec un CA connu : importez davantage de ventes.' };
  }
  // Site comparable : densité de population dans la plage observée sur le réseau (avec une marge de 50 %).
  const comparable = res.densite == null || test.densiteBasse == null
    || (res.densite >= test.densiteBasse / 1.5 && res.densite <= test.densiteHaute * 1.5);
  const e = test.erreurMediane;
  const ecart = croise && croise.ecart != null ? croise.ecart : null;
  const accordA = !croise || ((ecart == null || ecart < 0.1) && croise.tresProches >= 3);
  const accordB = ecart == null || ecart < 0.2;
  if (comparable && test.n >= 15 && e <= 0.15 && accordA) return { note: 'A', label: 'Chiffre fiable pour décider', comparable };
  if (comparable && test.n >= 8 && e <= 0.25 && accordB) return { note: 'B', label: 'Bonne indication, à confirmer sur le terrain', comparable };
  return {
    note: 'C',
    label: 'Ordre de grandeur seulement',
    comparable,
    conseil: !comparable ? 'Zone très différente de celles de votre réseau (densité de population).'
      : !accordB ? `Les deux méthodes divergent de ${Math.round(ecart * 100)} % sur ce site.` : null,
  };
}

// Fourchette probable (80 % des cas) autour d'une estimation, d'après les écarts mesurés au test,
// élargie pour contenir le CA de chaque méthode (`bornes` : liste de CA, facultative).
export function fourchette(test, caEstime, bornes = []) {
  if (!test || test.ratioBas == null || caEstime == null) return null;
  const ok = bornes.filter((v) => v > 0);
  return {
    bas: Math.min(caEstime * Math.min(1, test.ratioBas), ...ok),
    haut: Math.max(caEstime * Math.max(1, test.ratioHaut), ...ok),
  };
}

// Réglages essayés : poids de la surface (alpha), effet de la distance (beta), rendement des habitants (gamma).
const ALPHAS = [0, 0.5, 1, 1.5];
const BETAS = [1, 1.5, 2, 3];
const GAMMAS = [0.25, 0.5, 0.75, 1];
const attendre = () => new Promise((ok) => setTimeout(ok, 0));

/**
 * Cherche le réglage qui minimise l'écart médian du test « un magasin caché » sur les ventes de la société.
 * `params.moteur` (facultatif) : réseau déjà préparé par preparerMoteur() pour ce rayon.
 * Asynchrone : rend la main au navigateur entre deux essais. `annule()` permet d'arrêter la recherche.
 * Renvoie { reglage, test, testDefaut } ou null (moins de 8 points avec un CA : on garde le réglage par défaut,
 * trop peu de points pour régler trois paramètres sans coller au hasard).
 */
export async function calibrerModele(params, annule = () => false) {
  const moteur = params.moteur || preparerMoteur(params);
  const testDefaut = testerAvecMoteur(moteur, REGLAGE_DEFAUT);
  if (!testDefaut || testDefaut.n < 8) return null;
  let meilleur = { reglage: REGLAGE_DEFAUT, erreur: Infinity };
  for (const alpha of ALPHAS) {
    for (const beta of BETAS) {
      await attendre();
      if (annule()) return null;
      estimationsCachees(moteur, alpha, beta, GAMMAS).forEach((ests, i) => {
        const erreur = mediane(ests.map(({ k, estime }) => Math.abs(estime - moteur.refs[k].ca) / moteur.refs[k].ca));
        if (ests.length >= testDefaut.n && erreur < meilleur.erreur) meilleur = { reglage: { alpha, beta, gamma: GAMMAS.at(i) }, erreur };
      });
    }
  }
  await attendre();
  if (annule()) return null;
  // Test complet (avec le détail par point) pour le réglage retenu ; on garde le défaut s'il n'est pas meilleur.
  const test = testerAvecMoteur(moteur, meilleur.reglage);
  if (!test || test.erreurMediane >= testDefaut.erreurMediane) return { reglage: REGLAGE_DEFAUT, test: testDefaut, testDefaut };
  return { reglage: meilleur.reglage, test, testDefaut };
}
