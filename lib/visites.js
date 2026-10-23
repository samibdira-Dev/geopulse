// Journal des visites des commerciaux : résultats possibles, points à visiter et chiffres de la période.
// Fonctions pures ; les visites sont lues dans la table visites et la synthèse par point via visites_resume.

export const RESULTATS = {
  commande: { label: 'Commande', couleur: '#15803d', fond: '#dcfce7' },
  sans_commande: { label: 'Pas de commande', couleur: '#b45309', fond: '#fef3c7' },
  ferme: { label: 'Fermé ou absent', couleur: '#475569', fond: '#e2e8f0' },
  prospection: { label: 'Prospection', couleur: '#4338ca', fond: '#eef0ff' },
  reclamation: { label: 'Réclamation', couleur: '#b91c1c', fond: '#fee2e2' },
};

export const SEUILS_JOURS = [7, 15, 30, 60];

const JOUR = 24 * 3600 * 1000;

/** Date du jour au format AAAA-MM-JJ, en heure locale. */
export function aujourdhui(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Nombre de jours entre deux dates AAAA-MM-JJ (fin - debut). */
export function joursEntre(debut, fin) {
  return Math.round((Date.parse(fin + 'T00:00:00Z') - Date.parse(debut + 'T00:00:00Z')) / JOUR);
}

/** « aujourd'hui », « hier », « il y a 12 jours ». */
export function depuisLe(date, jour = aujourdhui()) {
  if (!date) return 'jamais visité';
  const n = joursEntre(date, jour);
  if (n <= 0) return 'aujourd’hui';
  if (n === 1) return 'hier';
  return `il y a ${n} jours`;
}

// Les concurrents ne se visitent pas ; les points rejetés non plus.
export const visitable = (p, typesById) => (typesById[p.type_id] || {}).categorie !== 'concurrent' && p.statut !== 'rejete';
// Le suivi « à visiter » porte sur le réseau (points de vente et clients), pas sur les prospects ni les emplacements à l'étude.
export const aSuivre = (p, typesById) => ['point_de_vente', 'client'].includes((typesById[p.type_id] || {}).categorie) && p.statut !== 'rejete';

/**
 * Points du réseau sans visite depuis au moins `seuil` jours (ou jamais visités), les plus en retard d'abord.
 * Renvoie [{ point, derniere, jours }] ; jours = null pour un point jamais visité.
 */
export function pointsAVisiter(points, typesById, resume, seuil, jour = aujourdhui()) {
  return points
    .filter((p) => aSuivre(p, typesById))
    .map((p) => {
      const r = resume[p.id];
      const derniere = r ? r.derniere_visite : null;
      return { point: p, derniere, jours: derniere ? joursEntre(derniere, jour) : null, resume: r || null };
    })
    .filter((x) => x.jours == null || x.jours >= seuil)
    .sort((a, b) => (a.jours == null ? -1 : b.jours == null ? 1 : b.jours - a.jours) || a.point.nom.localeCompare(b.point.nom, 'fr'));
}

/** Chiffres des `jours` derniers jours : visites, commandes, taux, montant commandé, points vus. */
export function bilanVisites(visites, jours = 30, jour = aujourdhui()) {
  const recentes = visites.filter((v) => joursEntre(v.date_visite, jour) < jours);
  const commandes = recentes.filter((v) => v.resultat === 'commande');
  return {
    visites: recentes.length,
    commandes: commandes.length,
    taux: recentes.length ? commandes.length / recentes.length : null,
    montant: commandes.reduce((s, v) => s + (Number(v.montant_commande) || 0), 0),
    points: new Set(recentes.map((v) => v.point_id)).size,
  };
}

/** Point visitable le plus proche d'une position, à moins de `maxM` mètres : { point, distance } ou null. */
export function pointLePlusProche(points, typesById, lat, lng, maxM = 300) {
  let best = null;
  points.forEach((p) => {
    if (!visitable(p, typesById)) return;
    const dLat = ((p.latitude - lat) * Math.PI) / 180;
    const dLng = ((p.longitude - lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((p.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const d = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d <= maxM && (!best || d < best.distance)) best = { point: p, distance: Math.round(d) };
  });
  return best;
}

/** Message clair quand la table n'existe pas encore (script visites.sql pas lancé). */
export function erreurVisites(error) {
  if (!error) return null;
  return /visites/i.test(error.message || '') && /exist|schema cache|not find/i.test(error.message || '')
    ? 'Journal des visites pas encore activé : exécutez le script visites.sql dans Supabase.'
    : error.message;
}
