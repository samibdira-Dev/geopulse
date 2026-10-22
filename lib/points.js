// Constantes et fonctions utilitaires pour les points, les statuts et les rôles.

export const STATUTS = {
  brouillon: { label: 'Brouillon', color: '#475569', bg: '#e2e8f0' },
  a_valider: { label: 'À valider', color: '#b45309', bg: '#fef3c7' },
  valide: { label: 'Validé', color: '#15803d', bg: '#dcfce7' },
  rejete: { label: 'Rejeté', color: '#b91c1c', bg: '#fee2e2' },
};

export const ROLES = {
  admin: 'Administrateur',
  manager: 'Manager',
  commercial: 'Commercial',
};

export function isManagerRole(role) {
  return role === 'admin' || role === 'manager';
}

// Un manager modifie tout ; un commercial ne modifie que ses points en brouillon ou rejetés.
export function peutModifier(point, role, userId) {
  if (isManagerRole(role)) return true;
  return point.cree_par === userId && ['brouillon', 'rejete'].includes(point.statut);
}

export function champsDuType(champs, typeId) {
  return champs.filter((c) => c.type_id === typeId).sort((a, b) => a.ordre - b.ordre);
}

// Champ « code_externe » d'un type : ce n'est pas un champ libre mais le code ERP du point (colonne code_externe,
// celle qui relie les ventes importées). Il en donne le libellé (ex. « Code magasin (ERP) ») et le rend obligatoire.
export const CLE_CODE_ERP = 'code_externe';
export const champCodeErp = (champsType) => champsType.find((c) => c.cle === CLE_CODE_ERP) || null;
export const champsLibres = (champsType) => champsType.filter((c) => c.cle !== CLE_CODE_ERP);
// Valeur d'un champ pour un point (le code ERP vient de sa colonne, les autres de donnees).
export const valeurChamp = (p, c) => (c.cle === CLE_CODE_ERP ? p.code_externe : (p.donnees || {})[c.cle]);

// Prépare les valeurs saisies : ne garde que les champs du type, convertit les nombres
// et les oui/non, supprime les valeurs vides.
export function nettoyerDonnees(champsType, donnees) {
  const out = {};
  champsType.forEach((c) => {
    let v = donnees ? donnees[c.cle] : undefined;
    if (v === undefined || v === null) return;
    if (typeof v === 'string') v = v.trim();
    if (v === '') return;
    if (c.type_champ === 'nombre') {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n)) return;
      v = n;
    } else if (c.type_champ === 'oui_non') {
      if (v === 'true' || v === true) v = true;
      else if (v === 'false' || v === false) v = false;
      else return;
    }
    out[c.cle] = v;
  });
  return out;
}

// Libellés des champs obligatoires qui ne sont pas renseignés.
export function champsManquants(champsType, donnees) {
  const propres = nettoyerDonnees(champsType, donnees);
  return champsType
    .filter((c) => c.obligatoire && propres[c.cle] === undefined)
    .map((c) => c.libelle);
}

// Messages d'erreur lisibles (les règles de la base renvoient déjà des messages en français).
export function traduireErreur(error) {
  const msg = (error && error.message) || String(error || '');
  if (/row-level security|permission denied/i.test(msg)) {
    return 'Action non autorisée pour votre rôle ou pour ce statut.';
  }
  if (/points_latitude_check|points_longitude_check/i.test(msg)) {
    return 'La position est en dehors de la Tunisie.';
  }
  if (/exploitation/i.test(msg) && /column|schema cache/i.test(msg)) {
    return 'Paramètres d’exploitation pas encore activés : exécutez le script exploitation.sql dans Supabase.';
  }
  if (/duplicate key/i.test(msg)) {
    return 'Cet élément existe déjà.';
  }
  if (/Invalid login credentials/i.test(msg)) {
    return 'E-mail ou mot de passe incorrect.';
  }
  if (/Email not confirmed/i.test(msg)) {
    return 'Adresse e-mail non confirmée : ouvrez le message de confirmation reçu par e-mail.';
  }
  if (/User already registered/i.test(msg)) {
    return 'Un compte existe déjà avec cet e-mail : connectez-vous.';
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return 'Connexion impossible : vérifiez votre accès Internet.';
  }
  return msg;
}

// Charge toutes les lignes d'une requête Supabase, par pages : le serveur en renvoie au plus 1 000 à la fois.
// `requete` construit la requête (avec un tri stable) ; renvoie { data, error } comme Supabase.
export async function chargerTout(requete, pas = 1000, maximum = 100000) {
  let tout = [];
  for (let de = 0; de < maximum; de += pas) {
    const { data, error } = await requete().range(de, de + pas - 1);
    if (error) return { data: null, error };
    tout = tout.concat(data || []);
    if (!data || data.length < pas) break;
  }
  return { data: tout, error: null };
}
