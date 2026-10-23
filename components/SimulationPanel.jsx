'use client';
import { useEffect, useMemo, useState } from 'react';
import { champsCA, simuler } from '../lib/simulation';
import { chargerGrille } from '../lib/population';
import { preparerMoteur } from '../lib/huff';
import { calibrerModele, combinerTests, ecartMethodes, fourchette, noteConfiance, testerModele } from '../lib/fiabilite';
import { calculerRentabilite, parametresDuType } from '../lib/rentabilite';
import { depenseDuType, potentielMarche, reperesReseau } from '../lib/marche';
import { NB_JUMEAUX, estimerParJumeaux, preparerReseau, profilSite, testerJumeaux } from '../lib/jumeaux';
import { REGLAGE_DEFAUT } from '../lib/simulation';
import { COULEURS_GENERATEURS, SINGULIERS, chargerGenerateurs, niveauPassage, passageAutour } from '../lib/generateurs';
import { C, Empty, Message, SectionTitle, btn, carte, inputStyle, labelStyle, surtitre } from './ui';
import Icon from './icons';

const RAYONS = [0.5, 1, 2, 3, 5];
const fmtReglage = (v) => v.toLocaleString('fr-FR');
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR'));
const km = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${(Math.round(d * 10) / 10).toLocaleString('fr-FR')} km`);

function Carte({ icon, titre, valeur, detail, couleur = C.text, children }) {
  return (
    <div style={{ ...carte, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ ...surtitre, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name={icon} size={13} />{titre}</div>
      <div className="num" style={{ fontSize: '21px', fontWeight: 700, color: couleur, letterSpacing: '-.02em', marginTop: '4px' }}>{valeur}</div>
      {children}
      {detail && <div style={{ fontSize: '11.5px', color: C.muted, lineHeight: 1.45, marginTop: '2px' }}>{detail}</div>}
    </div>
  );
}

// Réglages déjà calculés : points de la société (objet) -> rayon et champ CA -> { ventes, resultat }.
const CALIBRAGES = new WeakMap();

const NOTES = { A: '#059669', B: '#0d9488', C: '#d97706', D: '#dc2626' };
function NoteBadge({ note, clair }) {
  const c = NOTES[note] || NOTES.D;
  return (
    <span title={`Confiance ${note}`} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: clair ? '0' : '3px 9px 3px 4px', borderRadius: '999px', background: clair ? 'transparent' : 'rgba(255,255,255,.1)', fontSize: '11px', fontWeight: 600, color: clair ? c : '#e0e7ff' }}>
      <span style={{ width: clair ? 34 : 20, height: clair ? 34 : 20, borderRadius: clair ? 10 : '50%', background: c, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: clair ? '16px' : '11px', fontWeight: 800 }}>{note}</span>
      {!clair && 'Confiance'}
    </span>
  );
}

// Simulateur d'emplacement : population de la zone, cannibalisation, concurrence et CA estimé.
export default function SimulationPanel({ position, rayonKm, onRayon, points, typesById, champs, demographie, surfaces, ventes, onAjouter }) {
  const typesPdv = useMemo(() => Object.values(typesById).filter((t) => ['point_de_vente', 'client'].includes(t.categorie)).map((t) => t.id), [typesById]);
  const champsDispo = useMemo(() => champsCA(champs, typesPdv), [champs, typesPdv]);
  const [cleCA, setCleCA] = useState('');
  useEffect(() => {
    if (!champsDispo.some((c) => c.cle === cleCA)) setCleCA(champsDispo.length ? champsDispo[0].cle : '');
  }, [champsDispo, cleCA]);

  // Grille de population (~1,7 Mo), chargée à la première ouverture du simulateur.
  const [grille, setGrille] = useState(null);
  useEffect(() => {
    let actif = true;
    chargerGrille().then((g) => { if (actif) setGrille(g); }).catch(() => {});
    return () => { actif = false; };
  }, []);
  // Générateurs de trafic (gares, marchés, écoles…), chargés avec le simulateur ; sans eux, tout le reste fonctionne.
  const [generateurs, setGenerateurs] = useState(null);
  useEffect(() => {
    let actif = true;
    chargerGenerateurs().then((g) => { if (actif) setGenerateurs(g); }).catch(() => {});
    return () => { actif = false; };
  }, []);

  // Surface du point simulé (m²) : vide = surface médiane de vos points.
  const [surfaceSaisie, setSurfaceSaisie] = useState('');
  // Type d'exploitation du point étudié (propre, franchise…) : les jumeaux du même type sont préférés.
  const [typeSaisi, setTypeSaisi] = useState('');
  // Loyer et investissement d'ouverture du site étudié (étape 4 : rentabilité).
  const [loyer, setLoyer] = useState('');
  const [investissement, setInvestissement] = useState('');
  const typesExploitation = useMemo(() => typesPdv.map((id) => typesById[id]).filter(Boolean), [typesPdv, typesById]);

  // Réglage du modèle sur les ventes (étape 2) puis test « un magasin caché » (étape 1). Ne dépend pas de
  // l'emplacement étudié : recalculé quand les données ou le rayon changent, en tâche de fond, et gardé en
  // mémoire tant que les points de la société ne sont pas rechargés.
  // Réseau préparé pour le modèle de partage (carrés de population autour de chaque point), pour ce rayon.
  const moteur = useMemo(
    () => (grille ? preparerMoteur({ rayonKm, points, typesById, champs, grille, ventes, cleCA }) : null),
    [rayonKm, points, typesById, champs, grille, ventes, cleCA]
  );
  const [calib, setCalib] = useState(undefined);
  useEffect(() => {
    if (!grille || !moteur) { setCalib(undefined); return undefined; }
    const params = { rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA, moteur };
    const parRayon = CALIBRAGES.get(points) || new Map();
    CALIBRAGES.set(points, parRayon);
    const cle = `${rayonKm}|${cleCA}`;
    const connu = parRayon.get(cle);
    if (connu && connu.ventes === ventes) { setCalib(connu.resultat); return undefined; }
    setCalib(undefined);
    let annule = false;
    calibrerModele(params, () => annule).then((r) => {
      if (annule) return;
      const resultat = r || { reglage: REGLAGE_DEFAUT, test: testerModele(params), testDefaut: null };
      parRayon.set(cle, { ventes, resultat });
      setCalib(resultat);
    });
    return () => { annule = true; };
  }, [rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA, moteur]);

  // Magasins jumeaux (étape 3) : profil de chaque point du réseau, puis test « un magasin caché » de la méthode.
  const reseauJ = useMemo(
    () => preparerReseau({ rayonKm, points, typesById, champs, grille, ventes, cleCA, generateurs }),
    [rayonKm, points, typesById, champs, grille, ventes, cleCA, generateurs]
  );
  const testJ = useMemo(() => testerJumeaux(reseauJ), [reseauJ]);
  const test = calib ? combinerTests(calib.test, testJ) : undefined;

  const res = useMemo(
    () => (position && (calib !== undefined || !grille) ? simuler({ position, rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA, surfaceNouveau: surfaceSaisie, reglage: calib ? calib.reglage : REGLAGE_DEFAUT, moteur }) : null),
    [position, rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA, surfaceSaisie, calib, moteur]
  );

  const huff = res && res.methodeCA === 'huff';
  // Profil du site étudié (habitants à 1 et 3 km, pression concurrentielle, surface).
  const profilEtudie = useMemo(() => {
    if (!res || !reseauJ || !grille) return null;
    const surface = Number(surfaceSaisie) > 0 ? Number(surfaceSaisie) : reseauJ.surfaceMediane;
    return profilSite(grille, position.lat, position.lng, rayonKm, reseauJ.concurrents, surface, generateurs);
  }, [res, reseauJ, surfaceSaisie, grille, position, rayonKm, generateurs]);
  const jum = useMemo(
    () => (huff && profilEtudie && testJ ? estimerParJumeaux(reseauJ, profilEtudie, { typeId: typeSaisi || null, theta: testJ.theta, passage: testJ.passage }) : null),
    [huff, profilEtudie, reseauJ, testJ, typeSaisi]
  );
  // CA central : moyenne des deux méthodes quand les jumeaux sont disponibles.
  const caCentral = !res ? null : jum && res.caEstime != null ? Math.round((res.caEstime + jum.estime) / 2) : res.caEstime;
  const ecart = jum ? ecartMethodes(res.caEstime, jum.estime) : null;
  const confiance = res && test !== undefined ? noteConfiance(test, { ...res, caEstime: caCentral }, jum ? { ecart, tresProches: jum.tresProches } : null) : null;
  const plage = confiance && confiance.note !== 'D' ? fourchette(test, caCentral, jum ? [res.caEstime, jum.estime] : []) : null;
  const masque = confiance && confiance.note === 'D' && caCentral != null;
  const nomType = (id) => (typesById[id] || {}).nom || '';

  // Passage : générateurs de trafic autour du site, indice national et rang parmi vos points.
  const passage = useMemo(() => (position && generateurs ? passageAutour(generateurs, position.lat, position.lng, 0.5) : null), [position, generateurs]);
  const rangPassage = useMemo(() => {
    if (!passage || !reseauJ || !reseauJ.refs.length || reseauJ.refs[0].profil.passage == null) return null;
    const v = reseauJ.refs.map((r) => r.profil.passage);
    return Math.round((100 * v.filter((x) => x < passage.score).length) / v.length);
  }, [passage, reseauJ]);
  const couleurPassage = !passage ? C.text : passage.indice >= 60 ? C.success : passage.indice >= 40 ? C.brand : passage.indice >= 20 ? C.warning : C.danger;

  // Rentabilité : paramètres du type choisi, sinon du premier type de point de vente qui en a.
  const typeRenta = typeSaisi ? typesById[typeSaisi] : typesExploitation.find((t) => parametresDuType(t)) || typesExploitation[0];
  const paramsRenta = parametresDuType(typeRenta);
  const renta = res && !masque && caCentral != null ? calculerRentabilite({
    p: paramsRenta,
    ca: caCentral,
    surface: res.surfaceNouveau,
    loyer: Number(loyer) || 0,
    investissement: Number(investissement) || 0,
    caBas: plage ? plage.bas : null,
    transfert: huff ? res.transfert : null,
  }) : null;
  // Marché (étape 5) : dépense du secteur du type étudié, sinon du premier type de point de vente qui a un secteur.
  const typeMarche = depenseDuType(typeRenta) ? typeRenta : typesExploitation.find((t) => depenseDuType(t)) || typeRenta;
  const depense = depenseDuType(typeMarche);
  const marche = res && depense ? potentielMarche(res.population, depense.mensuelle, res.gouvernorat) : null;
  const reperes = useMemo(() => reperesReseau(reseauJ, depense ? depense.mensuelle : 0), [reseauJ, depense && depense.mensuelle]);
  const partCaptee = marche && caCentral != null && !masque ? caCentral / marche.potentiel : null;
  const pressionRel = profilEtudie && reperes && reperes.pressionMediane > 0 ? profilEtudie.pression / reperes.pressionMediane : null;
  const niveauPression = !profilEtudie ? null : profilEtudie.pression === 0 ? { label: 'Aucun concurrent', color: C.success }
    : pressionRel == null ? null : pressionRel < 0.67 ? { label: 'Plus faible que vos zones', color: C.success }
    : pressionRel <= 1.5 ? { label: 'Comparable à vos zones', color: C.brand } : { label: 'Plus forte que vos zones', color: C.danger };
  const pct = (v) => `${(Math.round(v * 1000) / 10).toLocaleString('fr-FR')} %`;
  const solidite = !renta || renta.margeSecurite == null ? null
    : renta.margeSecurite >= 0.25 ? { label: 'Solide', color: C.success }
    : renta.margeSecurite >= 0 ? { label: 'Fragile', color: C.warning } : { label: 'Sous le point mort', color: C.danger };

  const tauxCannib = !res ? 0 : huff ? res.cannibalisationCA : res.cannibalisation;
  const niveau = !res ? null : tauxCannib < 0.15
    ? { label: 'Faible', color: '#16a34a' }
    : tauxCannib < 0.4 ? { label: 'Moyen', color: '#d97706' } : { label: 'Élevé', color: '#dc2626' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionTitle icon="target" title="Simulateur d’emplacement">
        Cliquez sur la carte pour placer l’emplacement à étudier, puis choisissez la taille de la zone.
      </SectionTitle>

      <div>
        <label style={labelStyle}>Rayon de la zone de chalandise</label>
        <div style={{ display: 'flex', gap: '3px', marginTop: '6px', background: C.bg, border: '1px solid ' + C.line, borderRadius: '11px', padding: '3px' }}>
          {RAYONS.map((r) => (
            <button key={r} type="button" onClick={() => onRayon(r)} style={{ flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none', background: r === rayonKm ? 'white' : 'transparent', color: r === rayonKm ? C.brand : C.muted, boxShadow: r === rayonKm ? '0 1px 3px rgba(15,23,42,.12)' : 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {km(r)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Surface du point étudié (m²)</label>
        <input type="number" min="0" value={surfaceSaisie} onChange={(e) => setSurfaceSaisie(e.target.value)}
          placeholder={res && res.surfaceMediane ? `${fmt(res.surfaceMediane)} m² (médiane de vos points)` : 'Surface en m²'} style={inputStyle} />
      </div>

      {typesExploitation.length > 1 && (
        <div>
          <label style={labelStyle}>Type d’exploitation du point étudié</label>
          <select value={typeSaisi} onChange={(e) => setTypeSaisi(e.target.value)} style={inputStyle}>
            <option value="">Indifférent</option>
            {typesExploitation.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
        </div>
      )}

      {!position && (
        <Empty icon="crosshair">Aucun emplacement sélectionné.<br />Cliquez sur la carte pour lancer l’étude.</Empty>
      )}

      {position && !res && (
        <Empty icon="chart">Réglage du modèle sur vos ventes…</Empty>
      )}

      {res && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.body }}>
            <Icon name="pin" size={16} style={{ color: C.violet }} />
            <b style={{ color: C.text }}>{res.gouvernorat || 'Gouvernorat inconnu'}</b>{position.quartier ? <span style={{ color: C.muted }}>· {position.quartier}</span> : null}
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: C.faint }}>rayon {km(rayonKm)}</span>
          </div>

          <div style={{ background: 'radial-gradient(120% 140% at 100% 0%, #4c1d95 0%, #1e1b4b 45%, #0b1020 100%)', borderRadius: '18px', padding: '18px', color: 'white', position: 'relative', overflow: 'hidden', boxShadow: '0 12px 30px rgba(30,27,75,.35)' }}>
            <div style={{ position: 'absolute', right: '-30px', top: '-30px', width: '140px', height: '140px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.08)' }} />
            <div style={{ position: 'absolute', right: '-5px', top: '-5px', width: '90px', height: '90px', borderRadius: '50%', border: '1px solid rgba(255,255,255,.10)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#a5b4fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="wallet" size={13} />CA mensuel estimé</div>
              {confiance && <NoteBadge note={confiance.note} />}
            </div>
            <div className="num" style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '-.03em', marginTop: '4px' }}>
              {caCentral != null && !masque ? fmt(caCentral) : '—'}<span style={{ fontSize: '15px', fontWeight: 600, color: '#c7d2fe', marginLeft: '6px' }}>TND</span>
            </div>
            {plage && (
              <div className="num" style={{ fontSize: '12.5px', color: '#e0e7ff', fontWeight: 500 }}>
                Probablement entre <b>{fmt(plage.bas)}</b> et <b>{fmt(plage.haut)}</b> TND
              </div>
            )}
            {jum && !masque && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px', position: 'relative' }}>
                {[['Modèle gravitaire', res.caEstime], ['Magasins jumeaux', jum.estime]].map(([l, v]) => (
                  <div key={l} style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.10)', borderRadius: '10px', padding: '7px 10px' }}>
                    <div style={{ fontSize: '10.5px', color: '#a5b4fc', fontWeight: 600 }}>{l}</div>
                    <div className="num" style={{ fontSize: '15px', fontWeight: 700 }}>{fmt(v)} <span style={{ fontSize: '11px', color: '#c7d2fe', fontWeight: 600 }}>TND</span></div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', fontSize: '11.5px', color: ecart < 0.1 ? '#6ee7b7' : ecart < 0.2 ? '#e0e7ff' : '#fcd34d', fontWeight: 500 }}>
                  {ecart < 0.1 ? 'Les deux méthodes concordent' : ecart < 0.2 ? 'Les deux méthodes sont proches' : 'Les deux méthodes divergent'} : écart de {Math.round(ecart * 100)} %
                </div>
              </div>
            )}
            <div style={{ fontSize: '11.5px', color: '#c7d2fe', lineHeight: 1.5, marginTop: '4px', maxWidth: '300px' }}>
              {huff
                ? [caCentral != null && res.surfaceNouveau ? `${fmt(caCentral / res.surfaceNouveau)} TND/m²` : null, `${fmt(res.habitantsCaptes)} habitants captés`,
                  `${(Math.round(res.caParHabitant * 100) / 100).toLocaleString('fr-FR')} TND/hab./mois (${res.sourceCA === 'ventes' ? 'ventes' : 'CA'} de ${res.nbValeursCA} points)`].filter(Boolean).join(' · ')
                : res.sourceCA === 'ventes' ? `Ventes réelles de ${res.nbValeursCA} points (12 mois), ajustées de la cannibalisation`
                : res.sourceCA === 'champ' ? `Médiane de ${res.nbValeursCA} points, ajustée de la cannibalisation` : 'Pas encore de ventes importées'}
            </div>
          </div>

          {confiance && (
            <div style={{ ...carte, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <NoteBadge note={confiance.note} clair />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: C.text }}>{confiance.label}</div>
                  <div style={{ fontSize: '11.5px', color: C.muted }}>
                    {test && test.n >= 3 && test.erreurMediane != null
                      ? `Testé sur ${test.n} de vos points : écart médian de ${Math.round(test.erreurMediane * 100)} % entre estimation et ventes réelles`
                        + (test.erreurJumeaux != null ? ` (modèle gravitaire seul ${Math.round(test.erreurGravitaire * 100)} %, jumeaux seuls ${Math.round(test.erreurJumeaux * 100)} %)` : '')
                      : 'Pas assez de points avec un CA connu pour tester le modèle'}
                  </div>
                </div>
              </div>
              {calib && calib.testDefaut && calib.reglage !== REGLAGE_DEFAUT && (
                <div style={{ fontSize: '11.5px', color: C.success, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="checkCircle" size={14} />
                  Modèle gravitaire réglé sur vos ventes : écart ramené de {Math.round(calib.testDefaut.erreurMediane * 100)} % à {Math.round(calib.test.erreurMediane * 100)} %
                </div>
              )}
              {(confiance.conseil || masque) && <div style={{ fontSize: '11.5px', color: C.warning }}>{masque ? 'CA non affiché : ' : ''}{confiance.conseil}</div>}
              {test && test.details.length > 0 && (
                <details style={{ fontSize: '11.5px', color: C.muted }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: C.body }}>Détail du test (plus grands écarts d’abord)</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', columnGap: '10px', rowGap: '3px', marginTop: '6px' }}>
                    <span style={surtitre}>Point</span><span style={surtitre}>Réel</span><span style={surtitre}>Estimé</span><span style={surtitre}>Écart</span>
                    {test.details.map((d) => [
                      <span key={d.id + 'n'} style={{ color: C.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nom}</span>,
                      <span key={d.id + 'r'} className="num" style={{ textAlign: 'right' }}>{fmt(d.reel)}</span>,
                      <span key={d.id + 'e'} className="num" style={{ textAlign: 'right' }}>{fmt(d.estime)}</span>,
                      <span key={d.id + 'x'} className="num" style={{ textAlign: 'right', color: Math.abs(d.erreur) > 0.3 ? C.danger : C.body }}>{d.erreur >= 0 ? '+' : ''}{Math.round(d.erreur * 100)} %</span>,
                    ])}
                  </div>
                </details>
              )}
            </div>
          )}

          {res && profilEtudie && (
            <div style={{ ...carte, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ ...surtitre, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="globe" size={13} />Marché de la zone</div>
                {depense && depense.secteur && <span style={{ fontSize: '11px', fontWeight: 600, color: C.brandDark, background: C.brandSoft, padding: '3px 9px', borderRadius: '999px' }}>{depense.secteur.libelle}</span>}
              </div>
              {marche ? (
                <div>
                  <div style={{ fontSize: '11.5px', color: C.muted }}>Potentiel de marché : dépense des habitants dans le secteur</div>
                  <div className="num" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.02em', color: C.text }}>{fmt(marche.potentiel)} <span style={{ fontSize: '12px', color: C.muted, fontWeight: 600 }}>TND/mois</span></div>
                  <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.45 }}>
                    {fmt(res.population)} habitants × {(Math.round(depense.mensuelle * 10) / 10).toLocaleString('fr-FR')} TND/hab./mois
                    {marche.region ? ` × ${(Math.round(marche.indice * 100) / 100).toLocaleString('fr-FR')} (niveau de dépense ${marche.region})` : ''}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '11.5px', color: C.warning, lineHeight: 1.5 }}>
                  Choisissez le secteur du type « {typeMarche ? typeMarche.nom : 'point de vente'} » dans l’onglet Types (administrateur) pour calculer le potentiel de marché.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {partCaptee != null && (
                  <div style={{ background: C.bg, borderRadius: '10px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10.5px', color: C.muted, fontWeight: 600 }}>Part captée par le site</div>
                    <div className="num" style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>{pct(partCaptee)}</div>
                    {reperes && reperes.partMediane != null && <div style={{ fontSize: '10.5px', color: C.muted }}>vos points : {pct(reperes.partMediane)}</div>}
                  </div>
                )}
                <div style={{ background: C.bg, borderRadius: '10px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '10.5px', color: C.muted, fontWeight: 600 }}>Pression concurrentielle</div>
                  <div className="num" style={{ fontSize: '14px', fontWeight: 700, color: niveauPression ? niveauPression.color : C.text }}>{fmt(profilEtudie.pression)} m²<span style={{ fontSize: '10.5px', fontWeight: 600, color: C.muted }}> /1 000 hab.</span></div>
                  {reperes && reperes.pressionMediane != null && <div style={{ fontSize: '10.5px', color: C.muted }}>vos points : {fmt(reperes.pressionMediane)} m²</div>}
                </div>
              </div>
              <div style={{ fontSize: '11.5px', color: C.body, lineHeight: 1.5 }}>
                {niveauPression && <>Concurrence : <b style={{ color: niveauPression.color }}>{niveauPression.label.toLowerCase()}</b>. </>}
                {partCaptee != null && reperes && reperes.partMediane != null && (partCaptee > reperes.partMediane * 1.5
                  ? <span style={{ color: C.warning }}>Le site capterait une part du marché nettement plus forte que vos points : estimation optimiste, à vérifier.</span>
                  : partCaptee < reperes.partMediane / 1.5
                    ? 'Le site capterait une part du marché plus faible que vos points : la zone peut porter davantage.'
                    : 'Part du marché captée cohérente avec celle de vos points.')}
              </div>
            </div>
          )}

          {passage && (
            <div style={{ ...carte, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ ...surtitre, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="activity" size={13} />Passage</div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: couleurPassage, background: couleurPassage + '14', padding: '3px 9px', borderRadius: '999px' }}>{niveauPassage(passage.indice)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11.5px', color: C.muted }}>Indice de passage</div>
                  <div className="num" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.02em', color: C.text }}>{passage.indice}<span style={{ fontSize: '12px', color: C.muted, fontWeight: 600 }}> /100</span></div>
                </div>
                <div style={{ flex: 1, paddingBottom: '7px' }}>
                  <div style={{ height: '6px', borderRadius: '6px', background: '#eef0f4', overflow: 'hidden' }}>
                    <div style={{ width: Math.max(3, passage.indice) + '%', height: '100%', borderRadius: '6px', background: couleurPassage }} />
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '11.5px', color: C.body, lineHeight: 1.5 }}>
                Plus de passage que là où vivent {passage.indice} % des Tunisiens
                {rangPassage != null ? <>, et que <b>{rangPassage} %</b> de vos points</> : ''}.
              </div>
              {passage.parClasse.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {passage.parClasse.map((c) => (
                    <div key={c.cle} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '5px 0', borderTop: '1px solid ' + C.line, color: C.body }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: COULEURS_GENERATEURS[c.cle], flex: 'none' }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <b style={{ color: C.text }}>{c.n}</b> {c.n === 1 ? SINGULIERS[c.cle] : c.libelle.toLowerCase()}
                        {c.plusProche && c.plusProche.nom ? <span style={{ color: C.muted }}> · {c.plusProche.nom}</span> : null}
                      </span>
                      <span className="num" style={{ color: C.muted, flex: 'none' }}>{km(c.plusProche.distance)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '11.5px', color: C.muted }}>Aucun générateur de trafic recensé à moins de 500 m.</div>
              )}
              {testJ && testJ.erreurAvecPassage != null && (
                <div style={{ fontSize: '11px', color: testJ.passage ? C.success : C.muted, lineHeight: 1.45 }}>
                  {testJ.passage
                    ? `Pris en compte dans les magasins jumeaux : écart au test ramené de ${Math.round(testJ.erreurSansPassage * 100)} % à ${Math.round(testJ.erreurAvecPassage * 100)} % sur vos ventes.`
                    : `Pas retenu dans l’estimation du CA : sur vos ventes, il n’améliore pas le test (${Math.round(testJ.erreurSansPassage * 100)} % sans, ${Math.round(testJ.erreurAvecPassage * 100)} % avec).`}
                </div>
              )}
            </div>
          )}

          {res && caCentral != null && !masque && (
            <div style={{ ...carte, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...surtitre, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="wallet" size={13} />Rentabilité</div>
                {solidite && <span style={{ fontSize: '11px', fontWeight: 700, color: solidite.color, background: solidite.color + '14', padding: '3px 9px', borderRadius: '999px' }}>{solidite.label}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>Loyer (TND/mois)</label>
                  <input type="number" min="0" value={loyer} onChange={(e) => setLoyer(e.target.value)} placeholder="Ex : 6 500" style={inputStyle} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '11px' }}>Investissement (TND)</label>
                  <input type="number" min="0" value={investissement} onChange={(e) => setInvestissement(e.target.value)} placeholder="Travaux, équipement, stock" style={inputStyle} />
                </div>
              </div>
              {!paramsRenta && (
                <div style={{ fontSize: '11.5px', color: C.warning, lineHeight: 1.5 }}>
                  Renseignez le taux de marge brute du type « {typeRenta ? typeRenta.nom : 'point de vente'} » dans l’onglet Types (administrateur) pour calculer le point mort et le délai de retour.
                </div>
              )}
              {renta && (
                <>
                  <div>
                    <div style={{ fontSize: '11.5px', color: C.muted }}>Résultat d’exploitation mensuel en croisière</div>
                    <div className="num" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.02em', color: renta.ebitda >= 0 ? C.text : C.danger }}>{fmt(renta.ebitda)} <span style={{ fontSize: '12px', color: C.muted, fontWeight: 600 }}>TND</span></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      ['CA point mort', renta.pointMort != null ? `${fmt(renta.pointMort)} TND` : '—', null],
                      ['Marge de sécurité', renta.margeSecurite != null ? `${Math.round(renta.margeSecurite * 100)} %` : '—', solidite && solidite.color],
                      ['Délai de retour', renta.delai != null ? `${renta.delai} mois` : renta.delaiDepasse ? 'plus de 10 ans' : 'saisir l’investissement', renta.delaiDepasse ? C.danger : null],
                      ['Taux d’effort', renta.tauxEffort != null ? `${(Math.round(renta.tauxEffort * 1000) / 10).toLocaleString('fr-FR')} %` : 'saisir le loyer',
                        renta.tauxEffort != null && renta.tauxEffortMax != null && renta.tauxEffort > renta.tauxEffortMax ? C.danger : null],
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ background: C.bg, borderRadius: '10px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '10.5px', color: C.muted, fontWeight: 600 }}>{l}</div>
                        <div className="num" style={{ fontSize: '14px', fontWeight: 700, color: c || C.text }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11.5px', color: C.body, lineHeight: 1.5 }}>
                    {renta.margeSecurite != null && renta.margeSecurite > 0
                      ? `Le point reste rentable tant que son CA ne baisse pas de plus de ${Math.round(renta.margeSecurite * 100)} % par rapport à l’estimation.`
                      : 'Au CA estimé, le point ne couvre pas ses charges.'}
                    {renta.ebitdaBas != null && plage ? ` Au bas de la fourchette (${fmt(plage.bas)} TND), le résultat serait de ${fmt(renta.ebitdaBas)} TND/mois.` : ''}
                    {renta.tauxEffort != null && renta.tauxEffortMax != null && renta.tauxEffort > renta.tauxEffortMax ? ` Loyer trop lourd : au-dessus de votre seuil de ${Math.round(renta.tauxEffortMax * 100)} % du CA.` : ''}
                  </div>
                  {renta.gainReseau != null && res.transfert > 0 && (
                    <div style={{ fontSize: '11.5px', color: C.body }}>
                      Gain net pour le réseau, après la marge perdue sur vos points voisins : <b className="num" style={{ color: renta.gainReseau >= 0 ? C.success : C.danger }}>{fmt(renta.gainReseau)} TND/mois</b>
                    </div>
                  )}
                  <details style={{ fontSize: '11.5px', color: C.muted }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: C.body }}>Compte d’exploitation mensuel</summary>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '3px', marginTop: '6px' }}>
                      {[
                        ['CA estimé', caCentral],
                        [`Marge brute (${(Math.round(paramsRenta.marge * 1000) / 10).toLocaleString('fr-FR')} %)`, renta.marge],
                        ...(renta.redevance ? [['− Redevance', renta.redevance]] : []),
                        ['− Loyer', renta.loyer],
                        [`− Salaires (${fmt(res.surfaceNouveau)} m²)`, renta.salaires],
                        ['− Autres charges fixes', renta.chargesFixes],
                      ].map(([l, v]) => [
                        <span key={l}>{l}</span>,
                        <span key={l + 'v'} className="num" style={{ textAlign: 'right' }}>{fmt(v)}</span>,
                      ])}
                      <b style={{ color: C.text, borderTop: '1px solid ' + C.line, paddingTop: '3px' }}>= Résultat d’exploitation</b>
                      <b className="num" style={{ color: C.text, textAlign: 'right', borderTop: '1px solid ' + C.line, paddingTop: '3px' }}>{fmt(renta.ebitda)}</b>
                    </div>
                    <div style={{ marginTop: '6px', lineHeight: 1.5 }}>
                      Paramètres du type « {typeRenta.nom} ». Délai de retour avec montée en charge : {Math.round(paramsRenta.montee1 * 100)} % du CA le 1er mois,
                      {' '}{Math.round(paramsRenta.montee6 * 100)} % le 6e, 100 % à partir du 12e.
                    </div>
                  </details>
                </>
              )}
            </div>
          )}

          {jum && (
            <div style={{ ...carte, padding: '13px 14px' }}>
              <div style={{ ...surtitre, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="store" size={13} />Magasins jumeaux</div>
              <div style={{ fontSize: '12.5px', color: C.body, margin: '6px 0 4px', lineHeight: 1.5 }}>
                Ce site ressemble à <b style={{ color: C.text }}>{jum.jumeaux.map((j) => j.nom).join(', ').replace(/, ([^,]*)$/, ' et $1')}</b>.
              </div>
              {jum.jumeaux.map((j) => (
                <div key={j.id} style={{ borderTop: '1px solid ' + C.line, padding: '8px 0 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.nom}</span>
                    <span className="num" style={{ fontSize: '12.5px', fontWeight: 700, color: C.text }}>{fmt(j.ca)} TND</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <div style={{ flex: 1, height: '4px', borderRadius: '4px', background: '#eef0f4', overflow: 'hidden' }}>
                      <div style={{ width: j.ressemblance + '%', height: '100%', borderRadius: '4px', background: j.ressemblance >= 75 ? C.success : j.ressemblance >= 50 ? C.brand : C.warning }} />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' }}>ressemblance {j.ressemblance} %</span>
                  </div>
                  <div style={{ fontSize: '11px', color: C.muted, marginTop: '3px' }}>
                    {[nomType(j.type_id), `${fmt(j.profil.surface)} m²`, `${fmt(j.profil.pop1)} hab. à 1 km`, `${fmt(j.profil.pop3)} à 3 km`].filter(Boolean).join(' · ')}
                    {Math.round(j.caAjuste) !== Math.round(j.ca) ? ` · ${fmt(j.caAjuste)} TND à votre surface` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Carte
              icon="split"
              titre="Cannibalisation"
              valeur={<span style={{ color: niveau.color }}>{Math.round(tauxCannib * 100)} %</span>}
              detail={huff && res.transfert > 0 ? `${fmt(res.transfert)} TND/mois pris à vos points voisins`
                : res.plusProche ? `PDV le plus proche à ${km(res.plusProche.distance)}` : 'Aucun PDV validé'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div style={{ flex: 1, height: '5px', borderRadius: '5px', background: '#eef0f4', overflow: 'hidden' }}>
                  <div style={{ width: Math.max(3, Math.min(100, tauxCannib * 100)) + '%', height: '100%', borderRadius: '5px', background: niveau.color }} />
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: niveau.color }}>{niveau.label}</span>
              </div>
            </Carte>
            <Carte
              icon="users"
              titre="Population"
              valeur={res.population != null ? `${fmt(res.population)}` : '—'}
              detail={res.population == null ? 'Données de population indisponibles'
                : [res.menages != null ? `${fmt(res.menages)} ménages` : null, `${fmt(res.densite)} hab./km²`,
                  res.sourcePopulation === 'gouvernorat' ? 'moyenne du gouvernorat' : null].filter(Boolean).join(' · ')}
            />
            <Carte
              icon="store"
              titre="Concurrents"
              valeur={res.concurrentsZone.length}
              couleur={res.concurrentsZone.length ? C.danger : C.text}
              detail={res.plusProcheConcurrent ? `Le plus proche à ${km(res.plusProcheConcurrent.distance)}` : 'Aucun concurrent saisi'}
            />
            <Carte
              icon="chart"
              titre="Revenu moyen"
              valeur={res.revenu != null ? <>{fmt(res.revenu)} <span style={{ fontSize: '12px', color: C.muted, fontWeight: 600 }}>TND</span></> : '—'}
              detail={res.revenu != null ? `Gouvernorat · ${res.delegations} délégations` : 'Non disponible'}
            />
          </div>

          {res.sourceCA !== 'ventes' && champsDispo.length > 1 && (
            <div>
              <label style={labelStyle}>Champ utilisé comme CA</label>
              <select value={cleCA} onChange={(e) => setCleCA(e.target.value)} style={inputStyle}>
                {champsDispo.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
              </select>
            </div>
          )}

          {res.caEstime == null && (
            <Message type="ok">
              Pour estimer le CA, importez vos ventes dans l’onglet « Ventes » (export Excel de votre ERP), ou ajoutez un champ « Nombre » « CA mensuel » à vos points.
            </Message>
          )}

          {res.reseauProches.length > 0 && (
            <div style={{ ...carte, padding: '12px 14px' }}>
              <div style={{ ...surtitre, marginBottom: '6px' }}>Vos points qui partagent la zone</div>
              {res.reseauProches.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '5px 0', borderTop: '1px solid ' + C.line, color: C.body }}>
                  <span>{p.nom}</span><span className="num" style={{ color: C.muted }}>{km(p.distance)}</span>
                </div>
              ))}
            </div>
          )}

          <details style={{ fontSize: '11.5px', color: C.muted }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: C.body }}>Méthode de calcul</summary>
            <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
              Zone : cercle de {km(rayonKm)} autour du point (à vol d’oiseau). Population : habitants des carrés de 250 m de la grille
              High Resolution Settlement Layer (Meta et CIESIN, licence CC BY 4.0). Ménages : population ÷ taille moyenne des ménages du gouvernorat (INS).
              {huff ? (
                <>
                  {' '}CA : chaque carré de 250 m partage ses habitants entre tous les points à moins de {km(rayonKm)} (les vôtres, les concurrents
                  et le point étudié), au prorata de surface^α ÷ distance^β. Le CA de vos points (moyenne des 12 derniers mois de ventes,
                  sinon le champ choisi) est comparé à leurs habitants captés^γ ; on retient le rapport médian, appliqué au point étudié.
                  Réglage utilisé : α = {fmtReglage(calib ? calib.reglage.alpha : REGLAGE_DEFAUT.alpha)} (poids de la surface),
                  β = {fmtReglage(calib ? calib.reglage.beta : REGLAGE_DEFAUT.beta)} (effet de la distance),
                  γ = {fmtReglage(calib ? calib.reglage.gamma : REGLAGE_DEFAUT.gamma)} (rendement des habitants : sous 1, chaque habitant de plus
                  rapporte un peu moins). Ces valeurs sont choisies automatiquement parmi 64 combinaisons, celle qui donne le plus petit
                  écart au test sur vos ventes ; avec moins de 8 points testés, on garde α = 1, β = 2, γ = 1. Cannibalisation : CA que le point étudié prend à vos points voisins, en part de son CA.
                  Surface inconnue : surface médiane de vos points.
                  {jum && (
                    <>
                      {' '}Magasins jumeaux : on compare le site à vos points sur les habitants à 1 km et à 3 km, les m² concurrents pour
                      1 000 habitants dans la zone, la surface et le type d’exploitation{testJ.passage ? ', ainsi que le passage' : ''}, puis on retient les {NB_JUMEAUX} plus ressemblants.
                      Leur CA, ajusté de l’écart de surface (exposant {fmtReglage(testJ.theta)}, choisi sur vos ventes), est moyenné en donnant
                      plus de poids aux plus ressemblants. Le CA affiché est la moyenne des deux méthodes.
                    </>
                  )}
                  {marche && (
                    <>
                      {' '}Potentiel de marché : habitants de la zone × dépense mensuelle par habitant du secteur
                      {depense.saisie ? ' (valeur saisie par votre administrateur)' : depense.secteur ? ` (INS, enquête budget des ménages 2021 : ${depense.secteur.postes})` : ''}
                      {' '}× niveau de dépense de la région rapporté à la moyenne nationale (INS 2021, 5 468 TND par personne et par an).
                      Part captée : CA estimé ÷ potentiel. Pression concurrentielle : m² de vente des concurrents à moins de {km(rayonKm)} pour
                      1 000 habitants (surface inconnue : médiane des concurrents saisis).
                    </>
                  )}
                  {' '}Fiabilité : chacun de vos points ayant un CA connu est retiré à son tour et estimé à partir des autres ;
                  l’écart médian avec ses ventes réelles mesure la précision du modèle sur votre réseau. La fourchette couvre 80 % des écarts
                  observés{jum ? ', élargie pour contenir le CA de chaque méthode' : ''}. Note A : au moins 15 points testés, écart médian sous 15 %{jum ? ', 3 jumeaux ressemblants à 75 % et plus, méthodes à moins de 10 % d’écart' : ''} ; B : 8 points et 25 %{jum ? ', méthodes à moins de 20 %' : ''} ; C : au-delà ;
                  D : moins de 5 points, pas de chiffre. Le site doit aussi avoir une densité de population proche de celles de votre réseau.
                </>
              ) : (
                <>
                  {' '}Cannibalisation : part de la zone déjà à moins de {km(rayonKm)} d’un de vos points validés.
                  CA : médiane du CA mensuel de vos points validés × (1 − cannibalisation ÷ 2).
                </>
              )}
              {passage && (
                <>
                  {' '}Passage : lieux qui attirent du monde (gares et louages, marchés, grandes surfaces, universités, écoles, mosquées,
                  santé, administrations et banques, cafés et restaurants), recensés par Overture Maps Foundation (version d’octobre 2026,
                  licences CDLA et ODbL). Chaque lieu compte selon son poids (3 pour une gare, un marché ou une grande surface, 2 pour une
                  université, 1,5 pour une mosquée ou un hôpital, 1 pour une école ou une administration, 0,3 pour un café), atténué avec
                  la distance (moitié du poids à 250 m, quasi nul à 600 m). L’indice sur 100 situe ce score par rapport aux habitants de
                  toute la Tunisie. Le recensement est incomplet, surtout hors des villes (mosquées et écoles de quartier en particulier) :
                  il sert à comparer des emplacements, pas à compter les lieux.
                </>
              )}
            </p>
          </details>

          <button type="button" onClick={onAjouter} style={btn()}>
            <Icon name="plus" size={16} /> Enregistrer un point à cet emplacement
          </button>
        </>
      )}
    </div>
  );
}
