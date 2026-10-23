// Comparateur de sites : photo des résultats du simulateur pour chaque emplacement étudié, tableau comparatif,
// recommandation et rapport imprimable (PDF) pour le comité d'investissement. Fonctions pures, sauf ouvrirRapport.

export const MAX_SITES = 4;
const RAYON_CARTE_KM = 1.5;

const KM_LAT = 110.574;
const kmLng = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);
const ent = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('fr-FR'));
const pctTxt = (x, dec = 0) => (x == null || !Number.isFinite(x) ? '—' : `${(Math.round(x * 100 * 10 ** dec) / 10 ** dec).toLocaleString('fr-FR')} %`);
const kTxt = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 1000 ? `${(Math.round(n / 100) / 10).toLocaleString('fr-FR')} k` : String(Math.round(n)));
const kmTxt = (d) => (d == null ? '—' : d < 1 ? `${Math.round(d * 1000)} m` : `${(Math.round(d * 10) / 10).toLocaleString('fr-FR')} km`);
const echapper = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Photo d'un site à partir des valeurs calculées par le simulateur. */
export function instantane(v) {
  const { position, zoneLibelle, res, caCentral, plage, confiance, test, jum, renta, marche, partCaptee, profilEtudie, passage, points, typesById, surface, loyer, investissement } = v;
  const categorie = (p) => (typesById[p.type_id] || {}).categorie;
  const voisins = [];
  points.forEach((p) => {
    if (p.statut !== 'valide') return;
    const cat = categorie(p);
    if (!['point_de_vente', 'client', 'concurrent'].includes(cat)) return;
    const y = (p.latitude - position.lat) * KM_LAT;
    const x = (p.longitude - position.lng) * kmLng(position.lat);
    if (x * x + y * y <= RAYON_CARTE_KM ** 2 && voisins.length < 200) voisins.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, cat === 'concurrent' ? 'c' : 'r']);
  });
  const nomLieu = [position.quartier, res.gouvernorat].filter(Boolean).join(', ') || `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nom: nomLieu,
    cree_le: new Date().toISOString(),
    lat: position.lat,
    lng: position.lng,
    adresse: position.adresse || '',
    gouvernorat: res.gouvernorat || '',
    zone: zoneLibelle,
    surface: surface || res.surfaceNouveau || null,
    loyer: Number(loyer) || null,
    investissement: Number(investissement) || null,
    masque: caCentral == null || (confiance && confiance.note === 'D'),
    ca: caCentral,
    caBas: plage ? plage.bas : null,
    caHaut: plage ? plage.haut : null,
    note: confiance ? confiance.note : null,
    noteLabel: confiance ? confiance.label : null,
    erreurTest: test && test.erreurMediane != null ? test.erreurMediane : null,
    nTest: test ? test.n : null,
    caGravitaire: res.caEstime,
    caJumeaux: jum ? jum.estime : null,
    population: res.population,
    habitantsCaptes: res.habitantsCaptes,
    cannibalisation: res.methodeCA === 'huff' ? res.cannibalisationCA : res.cannibalisation,
    transfert: res.transfert,
    concurrents: res.concurrentsZone ? res.concurrentsZone.length : null,
    concurrentProche: res.plusProcheConcurrent ? res.plusProcheConcurrent.distance : null,
    pdvProche: res.plusProche ? res.plusProche.distance : null,
    passage: passage ? passage.indice : null,
    marche: marche ? marche.potentiel : null,
    partCaptee,
    pression: profilEtudie ? profilEtudie.pression : null,
    ebitda: renta ? renta.ebitda : null,
    ebitdaBas: renta ? renta.ebitdaBas : null,
    pointMort: renta ? renta.pointMort : null,
    margeSecurite: renta ? renta.margeSecurite : null,
    delai: renta ? renta.delai : null,
    delaiDepasse: renta ? renta.delaiDepasse : false,
    tauxEffort: renta ? renta.tauxEffort : null,
    tauxEffortMax: renta ? renta.tauxEffortMax : null,
    gainReseau: renta ? renta.gainReseau : null,
    voisins,
  };
}

const NOTE_RANG = { A: 4, B: 3, C: 2, D: 1 };

// Lignes du tableau : libellé, valeur affichée, valeur comparée, sens (1 = plus haut est mieux, -1 = plus bas).
// court : texte abrégé pour l'écran ; rapport : ligne réservée au rapport.
export const LIGNES = [
  { groupe: 'Chiffre d’affaires' },
  { cle: 'ca', libelle: 'CA mensuel estimé', texte: (s) => (s.masque ? 'non fiable' : `${ent(s.ca)} TND`), court: (s) => (s.masque ? 'non fiable' : kTxt(s.ca)), val: (s) => (s.masque ? null : s.ca), sens: 1 },
  { cle: 'plage', libelle: 'Fourchette probable', texte: (s) => (s.caBas != null ? `${ent(s.caBas)} – ${ent(s.caHaut)}` : '—'), rapport: true },
  { cle: 'note', libelle: 'Confiance', texte: (s) => s.note || '—', val: (s) => NOTE_RANG[s.note] || null, sens: 1 },
  { cle: 'methodes', libelle: 'Gravitaire / jumeaux', texte: (s) => `${ent(s.caGravitaire)} / ${ent(s.caJumeaux)}`, rapport: true },
  { groupe: 'Rentabilité' },
  { cle: 'ebitda', libelle: 'Résultat mensuel', texte: (s) => (s.ebitda != null ? `${ent(s.ebitda)} TND` : '—'), court: (s) => kTxt(s.ebitda), val: (s) => s.ebitda, sens: 1 },
  { cle: 'gainReseau', libelle: 'Gain net pour le réseau', texte: (s) => (s.gainReseau != null ? `${ent(s.gainReseau)} TND` : '—'), court: (s) => kTxt(s.gainReseau), val: (s) => s.gainReseau, sens: 1 },
  { cle: 'margeSecurite', libelle: 'Marge de sécurité', texte: (s) => pctTxt(s.margeSecurite), val: (s) => s.margeSecurite, sens: 1 },
  { cle: 'delai', libelle: 'Délai de retour', texte: (s) => (s.delai != null ? `${s.delai} mois` : s.delaiDepasse ? '> 10 ans' : '—'), val: (s) => (s.delai != null ? s.delai : s.delaiDepasse ? 999 : null), sens: -1 },
  { cle: 'tauxEffort', libelle: 'Taux d’effort', texte: (s) => pctTxt(s.tauxEffort, 1), val: (s) => s.tauxEffort, sens: -1 },
  { groupe: 'Zone et concurrence' },
  { cle: 'population', libelle: 'Habitants zone', texte: (s) => ent(s.population), court: (s) => kTxt(s.population), val: (s) => s.population, sens: 1 },
  { cle: 'cannibalisation', libelle: 'Cannibalisation', texte: (s) => pctTxt(s.cannibalisation), val: (s) => s.cannibalisation, sens: -1 },
  { cle: 'concurrents', libelle: 'Concurrents zone', texte: (s) => (s.concurrents != null ? String(s.concurrents) : '—'), val: (s) => s.concurrents, sens: -1 },
  { cle: 'concurrentProche', libelle: 'Concurrent le + proche', texte: (s) => kmTxt(s.concurrentProche), val: (s) => s.concurrentProche, sens: 1 },
  { cle: 'passage', libelle: 'Indice de passage', texte: (s) => (s.passage != null ? `${s.passage}/100` : '—'), val: (s) => s.passage, sens: 1 },
  { cle: 'partCaptee', libelle: 'Part de marché captée', texte: (s) => pctTxt(s.partCaptee, 1) },
];

/** Pour chaque ligne comparable, l'id du meilleur site (seulement si au moins deux sites ont une valeur). */
export function meilleurs(sites) {
  const out = {};
  LIGNES.forEach((l) => {
    if (!l.val || !l.sens) return;
    const vals = sites.map((s) => ({ id: s.id, v: l.val(s) })).filter((x) => x.v != null && Number.isFinite(x.v));
    if (vals.length < 2) return;
    const best = vals.reduce((a, b) => (b.v * l.sens > a.v * l.sens ? b : a));
    if (vals.filter((x) => x.v === best.v).length === 1) out[l.cle] = best.id;
  });
  return out;
}

/**
 * Site recommandé : meilleur gain net pour le réseau quand tous les sites l'ont, sinon meilleur résultat mensuel,
 * sinon meilleur CA après cannibalisation. Renvoie { site, critere, phrase, reserves: [texte] } ou null.
 */
export function recommandation(sites) {
  const fiables = sites.filter((s) => !s.masque);
  if (fiables.length < 2) return null;
  const tous = (k) => fiables.every((s) => s[k] != null);
  const crit = tous('gainReseau') ? { cle: 'gainReseau', libelle: 'le meilleur gain net pour le réseau', v: (s) => s.gainReseau }
    : tous('ebitda') ? { cle: 'ebitda', libelle: 'le meilleur résultat mensuel', v: (s) => s.ebitda }
    : { cle: 'caNet', libelle: 'le meilleur CA après cannibalisation', v: (s) => s.ca * (1 - (s.cannibalisation || 0)) };
  const tri = [...fiables].sort((a, b) => crit.v(b) - crit.v(a));
  const site = tri[0];
  const second = tri[1];
  const avance = crit.v(second) !== 0 ? (crit.v(site) - crit.v(second)) / Math.abs(crit.v(second)) : null;
  const reserves = [];
  if (site.note === 'C') reserves.push('confiance C : estimation à confirmer sur le terrain (comptage de passage, étude du voisinage)');
  if (site.margeSecurite != null && site.margeSecurite < 0.1) reserves.push(`marge de sécurité faible (${pctTxt(site.margeSecurite)})`);
  if (site.tauxEffort != null && site.tauxEffortMax != null && site.tauxEffort > site.tauxEffortMax) reserves.push('loyer au-dessus du taux d’effort maximal');
  if (site.ebitda != null && site.ebitda < 0) reserves.push('résultat mensuel négatif en croisière');
  if (avance != null && avance < 0.05) reserves.push(`avance faible sur « ${second.nom} » (moins de 5 %)`);
  if (crit.v(site) < 0) {
    return {
      site,
      second,
      critere: crit.cle,
      aucun: true,
      phrase: `Aucun site ne crée de valeur aux conditions saisies (loyer, paramètres d’exploitation). Le moins défavorable est « ${site.nom} » : ${ent(crit.v(site))} TND par mois, contre ${ent(crit.v(second))} TND pour « ${second.nom} ». Renégocier le loyer ou chercher d’autres emplacements.`,
      reserves: reserves.filter((r) => !r.startsWith('résultat mensuel négatif')),
    };
  }
  return {
    site,
    second,
    critere: crit.cle,
    phrase: `« ${site.nom} » offre ${crit.libelle} : ${ent(crit.v(site))} TND par mois, contre ${ent(crit.v(second))} TND pour « ${second.nom} ».`,
    reserves,
  };
}

// Mini carte SVG d'un site : vos points (jaune) et les concurrents (rouge) à moins de 1,5 km, cercle de 1 km.
export function carteSvg(site, taille = 220) {
  const k = taille / 2 / RAYON_CARTE_KM;
  const c = taille / 2;
  const pts = site.voisins.map(([x, y, t]) => `<circle cx="${(c + x * k).toFixed(1)}" cy="${(c - y * k).toFixed(1)}" r="4.5" fill="${t === 'c' ? '#dc2626' : '#eab308'}" stroke="white" stroke-width="1.5"/>`).join('');
  return `<svg viewBox="0 0 ${taille} ${taille}" width="${taille}" height="${taille}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Environnement du site">
