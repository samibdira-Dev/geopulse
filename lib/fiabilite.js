import { clesSurface, simuler } from './simulation';
import { caMensuelMoyen } from './ventes';

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
 * Lance le test. Mêmes paramètres que simuler() (sans position ni surfaceNouveau).
 * Renvoie null s'il n'y a rien à tester, sinon :
 * { n, erreurMediane, ratioBas, ratioHaut, densiteBasse, densiteHaute, details: [{ id, nom, reel, estime, erreur }] }
 * ratioBas / ratioHaut : réel ÷ estimé aux quantiles 10 % et 90 % (bornes de la fourchette).
 */
export function testerModele({ rayonKm, points, typesById, champs = [], demographie, surfaces, grille, ventes = {}, cleCA }) {
  if (!grille) return null;
  const categorie = (p) => (typesById[p.type_id] || {}).categorie;
  const reseau = points.filter((p) => p.statut === 'valide' && ['point_de_vente', 'client'].includes(categorie(p)));
  const aVentes = reseau.some((p) => (caMensuelMoyen(ventes[p.id]) || 0) > 0);
  const caDe = (p) => (aVentes ? caMensuelMoyen(ventes[p.id]) : Number((p.donnees || {})[cleCA]));
  const refs = reseau.filter((p) => caDe(p) > 0);
  if (refs.length < 3) return { n: refs.length, details: [] };

  const cles = clesSurface(champs);
  const details = [];
  const densites = [];
  refs.forEach((p) => {
    const res = simuler({
      position: { lat: p.latitude, lng: p.longitude, gouvernorat: p.gouvernorat },
      rayonKm,
      points: points.filter((x) => x.id !== p.id),
      typesById,
      champs,
      demographie,
      surfaces,
      grille,
      ventes,
      cleCA,
      surfaceNouveau: (p.donnees || {})[cles[p.type_id]],
    });
    if (res.densite != null) densites.push(res.densite);
    if (!(res.caEstime > 0)) return;
    const reel = caDe(p);
    details.push({ id: p.id, nom: p.nom, reel, estime: res.caEstime, erreur: (res.caEstime - reel) / reel });
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

// Note de confiance d'une estimation, de A à D, d'après le test et la ressemblance du site au réseau.
export function noteConfiance(test, res) {
  if (!test || !res || res.caEstime == null || test.n < 5) {
    return { note: 'D', label: 'Pas de chiffre fiable', conseil: 'Moins de 5 points avec un CA connu : importez davantage de ventes.' };
  }
  // Site comparable : densité de population dans la plage observée sur le réseau (avec une marge de 50 %).
  const comparable = res.densite == null || test.densiteBasse == null
    || (res.densite >= test.densiteBasse / 1.5 && res.densite <= test.densiteHaute * 1.5);
  const e = test.erreurMediane;
  if (comparable && test.n >= 15 && e <= 0.15) return { note: 'A', label: 'Chiffre fiable pour décider', comparable };
  if (comparable && test.n >= 8 && e <= 0.25) return { note: 'B', label: 'Bonne indication, à confirmer sur le terrain', comparable };
  return {
    note: 'C',
    label: 'Ordre de grandeur seulement',
    comparable,
    conseil: !comparable ? 'Zone très différente de celles de votre réseau (densité de population).' : null,
  };
}

// Fourchette probable (80 % des cas) autour d'une estimation, d'après les écarts mesurés au test.
export function fourchette(test, caEstime) {
  if (!test || test.ratioBas == null || caEstime == null) return null;
  return { bas: caEstime * Math.min(1, test.ratioBas), haut: caEstime * Math.max(1, test.ratioHaut) };
}
