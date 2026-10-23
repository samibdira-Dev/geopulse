// Grandes surfaces des enseignes nationales (Carrefour, Monoprix, Magasin Général, Géant, Aziza), repérées dans les lieux
// d'Overture Maps Foundation (octobre 2026). Fichier public/grandes-surfaces-tn.json : enseignes (clé -> libellé) et
// points [enseigne, format, lat, lng, nom]. Un administrateur peut les ajouter à la carte de sa société comme concurrents.

export const NOM_TYPE_GS = 'Grandes surfaces (détectées)';
const RAYON_DOUBLON_KM = 0.15;

// Noms sous lesquels une enseigne peut déjà figurer dans les points de la société.
const NOMS = {
  carrefour: /carrefour|كارفور/i,
  monoprix: /monoprix|مونوبري/i,
  mg: /magasin\s*g[ée]n[ée]ral|\bmg\b|المغازة العامة/i,
  geant: /g[ée]ant|جيان/i,
  aziza: /aziza|عزيزة/i,
};

let chargement = null;
export function chargerGrandesSurfaces() {
  if (!chargement) {
    chargement = fetch('/grandes-surfaces-tn.json')
      .then((r) => {
        if (!r.ok) throw new Error('Grandes surfaces introuvables (HTTP ' + r.status + ')');
        return r.json();
      })
      .catch((e) => {
        chargement = null;
        throw e;
      });
  }
  return chargement;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const dy = (lat2 - lat1) * 110.574;
  const dx = (lng2 - lng1) * 111.32 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * Grandes surfaces des enseignes choisies qui ne sont pas encore sur la carte : aucun point de la société de la même
 * enseigne (par son nom ou sa fiche) à moins de 150 m.
 */
export function nouvellesGrandesSurfaces(donnees, points, enseignes) {
  const proches = (lat, lng) => points.filter((p) => Math.abs(p.latitude - lat) < 0.002 && Math.abs(p.longitude - lng) < 0.002
    && distanceKm(lat, lng, p.latitude, p.longitude) < RAYON_DOUBLON_KM);
  return donnees.points.filter(([e, , lat, lng]) => enseignes.includes(e)
    && !proches(lat, lng).some((p) => NOMS[e].test(p.nom || '') || ((p.donnees || {}).enseigne === donnees.enseignes[e])));
}