<rect width="${taille}" height="${taille}" rx="10" fill="#f4f5fa"/>
<circle cx="${c}" cy="${c}" r="${(k * 1).toFixed(1)}" fill="#ede9fe" stroke="#a78bfa" stroke-dasharray="4 3"/>
<circle cx="${c}" cy="${c}" r="${(k * 0.5).toFixed(1)}" fill="none" stroke="#c4b5fd" stroke-dasharray="2 3"/>
${pts}
<path d="M${c} ${c - 13} c-6 0 -10 4.5 -10 10 c0 7 10 15 10 15 s10 -8 10 -15 c0 -5.5 -4 -10 -10 -10z" fill="#6d28d9" stroke="white" stroke-width="1.5"/>
<circle cx="${c}" cy="${c - 3}" r="3.2" fill="white"/>
<text x="${c + k * 0.5 + 3}" y="${c - 3}" font-size="9" fill="#7c3aed" font-family="sans-serif">500 m</text>
<text x="${c + k + 3}" y="${c - 3}" font-size="9" fill="#7c3aed" font-family="sans-serif">1 km</text>
</svg>`;
}

/** Rapport complet (HTML autonome, mis en page pour A4) pour le comité d'investissement. */
export function rapportHtml({ sites, societe, auteur, date = new Date() }) {
  const best = meilleurs(sites);
  const reco = recommandation(sites);
  const jour = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const entetes = sites.map((s, i) => `<th>${String.fromCharCode(65 + i)}. ${echapper(s.nom)}</th>`).join('');
  const lignes = LIGNES.map((l) => (l.groupe
    ? `<tr class="groupe"><td colspan="${sites.length + 1}">${l.groupe}</td></tr>`
    : `<tr><td class="lib">${l.libelle}</td>${sites.map((s) => `<td class="${best[l.cle] === s.id ? 'top' : ''}">${echapper(l.texte(s))}</td>`).join('')}</tr>`)).join('');
  const fiches = sites.map((s, i) => `
