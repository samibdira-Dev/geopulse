// Rentabilité d'un futur point de vente : du CA estimé au résultat d'exploitation.
// Paramètres d'exploitation saisis par l'administrateur pour chaque type de point (colonne types_point.exploitation),
// loyer et investissement saisis pour le site étudié.

// Champs de types_point.exploitation : clé, libellé, unité, valeur par défaut de la montée en charge.
export const PARAMS_EXPLOITATION = [
  { cle: 'marge_brute_pct', libelle: 'Taux de marge brute', unite: '% du CA' },
  { cle: 'salaires_m2', libelle: 'Masse salariale', unite: 'TND/m²/mois' },
  { cle: 'charges_fixes', libelle: 'Autres charges fixes (énergie, sécurité…)', unite: 'TND/mois' },
  { cle: 'redevance_pct', libelle: 'Redevance franchise ou gérance', unite: '% du CA' },
  { cle: 'taux_effort_max_pct', libelle: 'Taux d’effort maximal (loyer ÷ CA)', unite: '%' },
  { cle: 'montee_m1_pct', libelle: 'CA du 1er mois', unite: '% du CA de croisière', defaut: 60 },
  { cle: 'montee_m6_pct', libelle: 'CA du 6e mois', unite: '% du CA de croisière', defaut: 85 },
];

const nombre = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// Paramètres utilisables d'un type (null si la marge brute n'est pas renseignée).
export function parametresDuType(type) {
  const e = (type && type.exploitation) || {};
  const marge = nombre(e.marge_brute_pct);
  if (marge == null || marge <= 0) return null;
  return {
    marge: marge / 100,
    salairesM2: nombre(e.salaires_m2) || 0,
    chargesFixes: nombre(e.charges_fixes) || 0,
    redevance: (nombre(e.redevance_pct) || 0) / 100,
    tauxEffortMax: nombre(e.taux_effort_max_pct) != null ? nombre(e.taux_effort_max_pct) / 100 : null,
    montee1: (nombre(e.montee_m1_pct) ?? 60) / 100,
    montee6: (nombre(e.montee_m6_pct) ?? 85) / 100,
  };
}

// Part du CA de croisière atteinte au mois m (1 = premier mois) : interpolation 1er → 6e → 12e mois (100 %).
export function monteeEnCharge(m, p) {
  if (m >= 12) return 1;
  if (m <= 1) return p.montee1;
  if (m <= 6) return p.montee1 + ((p.montee6 - p.montee1) * (m - 1)) / 5;
  return p.montee6 + ((1 - p.montee6) * (m - 6)) / 6;
}

const MOIS_MAX = 120;

/**
 * Compte d'exploitation mensuel en croisière et indices de décision.
 * p : parametresDuType() ; ca : CA mensuel estimé ; surface : m² ; loyer, investissement : TND ;
 * caBas : bas de la fourchette (facultatif) ; transfert : CA pris aux points voisins (facultatif).
 */
export function calculerRentabilite({ p, ca, surface, loyer, investissement, caBas = null, transfert = null }) {
  if (!p || !(ca > 0)) return null;
  const salaires = p.salairesM2 * (surface || 0);
  const fixes = (loyer || 0) + salaires + p.chargesFixes;
  const ebitdaA = (c) => c * (p.marge - p.redevance) - fixes;
  const ebitda = ebitdaA(ca);
  const tauxContribution = p.marge - p.redevance;
  const pointMort = tauxContribution > 0 ? fixes / tauxContribution : null;
  // Délai de retour : mois où le résultat cumulé (avec la montée en charge) couvre l'investissement.
  let delai = null;
  if (investissement > 0) {
    let cumul = 0;
    for (let m = 1; m <= MOIS_MAX; m++) {
      cumul += ebitdaA(ca * monteeEnCharge(m, p));
      if (cumul >= investissement) { delai = m; break; }
    }
  }
  return {
    marge: ca * p.marge,
    redevance: ca * p.redevance,
    loyer: loyer || 0,
    salaires,
    chargesFixes: p.chargesFixes,
    ebitda,
    pointMort,
    margeSecurite: pointMort != null ? (ca - pointMort) / ca : null,
    delai,
    delaiDepasse: investissement > 0 && delai == null,
    tauxEffort: loyer > 0 ? loyer / ca : null,
    tauxEffortMax: p.tauxEffortMax,
    ebitdaBas: caBas != null ? ebitdaA(caBas) : null,
    // Gain pour le réseau : résultat du point moins la marge perdue sur les ventes prises à vos points voisins.
    gainReseau: transfert != null ? ebitda - transfert * (p.marge - p.redevance) : null,
  };
}
