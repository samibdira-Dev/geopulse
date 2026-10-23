// Générateurs de trafic : lieux qui attirent du passage (gares et louages, marchés, grandes surfaces, universités,
// écoles, mosquées, santé, administrations, cafés). Source : Overture Maps Foundation, lieux (places), filtrés sur la
// Tunisie. Fichier public/generateurs-tn.json : classes (clé, libellé, poids), points [classe, lat, lng, nom] et
// répartition nationale de l'indice (centiles, sur les habitants des carrés de 250 m).

const PAS_SEAU = 0.01;
let chargement = null;

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// Prépare les données (index par carrés de 0,01°, ~1 km) : utilisable sans réseau, pour les tests.
export function preparerGenerateurs(donnees) {
  const seaux = new Map();
  donnees.points.forEach((p, i) => {
    const cle = Math.floor(p[1] / PAS_SEAU) * 10000 + Math.floor(p[2] / PAS_SEAU);
    if (!seaux.has(cle)) seaux.set(cle, []);
    seaux.get(cle).push(i);
  });
  return { ...donnees, seaux };
}

export function chargerGenerateurs() {
  if (!chargement) {
    chargement = fetch('/generateurs-tn.json')
      .then((r) => {
        if (!r.ok) throw new Error('Générateurs de trafic introuvables (HTTP ' + r.status + ')');
        return r.json();
      })
      .then(preparerGenerateurs)
      .catch((e) => {
        chargement = null;
        throw e;
      });
  }
  return chargement;
}

// Lieux à moins de rayonKm : [{ classe, lat, lng, nom, distance }], du plus proche au plus loin.
export function generateursDansRayon(g, lat, lng, rayonKm) {
  const n = Math.ceil(rayonKm / 1.1 / PAS_SEAU) + 1;
  const l0 = Math.floor(lat / PAS_SEAU);
  const c0 = Math.floor(lng / PAS_SEAU);
  const out = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const ids = g.seaux.get((l0 + i) * 10000 + c0 + j);
      if (!ids) continue;
      ids.forEach((k) => {
        const p = g.points[k];
        const d = distanceKm(lat, lng, p[1], p[2]);
        if (d <= rayonKm) out.push({ classe: p[0], lat: p[1], lng: p[2], nom: p[3], distance: d });
      });
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}

// Score de passage : somme des poids des lieux proches, atténués avec la distance (gaussienne, sigma 300 m, jusqu'à 600 m).
export function scorePassage(g, lat, lng) {
  return generateursDansRayon(g, lat, lng, g.rayonKm)
    .reduce((s, p) => s + g.classes[p.classe].poids * Math.exp(-((p.distance / g.sigmaKm) ** 2)), 0);
}

// Indice de 0 à 100 : part des habitants de Tunisie qui vivent dans un carré au score plus faible.
export function indiceNational(g, score) {
  const q = g.quantiles;
  if (!(score > 0)) return 0;
  let k = 0;
  while (k < 100 && q[k + 1] < score) k++;
  if (k >= 100) return 100;
  const bas = q[k];
  const haut = q[k + 1];
  return Math.min(100, Math.round(k + (haut > bas ? (score - bas) / (haut - bas) : 0)));
}

// Passage autour d'un site : score, indice national et lieux par classe ({ cle, libelle, n, plusProche }) à moins de rayonKm.
export function passageAutour(g, lat, lng, rayonKm = g.rayonKm) {
  const score = scorePassage(g, lat, lng);
  const proches = generateursDansRayon(g, lat, lng, rayonKm);
  const parClasse = g.classes
    .map((c, i) => {
      const liste = proches.filter((p) => p.classe === i);
      return { cle: c.cle, libelle: c.libelle, n: liste.length, plusProche: liste[0] || null };
    })
    .filter((c) => c.n > 0);
  return { score, indice: indiceNational(g, score), parClasse, proches };
}

// Libellé d'un indice national.
export function niveauPassage(indice) {
  if (indice >= 80) return 'Très fort';
  if (indice >= 60) return 'Fort';
  if (indice >= 40) return 'Moyen';
  if (indice >= 20) return 'Faible';
  return 'Très faible';
}

// Libellé d'une classe pour un seul lieu.
export const SINGULIERS = {
  transport: 'gare ou station de louages', marche: 'marché ou souk', grande_surface: 'grande surface', universite: 'université',
  ecole: 'école ou lycée', mosquee: 'mosquée', sante: 'hôpital ou clinique', administration: 'administration ou banque', cafe: 'café ou restaurant',
};

// Classes affichées quand on active la couche : toutes sauf les cafés, trop nombreux en ville.
export const CLASSES_PAR_DEFAUT = ['transport', 'marche', 'grande_surface', 'universite', 'ecole', 'mosquee', 'sante', 'administration'];

// Couleurs de la couche sur la carte, par classe.
export const COULEURS_GENERATEURS = {
  transport: '#0ea5e9',
  marche: '#f97316',
  grande_surface: '#e11d48',
  universite: '#6d28d9',
  ecole: '#c084fc',
  mosquee: '#059669',
  sante: '#dc2626',
  administration: '#475569',
  cafe: '#a16207',
};
