// Saisonnalité des ventes : effet du ramadan, des deux Aïd, de l'été et de la rentrée sur le CA mensuel,
// profil par mois de l'année et prévision des 12 prochains mois. Fonctions pures.
//
// Méthode : on retire d'abord la tendance (régression du log du CA par point actif sur le temps), puis on mesure
// l'écart moyen à la tendance des mois touchés par chaque période. Le ramadan avance d'environ 11 jours par an :
// le mesurer comme un événement (et non comme « mars ») permet de le replacer correctement dans la prévision.

// Dates en Tunisie (premier jour du ramadan, Aïd el-Fitr, Aïd el-Adha). Une date peut varier d'un jour selon
// l'observation de la lune.
export const CALENDRIER_HEGIRIEN = {
  2017: ['2017-05-27', '2017-06-25', '2017-09-01'],
  2018: ['2018-05-17', '2018-06-15', '2018-08-21'],
  2019: ['2019-05-06', '2019-06-04', '2019-08-11'],
  2020: ['2020-04-24', '2020-05-24', '2020-07-31'],
  2021: ['2021-04-13', '2021-05-13', '2021-07-20'],
  2022: ['2022-04-02', '2022-05-02', '2022-07-09'],
  2023: ['2023-03-23', '2023-04-21', '2023-06-28'],
  2024: ['2024-03-11', '2024-04-10', '2024-06-16'],
  2025: ['2025-03-01', '2025-03-30', '2025-06-06'],
  2026: ['2026-02-18', '2026-03-20', '2026-05-27'],
  2027: ['2027-02-08', '2027-03-10', '2027-05-16'],
  2028: ['2028-01-28', '2028-02-26', '2028-05-05'],
  2029: ['2029-01-16', '2029-02-14', '2029-04-24'],
  2030: ['2030-01-06', '2030-02-05', '2030-04-13'],
};

export const PERIODES = {
  ramadan: { label: 'Ramadan et Aïd el-Fitr', court: 'Ramadan', couleur: '#7c3aed' },
  aid_adha: { label: 'Aïd el-Adha', court: 'Aïd el-Adha', couleur: '#b45309' },
  ete: { label: 'Été (juillet et août)', court: 'Été', couleur: '#0891b2' },
  rentree: { label: 'Rentrée (septembre)', court: 'Rentrée', couleur: '#db2777' },
};

export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const JOUR = 24 * 3600 * 1000;
const t = (d) => Date.parse(d + 'T00:00:00Z');
const joursDuMois = (an, m) => new Date(Date.UTC(an, m + 1, 0)).getUTCDate();

// Jours d'un intervalle [debut, fin[ tombant dans le mois (an, m).
function chevauchement(an, m, debut, fin) {
  const a = Math.max(Date.UTC(an, m, 1), debut);
  const b = Math.min(Date.UTC(an, m + 1, 1), fin);
  return Math.max(0, Math.round((b - a) / JOUR));
}

/** Part (0 à 1) de chaque période dans un mois « AAAA-MM-01 ». */
export function partsDuMois(periode) {
  const an = Number(periode.slice(0, 4));
  const m = Number(periode.slice(5, 7)) - 1;
  const n = joursDuMois(an, m);
  const parts = { ramadan: 0, aid_adha: 0, ete: m === 6 || m === 7 ? 1 : 0, rentree: m === 8 ? 1 : 0 };
  [an - 1, an, an + 1].forEach((y) => {
    const c = CALENDRIER_HEGIRIEN[y];
    if (!c) return;
    // Ramadan et les 3 jours de l'Aïd el-Fitr ; Aïd el-Adha : la semaine des achats (5 jours avant) et 3 jours de fête.
    parts.ramadan += chevauchement(an, m, t(c[0]), t(c[1]) + 3 * JOUR) / n;
    parts.aid_adha += chevauchement(an, m, t(c[2]) - 5 * JOUR, t(c[2]) + 3 * JOUR) / 8;
  });
  parts.ramadan = Math.min(1, parts.ramadan);
  parts.aid_adha = Math.min(1, parts.aid_adha);
  return parts;
}

const moisSuivant = (p, k = 1) => {
  const d = new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1 + k, 1));
  return d.toISOString().slice(0, 10);
};

// Moindres carrés : y = X·b (petites matrices, élimination de Gauss).
function regression(X, y) {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  X.forEach((x, i) => {
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += x[a] * x[b];
      A[a][k] += x[a] * y[i];
    }
  });
  for (let a = 0; a < k; a++) A[a][a] += 1e-9;
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row, i) => row[k] / row[i]);
}

