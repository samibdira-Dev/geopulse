// Invitations des membres (côté serveur) : l'administrateur crée le compte du membre avec un code d'accès qui sert de
// mot de passe, et retrouve ce code dans l'onglet Équipe. Le code n'est jamais écrit dans le journal.

import { randomInt } from 'crypto';

export const ROLES_INVITATION = ['admin', 'manager', 'commercial'];
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/I/L, faciles à confondre

// Code d'accès de 10 caractères, groupés par 5 pour la lecture (ex. K7MPQ-4XRT9).
export function genererCode() {
  let c = '';
  for (let i = 0; i < 10; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c.slice(0, 5) + '-' + c.slice(5);
}

const erreur = (statut, message) => ({ statut, corps: { erreur: message } });
const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const dejaInscrit = (err) => err && (err.code === 'email_exists' || /already (been )?registered|already exists/i.test(err.message || ''));

/**
 * Traite une demande de l'onglet Équipe.
 * admin : client Supabase avec la clé de service ; commeAppelant : client qui agit avec le jeton de l'administrateur
 * (les règles de la base s'appliquent) ; jeton : jeton de session de l'appelant ; corps : { action, societe_id, … }.
 * Renvoie { statut, corps }.
 */
export async function traiterInvitation({ admin, commeAppelant, jeton, corps }) {
  if (!jeton) return erreur(401, 'Session expirée : reconnectez-vous.');
  const { data: lu, error: errUser } = await admin.auth.getUser(jeton);
  const appelant = lu && lu.user;
  if (errUser || !appelant) return erreur(401, 'Session expirée : reconnectez-vous.');

  const societe = corps && corps.societe_id != null ? String(corps.societe_id) : '';
  if (!societe) return erreur(400, 'Société manquante.');
  const { data: moi } = await admin.from('membres').select('role').eq('societe_id', societe).eq('user_id', appelant.id).maybeSingle();
  if (!moi || moi.role !== 'admin') return erreur(403, 'Seul un administrateur de la société peut inviter des membres.');

  const { data: soc } = await admin.from('societes').select('statut').eq('id', societe).maybeSingle();
  if (soc && soc.statut && soc.statut !== 'active') return erreur(403, 'Votre société n’est pas encore activée par GeoPulse : les invitations seront possibles après la validation.');

  const table = await admin.from('invitations').select('email').limit(1);
  if (table.error) return erreur(503, 'Invitations pas encore activées : exécutez le script equipe-journal.sql dans Supabase.');

  const email = String(corps.email || '').trim().toLowerCase();
  if (!emailValide(email)) return erreur(400, 'Adresse e-mail invalide.');
  const journal = (action, objetId, libelle, changements) => admin.from('journal').insert({
    societe_id: societe, auteur: appelant.id, auteur_email: appelant.email || null,
    action, objet: 'membre', objet_id: objetId, libelle, changements,
  });

  if (corps.action === 'inviter') {
    const role = corps.role;
    if (!ROLES_INVITATION.includes(role)) return erreur(400, 'Rôle inconnu.');
    const nom = String(corps.nom_affiche || '').trim() || null;

    // 1) Compte de connexion : créé avec le code comme mot de passe, ou déjà existant (il garde son mot de passe).
    let code = genererCode();
    let nouveauId = null;
    const cree = await admin.auth.admin.createUser({ email, password: code, email_confirm: true, user_metadata: { nom_affiche: nom } });
    if (cree.error) {
      if (!dejaInscrit(cree.error)) return erreur(500, 'Création du compte impossible : ' + cree.error.message);
      code = null;
    } else {
      nouveauId = cree.data.user.id;
    }

    // 2) Ajout à la société avec les règles habituelles (fonction ajouter_membre, au nom de l'administrateur).
    const ajout = await commeAppelant.rpc('ajouter_membre', { p_societe: corps.societe_id, p_email: email, p_role: role, p_nom_affiche: nom });
    if (ajout.error) {
      if (nouveauId) await admin.auth.admin.deleteUser(nouveauId);
      return erreur(400, ajout.error.message);
    }

    // 3) L'administrateur garde l'e-mail et le code dans l'onglet Équipe.
    // Compte déjà existant : on ne garde ni code ni identifiant (son mot de passe reste le sien).
    const ligne = { societe_id: societe, email, nom_affiche: nom, role, cree_par: appelant.id, modifie_le: new Date().toISOString() };
    if (code) { ligne.code = code; ligne.user_id = nouveauId; }
    const sauve = await admin.from('invitations').upsert(ligne, { onConflict: 'societe_id,email' });
    if (sauve.error) return erreur(500, 'Membre ajouté, mais le code n’a pas pu être enregistré : ' + sauve.error.message);
    await journal('invitation', nouveauId, nom || email, { email, role, compte_existant: !code });
    return { statut: 200, corps: { email, code, existant: !code } };
  }

  if (corps.action === 'nouveau_code') {
    // Seulement pour un compte créé par une invitation de cette société, et toujours membre.
    const { data: inv } = await admin.from('invitations').select('user_id, nom_affiche').eq('societe_id', societe).eq('email', email).maybeSingle();
    if (!inv || !inv.user_id) return erreur(404, 'Ce membre a créé son compte lui-même : il garde son mot de passe.');
    const { data: encore } = await admin.from('membres').select('user_id').eq('societe_id', societe).eq('user_id', inv.user_id).maybeSingle();
    if (!encore) return erreur(404, 'Cette personne n’est plus membre de la société.');
    const code = genererCode();
    const maj = await admin.auth.admin.updateUserById(inv.user_id, { password: code });
    if (maj.error) return erreur(500, 'Changement du code impossible : ' + maj.error.message);
    await admin.from('invitations').update({ code, modifie_le: new Date().toISOString() }).eq('societe_id', societe).eq('email', email);
    await journal('code', inv.user_id, inv.nom_affiche || email, { email });
    return { statut: 200, corps: { email, code, existant: false } };
  }

  return erreur(400, 'Action inconnue.');
}
