import { CLE_CODE_ERP, champsDuType, champsManquants } from './points';
import { normaliserCode, versNombre } from './ventes';
import { dansTunisie } from './geo';
import { delegationEn } from './recensement';

// Import des points depuis un fichier Excel ou CSV : nom, coordonnées, code ERP, adresse et champs du type
// (loyer, surface, nombre de références, marge…). Un point dont le code ERP existe déjà est mis à jour, les autres
// sont créés. Fonctions pures, sans réseau : la lecture du fichier est lib/ventes.js lireFichier.

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const compact = (s) => sansAccents(s).replace(/[^a-z0-9]/g, '');

// Colonnes de base, avec les en-têtes reconnus.
export const COLONNES_BASE = [
  ['nom', 'Nom *', [/^nom/, /^name/, /enseigne/, /raison sociale/, /^magasin$/, /^point/, /designation/, /libelle/]],
  ['latitude', 'Latitude', [/^lat/]],
  ['longitude', 'Longitude', [/^lon/, /^lng/]],
  ['coordonnees', 'Coordonnées « lat, lng »', [/coordonn/, /^gps/, /position/, /^coord/]],
  ['code', 'Code ERP', [/code.*(client|erp|magasin|point)/, /^code$/, /matricule/, /^ref/, /^id$/]],
  ['type', 'Type de point', [/^type/, /categorie/, /nature du point/]],
  ['adresse', 'Adresse', [/adresse/, /address/, /^rue/]],
  ['gouvernorat', 'Gouvernorat', [/gouvernorat/, /^gouv/, /^region/, /wilaya/]],
  ['delegation', 'Délégation', [/delegation/, /^ville/, /^localite/, /^commune/]],
];

/** Devine les colonnes du fichier : { nom: indice, …, champs: { cle: indice } } (-1 = absente). */
export function devinerColonnesPoints(entetes, champsType = []) {
  const pris = new Set();
  const cherche = (motifs) => {
    const i = entetes.findIndex((e, k) => !pris.has(k) && motifs.some((m) => m.test(sansAccents(e))));
    if (i >= 0) pris.add(i);
    return i;
  };
  const out = { champs: {} };
  // Les champs du type d'abord, sur leur libellé exact (« Code magasin », « Surface (m²) »…).
  champsType.forEach((c) => {
    const i = entetes.findIndex((e, k) => !pris.has(k) && (compact(e) === compact(c.libelle) || compact(e) === compact(c.cle)));
    if (i >= 0) pris.add(i);
    out.champs[c.cle] = i;
  });
  COLONNES_BASE.forEach(([cle, , motifs]) => {
    if (cle === 'code' && out.champs[CLE_CODE_ERP] >= 0) { out.code = out.champs[CLE_CODE_ERP]; return; }
    out[cle] = cherche(motifs);
  });
  return out;
}

const nombreCoord = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/** Coordonnées { lat, lng } depuis deux colonnes ou une colonne « 36.8065, 10.1815 » ; inversées si besoin. null sinon. */
export function versCoordonnees(latV, lngV, coordV) {
  let lat = nombreCoord(latV);
  let lng = nombreCoord(lngV);
  if ((lat == null || lng == null) && coordV != null && coordV !== '') {
    const m = String(coordV).match(/(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)/);
    if (m) { lat = Number(m[1].replace(',', '.')); lng = Number(m[2].replace(',', '.')); }
  }
  if (lat == null || lng == null) return null;
  if (!dansTunisie(lat, lng) && dansTunisie(lng, lat)) [lat, lng] = [lng, lat];
  return dansTunisie(lat, lng) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null;
}