<section class="fiche">
  <h2>${String.fromCharCode(65 + i)}. ${echapper(s.nom)}</h2>
  <p class="sous">${echapper(s.adresse || '')}${s.adresse ? ' · ' : ''}${s.lat.toFixed(5)}, ${s.lng.toFixed(5)} · zone : ${echapper(s.zone)} · surface ${ent(s.surface)} m²${s.loyer ? ` · loyer ${ent(s.loyer)} TND/mois` : ''}${s.investissement ? ` · investissement ${ent(s.investissement)} TND` : ''}</p>
  <div class="fiche-corps">
    <div class="carte">${carteSvg(s)}<div class="leg"><span class="pt r"></span>vos points <span class="pt c"></span>concurrents</div></div>
    <div class="chiffres">
      <div class="hero"><div class="k">CA mensuel estimé</div><div class="v">${s.masque ? 'non fiable' : `${ent(s.ca)} TND`}</div>
        <div class="d">${s.caBas != null ? `Probablement entre ${ent(s.caBas)} et ${ent(s.caHaut)} TND` : ''}${s.note ? ` · confiance ${s.note}` : ''}</div></div>
      <table class="mini">
        <tr><td>Résultat mensuel en croisière</td><td>${s.ebitda != null ? `${ent(s.ebitda)} TND` : 'paramètres d’exploitation non saisis'}</td></tr>
        ${s.ebitdaBas != null ? `<tr><td>Résultat au bas de la fourchette</td><td>${ent(s.ebitdaBas)} TND</td></tr>` : ''}
        <tr><td>Point mort</td><td>${s.pointMort != null ? `${ent(s.pointMort)} TND de CA` : '—'}</td></tr>
        <tr><td>Délai de retour</td><td>${s.delai != null ? `${s.delai} mois` : s.delaiDepasse ? 'plus de 10 ans' : '—'}</td></tr>
        <tr><td>Gain net pour le réseau</td><td>${s.gainReseau != null ? `${ent(s.gainReseau)} TND/mois` : '—'}</td></tr>
        <tr><td>Clientèle prise à vos points</td><td>${s.transfert != null ? `${ent(s.transfert)} TND/mois (${pctTxt(s.cannibalisation)})` : pctTxt(s.cannibalisation)}</td></tr>
        <tr><td>Habitants de la zone</td><td>${ent(s.population)}${s.habitantsCaptes != null ? ` (dont ${ent(s.habitantsCaptes)} captés)` : ''}</td></tr>
        <tr><td>Concurrents dans la zone</td><td>${s.concurrents ?? '—'}${s.concurrentProche != null ? ` · le plus proche à ${kmTxt(s.concurrentProche)}` : ''}</td></tr>
        <tr><td>Votre point le plus proche</td><td>${kmTxt(s.pdvProche)}</td></tr>
        <tr><td>Potentiel de marché de la zone</td><td>${s.marche != null ? `${ent(s.marche)} TND/mois` : '—'}${s.partCaptee != null ? ` · part captée ${pctTxt(s.partCaptee, 1)}` : ''}</td></tr>
        <tr><td>Indice de passage</td><td>${s.passage != null ? `${s.passage}/100` : '—'}</td></tr>
      </table>
    </div>
  </div>
