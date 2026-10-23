// Abonnements : formules, échéance et paiements par virement (Flouci plus tard). Fonctions pures.
// Le montant d'un paiement est toujours calculé par la base (abonnement.sql) ; montantPrevu ne sert qu'à l'affichage.

export const STATUTS_PAIEMENT = {
  a_payer: { label: 'À payer', color: '#b45309', bg: '#fffbeb' },
  annonce: { label: 'Virement annoncé', color: '#4338ca', bg: '#eef0ff' },
  valide: { label: 'Payé', color: '#047857', bg: '#ecfdf5' },
  refuse: { label: 'Refusé', color: '#b91c1c', bg: '#fef2f2' },
  annule: { label: 'Annulé', color: '#475569', bg: '#f1f5f9' },
};

// Le bandeau de renouvellement apparaît 15 jours avant la fin.
export const PREAVIS_JOURS = 15;

const JOUR = 86400000;
const minuit = (d) => new Date(new Date(d).toDateString());

/** Jours restants jusqu'à la date de fin (incluse), ou null sans date. Négatif une fois la date passée. */
export function joursRestants(fin, aujourdhui = new Date()) {
  if (!fin) return null;
  return Math.round((minuit(fin + 'T00:00:00') - minuit(aujourdhui)) / JOUR);
}

/** État de l'abonnement : { cle: 'aucun' | 'actif' | 'bientot' | 'expire', jours }. */
export function etatAbonnement(fin, aujourdhui = new Date()) {
  const jours = joursRestants(fin, aujourdhui);
  if (jours == null) return { cle: 'aucun', jours: null };
  if (jours < 0) return { cle: 'expire', jours };
  if (jours <= PREAVIS_JOURS) return { cle: 'bientot', jours };
  return { cle: 'actif', jours };
}

/** Montant affiché pour une formule : mensuel, ou annuel avec les mois offerts. null si sur devis. */
export function montantPrevu(formule, periodicite, moisOfferts = 2) {
  if (!formule || formule.prix_mensuel == null) return null;
  const prix = Number(formule.prix_mensuel);
  return periodicite === 'annee' ? prix * (12 - Math.max(0, Math.min(11, moisOfferts))) : prix;
}

export const tnd = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 }) + ' TND');
export const dateFr = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

/** Message d'erreur lisible, y compris quand abonnement.sql n'a pas encore été lancé. */
export function erreurAbonnement(error) {
  const m = (error && error.message) || '';
  if (/abonnement_|formules|paiements|plateforme_parametres/.test(m) && /does not exist|schema cache|not find/i.test(m)) {
    return 'Les abonnements ne sont pas encore activés sur ce serveur (script abonnement.sql).';
  }
  return m || 'Erreur inconnue.';
}