/** Valeur d'un champ du type convertie selon son genre : { valeur } ou { erreur }. Vide = { valeur: undefined }. */
export function convertirChamp(champ, v) {
  if (v == null || String(v).trim() === '') return { valeur: undefined };
  switch (champ.type_champ) {
    case 'nombre': {
      const n = versNombre(v);
      return n == null ? { erreur: `« ${v} » n’est pas un nombre (${champ.libelle})` } : { valeur: n };
    }
    case 'oui_non': {
      const s = sansAccents(v);
      if (v === true || /^(oui|o|yes|y|1|vrai|true|x)$/.test(s)) return { valeur: true };
      if (v === false || /^(non|n|no|0|faux|false)$/.test(s)) return { valeur: false };
      return { erreur: `« ${v} » : répondez oui ou non (${champ.libelle})` };
    }
    case 'liste': {
      const options = Array.isArray(champ.options) ? champ.options : [];
      const o = options.find((x) => sansAccents(x) === sansAccents(v));
      return o ? { valeur: o } : { erreur: `« ${v} » ne fait pas partie des choix de ${champ.libelle} (${options.join(', ')})` };
    }
    case 'date': {
      if (v instanceof Date && !Number.isNaN(v.getTime())) return { valeur: new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10) };
      const s = String(v).trim();
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return { valeur: `${m[1]}-${m[2]}-${m[3]}` };
      m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
      if (m) return { valeur: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` };
      return { erreur: `« ${v} » n’est pas une date (${champ.libelle})` };
    }
    default:
      return { valeur: String(v).trim() };
  }
}

/**
 * Prépare l'import. Renvoie { creations: [ligne à insérer], majs: [{ id, nom, patch }], erreurs: [{ ligne, raison }],
 * brouillons } : création seulement avec un nom et des coordonnées en Tunisie ; mise à jour quand le code ERP existe.
 * La ligne du fichier est numérotée comme dans Excel (en-tête en ligne 1).
 */
export function preparerImportPoints({ lignes, colonnes, types, champs, points, typeParDefaut, delegations = null, statutComplet = 'valide' }) {
  const parCode = new Map();
  points.forEach((p) => { if (p.code_externe) parCode.set(normaliserCode(p.code_externe), p); });
  const typesParNom = new Map(types.map((t) => [compact(t.nom), t]));
  const cellule = (l, i) => (i == null || i < 0 ? null : l[i]);
  const texte = (l, i) => {
    const v = cellule(l, i);
    return v == null || String(v).trim() === '' ? null : String(v).trim();
  };
  const creations = [];
  const majs = [];
  const erreurs = [];
  const codesVus = new Set();
  let brouillons = 0;

  lignes.forEach((l, k) => {
    const numero = k + 2;
    if (!l || l.every((c) => c == null || String(c).trim() === '')) return;
    const nom = texte(l, colonnes.nom);
    const code = texte(l, colonnes.code);
    const nomType = texte(l, colonnes.type);
    const type = nomType ? typesParNom.get(compact(nomType)) : typeParDefaut;
    if (!type) {
      erreurs.push({ ligne: numero, raison: nomType ? `type « ${nomType} » inconnu` : 'type de point non choisi' });
      return;
    }
    if (code) {
      const c = normaliserCode(code);
      if (codesVus.has(c)) { erreurs.push({ ligne: numero, raison: `code ${code} en double dans le fichier` }); return; }
      codesVus.add(c);
    }
    const existant = code ? parCode.get(normaliserCode(code)) : null;
    const champsType = champsDuType(champs, existant ? existant.type_id : type.id);
    const donnees = {};
    const fautes = [];
    champsType.forEach((ch) => {
      if (ch.cle === CLE_CODE_ERP) return;
      const r = convertirChamp(ch, cellule(l, (colonnes.champs || {})[ch.cle]));
      if (r.erreur) fautes.push(r.erreur);
      else if (r.valeur !== undefined) donnees[ch.cle] = r.valeur;
    });
    if (fautes.length) { erreurs.push({ ligne: numero, raison: fautes.join(' ; ') }); return; }
    const coordsBrutes = [cellule(l, colonnes.latitude), cellule(l, colonnes.longitude), cellule(l, colonnes.coordonnees)];
    const position = versCoordonnees(...coordsBrutes);
    const coordsDonnees = coordsBrutes.some((v) => v != null && String(v).trim() !== '');
    if (coordsDonnees && !position) { erreurs.push({ ligne: numero, raison: 'coordonnées illisibles ou hors de Tunisie' }); return; }
    const adresse = texte(l, colonnes.adresse);
    const lieu = position ? delegationEn(delegations, position.lat, position.lng) : null;
    const gouvernorat = texte(l, colonnes.gouvernorat) || (lieu && lieu.gouvernorat) || null;
    const delegation = texte(l, colonnes.delegation) || (lieu && lieu.delegation) || null;
    const avecCodeChamp = champsType.some((ch) => ch.cle === CLE_CODE_ERP);

    if (existant) {
      const patch = { donnees: { ...(existant.donnees || {}), ...donnees } };
      if (nom) patch.nom = nom;
      if (position) {
        patch.latitude = position.lat;
        patch.longitude = position.lng;
        patch.source_position = 'import';
        patch.precision_m = null;
      }
      if (adresse) patch.adresse = adresse;
      if (texte(l, colonnes.gouvernorat) || (position && gouvernorat)) patch.gouvernorat = gouvernorat;
      if (texte(l, colonnes.delegation) || (position && delegation)) patch.delegation = delegation;
      majs.push({ id: existant.id, nom: nom || existant.nom, patch, ligne: numero });
      return;
    }
    if (!nom) { erreurs.push({ ligne: numero, raison: code ? `code ${code} inconnu et nom absent` : 'nom absent' }); return; }
    if (!position) { erreurs.push({ ligne: numero, raison: `${nom} : coordonnées absentes, impossible de le placer` }); return; }
    if (avecCodeChamp && code) donnees[CLE_CODE_ERP] = code;
    const complet = champsManquants(champsType, donnees).length === 0;
    if (!complet) brouillons++;
    creations.push({
      type_id: type.id,
      nom,
      latitude: position.lat,
      longitude: position.lng,
      gouvernorat,
      delegation,
      adresse,
      source_position: 'import',
      precision_m: null,
      donnees,
      statut: complet ? statutComplet : 'brouillon',
      ...(code ? { code_externe: code } : {}),
      ligne: numero,
    });
  });
  return { creations, majs, erreurs, brouillons };
}

/** En-têtes et ligne d'exemple du modèle Excel d'un type. */
export function modeleImport(type, champsType) {
  const libres = champsType.filter((c) => c.cle !== CLE_CODE_ERP);
  const code = champsType.find((c) => c.cle === CLE_CODE_ERP);
  const entetes = ['Nom', 'Latitude', 'Longitude', code ? code.libelle : 'Code ERP', 'Adresse', 'Gouvernorat', 'Délégation', ...libres.map((c) => c.libelle)];
  const exemple = [`${type.nom} Centre-ville`, 36.8065, 10.1815, 'MAG001', 'Avenue Habib Bourguiba', 'Tunis', 'Bab Bhar',
    ...libres.map((c) => (c.type_champ === 'nombre' ? '' : c.type_champ === 'oui_non' ? 'oui' : c.type_champ === 'liste' ? (c.options || [])[0] || '' : c.type_champ === 'date' ? '2026-01-15' : ''))];
  return [entetes, exemple];
}