/**
 * Analyse une série mensuelle [{ periode: 'AAAA-MM-01', montant, points? }] (ordre quelconque).
 * Renvoie null s'il y a moins de 12 mois, sinon :
 *   serie : mois triés avec tendance et parts des périodes ;
 *   effets : { cle: { effet (ex. 0.12 = +12 %), mois (nombre de mois touchés), fiable } } ;
 *   profil : 12 indices par mois de l'année (1 = mois moyen) ;
 *   prevision : 12 prochains mois { periode, montant, parts } ;
 *   croissance : croissance annuelle de la tendance (ex. 0.05).
 * Le CA est ramené par point actif quand le nombre de points est connu, pour ne pas confondre une ouverture
 * de magasins avec une saison.
 */
export function analyserSaisons(mensuel) {
  const serie = (mensuel || [])
    .filter((m) => m && m.periode && Number(m.montant) > 0)
    .map((m) => ({ periode: String(m.periode).slice(0, 7) + '-01', montant: Number(m.montant), points: Number(m.points) || null }))
    .sort((a, b) => (a.periode < b.periode ? -1 : 1));
  if (serie.length < 12) return null;
  const parPoint = serie.every((m) => m.points > 0);
  const t0 = serie[0].periode;
  const rang = (p) => (Number(p.slice(0, 4)) - Number(t0.slice(0, 4))) * 12 + Number(p.slice(5, 7)) - Number(t0.slice(5, 7));
  const cles = Object.keys(PERIODES);
  serie.forEach((m) => {
    m.rang = rang(m.periode);
    m.parts = partsDuMois(m.periode);
    m.niveau = parPoint ? m.montant / m.points : m.montant;
  });
  // log(niveau) = a + b·t + Σ effet_k · part_k : tendance et périodes estimées ensemble.
  // Avec moins de deux ans, on n'estime que les périodes vues au moins deux fois (sinon l'effet se confond avec le mois).
  const vues = cles.filter((k) => serie.filter((m) => m.parts[k] >= 0.3).length >= (serie.length >= 24 ? 2 : 1));
  const X = serie.map((m) => [1, m.rang, ...vues.map((k) => m.parts[k])]);
  const b = regression(X, serie.map((m) => Math.log(m.niveau)));
  if (!b) return null;
  const effets = {};
  cles.forEach((k) => {
    const i = vues.indexOf(k);
    const n = serie.filter((m) => m.parts[k] >= 0.3).length;
    effets[k] = i < 0 ? { effet: null, mois: n, fiable: false } : { effet: Math.exp(b[2 + i]) - 1, mois: n, fiable: n >= 2 && serie.length >= 24 };
  });
  const tendance = (r) => Math.exp(b[0] + b[1] * r);
  const facteur = (parts) => Math.exp(vues.reduce((s, k, i) => s + b[2 + i] * parts[k], 0));
  serie.forEach((m) => {
    m.tendance = tendance(m.rang) * (parPoint ? m.points : 1);
    m.ajuste = m.tendance * facteur(m.parts);
    m.ecart = m.montant / m.tendance - 1;
  });
  // Profil : écart moyen à la tendance pour chaque mois de l'année.
  const somme = new Array(12).fill(0);
  const nb = new Array(12).fill(0);
  serie.forEach((m) => {
    const k = Number(m.periode.slice(5, 7)) - 1;
    somme[k] += m.montant / m.tendance;
    nb[k] += 1;
  });
  const profil = somme.map((s, k) => (nb[k] ? s / nb[k] : null));
  // Prévision : tendance prolongée × effet des périodes du mois, avec le dernier nombre de points.
  const dernier = serie[serie.length - 1];
  const prevision = [];
  for (let k = 1; k <= 12; k++) {
    const p = moisSuivant(dernier.periode, k);
    const parts = partsDuMois(p);
    prevision.push({ periode: p, parts, montant: tendance(dernier.rang + k) * (parPoint ? dernier.points : 1) * facteur(parts) });
  }
  // Qualité : erreur moyenne du modèle sur les mois connus.
  const erreur = serie.reduce((s, m) => s + Math.abs(m.montant / m.ajuste - 1), 0) / serie.length;
  return { serie, effets, profil, prevision, croissance: Math.exp(12 * b[1]) - 1, erreur, parPoint };
}

/** Période dominante d'un mois (part ≥ 30 %), pour l'étiquette du graphique. */
export function periodeDominante(parts) {
  let best = null;
  Object.keys(PERIODES).forEach((k) => {
    if (parts[k] >= 0.3 && (!best || parts[k] > parts[best])) best = k;
  });
  return best;
}

/** Libellé « mars 2026 ». */
export function libelleMois(periode) {
  return MOIS_COURTS[Number(periode.slice(5, 7)) - 1] + ' ' + periode.slice(0, 4);
}
