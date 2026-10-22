// Import des ventes depuis un fichier Excel ou CSV (export d'ERP) : lecture, choix des colonnes,
// conversion des dates et des montants, regroupement par client et par mois.

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Lit la première feuille du fichier : tableau de lignes (la première = en-têtes).
export async function lireFichier(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false, dateNF: 'yyyy-mm-dd' });
  const feuille = wb.Sheets[wb.SheetNames[0]];
  const lignes = XLSX.utils.sheet_to_json(feuille, { header: 1, raw: true, defval: null, blankrows: false });
  // En-têtes : première ligne qui contient au moins 2 cellules de texte.
  const debut = Math.max(0, lignes.findIndex((l) => l.filter((c) => typeof c === 'string' && c.trim()).length >= 2));
  const entetes = (lignes[debut] || []).map((c, i) => (c == null || c === '' ? `Colonne ${i + 1}` : String(c).trim()));
  return { entetes, lignes: lignes.slice(debut + 1) };
}

// Devine les colonnes à partir des en-têtes.
export function devinerColonnes(entetes) {
  const cherche = (motifs) => entetes.findIndex((e) => motifs.some((m) => m.test(sansAccents(e))));
  return {
    code: cherche([/code.*client/, /client.*code/, /^code/, /ref.*client/, /matricule/, /^client$/, /tiers/]),
    date: cherche([/date/, /periode/, /^mois/, /month/]),
    montant: cherche([/montant/, /\bca\b/, /chiffre/, /\bht\b/, /\bttc\b/, /total/, /vente/, /amount/]),
    quantite: cherche([/quantite/, /\bqte\b/, /\bqty\b/, /volume/]),
  };
}

const MOIS = { jan: 1, fev: 2, feb: 2, mar: 3, avr: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6, juil: 7, jul: 7, aou: 8, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Premier jour du mois (« AAAA-MM-01 ») d'une valeur de date, ou null.
export function versMois(v) {
  if (v == null || v === '') return null;
  const fmt = (a, m) => (a >= 1990 && a <= 2100 && m >= 1 && m <= 12 ? `${a}-${String(m).padStart(2, '0')}-01` : null);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // SheetJS crée les dates à minuit local : on ajoute 12 h pour ne pas basculer sur le mois précédent.
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return fmt(d.getFullYear(), d.getMonth() + 1);
  }
  if (typeof v === 'number') {
    if (v > 190000 && v < 210100) return fmt(Math.floor(v / 100), v % 100); // 202609
    if (v > 20000 && v < 80000) { // numéro de série Excel
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1);
    }
    return null;
  }
  const s = sansAccents(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/); // 2026-09, 2026-09-15
  if (m) return fmt(+m[1], +m[2]);
  m = s.match(/^\d{1,2}[-/.](\d{1,2})[-/.](\d{2,4})/); // 15/09/2026
  if (m) return fmt(m[2].length === 2 ? 2000 + +m[2] : +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/); // 09/2026
  if (m) return fmt(+m[2], +m[1]);
  m = s.match(/^(\d{4})(\d{2})$/); // 202609
  if (m) return fmt(+m[1], +m[2]);
  m = s.match(/^([a-z]+)\.?[\s\-/]*(\d{2,4})$/); // sept 2026, sep-26
  if (m) {
    const k = Object.keys(MOIS).find((x) => m[1].startsWith(x));
    if (k) return fmt(m[2].length === 2 ? 2000 + +m[2] : +m[2], MOIS[k]);
  }
  return null;
}

// Nombre depuis « 1 234,56 », « 1.234,56 », « 1,234.56 », « 1234.5 TND »…
export function versNombre(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  const virgule = s.lastIndexOf(',');
  const point = s.lastIndexOf('.');
  if (virgule > point) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const normaliserCode = (c) => String(c == null ? '' : c).trim().toLowerCase();

// Regroupe les lignes par point et par mois, en reliant le code client aux points.
export function preparerImport(lignes, colonnes, points) {
  const parCode = new Map();
  points.forEach((p) => { if (p.code_externe) parCode.set(normaliserCode(p.code_externe), p); });
  const groupes = new Map();
  const inconnus = new Map();
  let lignesLues = 0;
  let lignesRejetees = 0;
  lignes.forEach((l) => {
    const code = normaliserCode(l[colonnes.code]);
    const mois = versMois(l[colonnes.date]);
    const montant = versNombre(l[colonnes.montant]);
    const quantite = colonnes.quantite >= 0 ? versNombre(l[colonnes.quantite]) : null;
    if (!code && montant == null) return; // ligne vide ou de total
    lignesLues++;
    if (!code || !mois || montant == null) { lignesRejetees++; return; }
    const p = parCode.get(code);
    if (!p) {
      const brut = String(l[colonnes.code]).trim();
      const i = inconnus.get(brut) || { code: brut, lignes: 0, montant: 0 };
      i.lignes++; i.montant += montant;
      inconnus.set(brut, i);
      return;
    }
    const cle = p.id + '|' + mois;
    const g = groupes.get(cle) || { point_id: p.id, periode: mois, montant: 0, quantite: null };
    g.montant += montant;
    if (quantite != null) g.quantite = (g.quantite || 0) + quantite;
    groupes.set(cle, g);
  });
  const lignesVentes = [...groupes.values()].map((g) => ({ ...g, montant: Math.round(g.montant * 1000) / 1000 }));
  const periodes = lignesVentes.map((g) => g.periode).sort();
  return {
    lignesVentes,
    lignesLues,
    lignesRejetees,
    pointsReconnus: new Set(lignesVentes.map((g) => g.point_id)).size,
    inconnus: [...inconnus.values()].sort((a, b) => b.montant - a.montant),
    total: lignesVentes.reduce((s, g) => s + g.montant, 0),
    debut: periodes[0] || null,
    fin: periodes[periodes.length - 1] || null,
  };
}

// CA mensuel moyen d'un point sur les 12 derniers mois (synthèse ventes_resume), ou null.
export function caMensuelMoyen(resume) {
  return resume && resume.mois_12m > 0 ? Number(resume.ca_12m) / resume.mois_12m : null;
}

// Évolution sur un an (en fraction), si l'année précédente est connue.
export function evolution(resume) {
  if (!resume || !resume.ca_12m_precedents || Number(resume.ca_12m_precedents) <= 0) return null;
  return Number(resume.ca_12m) / Number(resume.ca_12m_precedents) - 1;
}