</section>`).join('');
  const test = sites.find((s) => s.erreurTest != null);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Comparaison de sites – ${echapper(societe)}</title>
<style>
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; font-size: 10.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { max-width: 184mm; margin: 0 auto; }
.bandeau { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; }
.marque { font-weight: 800; font-size: 12pt; color: #4f46e5; letter-spacing: -.01em; }
.meta { font-size: 9pt; color: #64748b; text-align: right; }
h1 { font-size: 19pt; margin: 14px 0 4px; letter-spacing: -.02em; }
.intro { color: #475569; margin: 0 0 14px; }
.reco { border: 1px solid #a7f3d0; background: #ecfdf5; border-radius: 10px; padding: 10px 13px; margin: 8px 0 12px; break-inside: avoid; }
.reco .t { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #047857; font-weight: 700; }
.reco .n { font-size: 14pt; font-weight: 800; margin: 2px 0; }
.reco.aucun { border-color: #fcd34d; background: #fffbeb; } .reco.aucun .t { color: #b45309; }
.reco ul { margin: 6px 0 0; padding-left: 18px; color: #92400e; }
table.comp { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
table.comp th { text-align: left; background: #eef0ff; color: #3730a3; padding: 6px 7px; font-size: 9pt; }
table.comp td { padding: 3.5px 7px; border-bottom: 1px solid #e7e9f0; font-variant-numeric: tabular-nums; }
table.comp td.lib { color: #475569; }
table.comp td.top { font-weight: 700; color: #047857; }
table.comp td.top::before { content: '● '; color: #10b981; }
table.comp tr.groupe td { background: #f8fafc; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; font-weight: 700; padding-top: 6px; }
table.comp td.lib { white-space: nowrap; }
.fiche { break-before: page; }
.fiche h2 { font-size: 15pt; margin: 4px 0 2px; }
.sous { color: #64748b; font-size: 9pt; margin: 0 0 12px; }
.fiche-corps { display: flex; gap: 16px; align-items: flex-start; }
.carte { flex: none; }
.leg { font-size: 8pt; color: #64748b; margin-top: 4px; }
.pt { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 3px 0 8px; vertical-align: 0; }
.pt.r { background: #eab308; } .pt.c { background: #dc2626; }
.chiffres { flex: 1; min-width: 0; }
.hero { background: #1e1b4b; color: white; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
.hero .k { font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #a5b4fc; font-weight: 700; }
.hero .v { font-size: 18pt; font-weight: 800; }
.hero .d { font-size: 9pt; color: #c7d2fe; }
table.mini { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
table.mini td { padding: 3.5px 0; border-bottom: 1px solid #eef0f4; }
table.mini td:last-child { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.methode { break-before: page; font-size: 9pt; color: #334155; }
.methode h2 { font-size: 13pt; }
.methode p { margin: 0 0 8px; }
.pied { margin-top: 10px; font-size: 8pt; color: #94a3b8; border-top: 1px solid #e7e9f0; padding-top: 6px; }
@media screen { body { background: #e5e7eb; } .page { background: white; padding: 12mm; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.12); } }
</style></head><body><div class="page">
<div class="bandeau"><div class="marque">GeoPulse</div><div class="meta">${echapper(societe)}<br>${jour}${auteur ? ` · ${echapper(auteur)}` : ''}</div></div>
<h1>Comparaison de ${sites.length} site${sites.length > 1 ? 's' : ''}</h1>
<p class="intro">Note pour le comité d’investissement. Estimations du simulateur GeoPulse, à partir des ventes réelles du réseau, de la population (grille de 250 m), de la concurrence saisie et des paramètres d’exploitation.</p>
${reco ? `<div class="reco${reco.aucun ? ' aucun' : ''}"><div class="t">${reco.aucun ? 'Aucun site rentable · le moins défavorable' : 'Site recommandé'}</div><div class="n">${String.fromCharCode(65 + sites.indexOf(reco.site))}. ${echapper(reco.site.nom)}</div><div>${echapper(reco.phrase)}</div>${reco.reserves.length ? `<ul>${reco.reserves.map((r) => `<li>${echapper(r)}</li>`).join('')}</ul>` : ''}</div>` : ''}
<table class="comp"><thead><tr><th></th>${entetes}</tr></thead><tbody>${lignes}</tbody></table>
<p class="pied">● meilleure valeur de la ligne. Zone de chalandise : ${[...new Set(sites.map((s) => s.zone))].map(echapper).join(', ')}.</p>
${fiches}
<section class="methode">
  <h2>Méthode et fiabilité</h2>
  <p><b>CA estimé.</b> Moyenne de deux méthodes. Le modèle gravitaire partage les habitants de chaque carré de 250 m entre vos points, les concurrents et le site, selon la surface et la distance (ou le temps de trajet), réglé sur vos ventes. Les magasins jumeaux reprennent le CA de vos points les plus ressemblants (habitants, concurrence, surface, passage).</p>
  <p><b>Fiabilité.</b> ${test ? `Chaque point du réseau ayant des ventes est caché puis estimé à partir des autres : écart médian de ${pctTxt(test.erreurTest)} sur ${test.nTest} points.` : 'Test indisponible.'} La fourchette couvre 80 % des écarts observés. Note A : écart sous 15 % et méthodes concordantes ; B : sous 25 % ; C : ordre de grandeur ; D : pas de chiffre.</p>
  <p><b>Rentabilité.</b> Marge brute, redevance, salaires et charges fixes saisis par l’administrateur pour le type de point ; loyer et investissement saisis pour chaque site. Le délai de retour tient compte de la montée en charge des 12 premiers mois. Le gain net pour le réseau retire la marge perdue sur les ventes que le site prend à vos points voisins.</p>
  <p><b>Sources.</b> Population : Meta et CIESIN (High Resolution Settlement Layer, CC BY 4.0). Routes et lieux : Overture Maps Foundation (octobre 2026). Dépense des ménages : INS 2021. Pauvreté : INS et Banque mondiale 2020.</p>
  <p class="pied">Rapport généré par GeoPulse le ${jour}. Les estimations ne remplacent pas une visite du site.</p>
</section>
</div></body></html>`;
}

/** Ouvre le rapport dans un nouvel onglet et lance l'impression (« Enregistrer en PDF »). */
export function ouvrirRapport(params) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(rapportHtml(params));
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* l'utilisateur imprime lui-même */ } }, 600);
  return true;
}
