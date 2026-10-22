'use client';
import { useEffect, useMemo, useState } from 'react';
import { champsCA, simuler } from '../lib/simulation';
import { chargerGrille } from '../lib/population';
import { fourchette, noteConfiance, testerModele } from '../lib/fiabilite';
import { C, Empty, Message, SectionTitle, btn, carte, inputStyle, labelStyle, surtitre } from './ui';
import Icon from './icons';

const RAYONS = [0.5, 1, 2, 3, 5];
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

  // Surface du point simulé (m²) : vide = surface médiane de vos points.
  const [surfaceSaisie, setSurfaceSaisie] = useState('');

  const res = useMemo(
    () => (position ? simuler({ position, rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA, surfaceNouveau: surfaceSaisie }) : null),
    [position, rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA, surfaceSaisie]
  );

  // Test « un magasin caché » : ne dépend pas de l'emplacement étudié, recalculé quand les données ou le rayon changent.
  // Lancé après l'affichage pour ne pas bloquer le simulateur sur un grand réseau.
  const [test, setTest] = useState(undefined);
  useEffect(() => {
    setTest(undefined);
    if (!grille) return undefined;
    const t = setTimeout(() => setTest(testerModele({ rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA })), 50);
    return () => clearTimeout(t);
  }, [rayonKm, points, typesById, champs, demographie, surfaces, grille, ventes, cleCA]);
  const confiance = res && test !== undefined ? noteConfiance(test, res) : null;
  const plage = confiance && confiance.note !== 'D' ? fourchette(test, res.caEstime) : null;
  const masque = confiance && confiance.note === 'D' && res.caEstime != null;

  const huff = res && res.methodeCA === 'huff';
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

      {!position && (
        <Empty icon="crosshair">Aucun emplacement sélectionné.<br />Cliquez sur la carte pour lancer l’étude.</Empty>
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
              {res.caEstime != null && !masque ? fmt(res.caEstime) : '—'}<span style={{ fontSize: '15px', fontWeight: 600, color: '#c7d2fe', marginLeft: '6px' }}>TND</span>
            </div>
            {plage && (
              <div className="num" style={{ fontSize: '12.5px', color: '#e0e7ff', fontWeight: 500 }}>
                Probablement entre <b>{fmt(plage.bas)}</b> et <b>{fmt(plage.haut)}</b> TND
              </div>
            )}
            <div style={{ fontSize: '11.5px', color: '#c7d2fe', lineHeight: 1.5, marginTop: '4px', maxWidth: '300px' }}>
              {huff
                ? [res.caParM2 != null ? `${fmt(res.caParM2)} TND/m²` : null, `${fmt(res.habitantsCaptes)} habitants captés`,
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
                      ? `Modèle testé sur ${test.n} de vos points : écart médian de ${Math.round(test.erreurMediane * 100)} % entre estimation et ventes réelles`
                      : 'Pas assez de points avec un CA connu pour tester le modèle'}
                  </div>
                </div>
              </div>
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
                  et le point étudié), au prorata de la surface (m²) ÷ distance². Le CA mensuel par habitant capté est mesuré sur vos points
                  (moyenne des 12 derniers mois de ventes, sinon le champ choisi) ; on retient la médiane, multipliée par les habitants captés
                  par le point étudié. Cannibalisation : CA que le point étudié prend à vos points voisins, en part de son CA.
                  Surface inconnue : surface médiane de vos points.
                  {' '}Fiabilité : chacun de vos points ayant un CA connu est retiré à son tour et estimé à partir des autres ;
                  l’écart médian avec ses ventes réelles mesure la précision du modèle sur votre réseau. La fourchette couvre 80 % des écarts
                  observés. Note A : au moins 15 points testés et écart médian sous 15 % ; B : 8 points et 25 % ; C : au-delà ;
                  D : moins de 5 points, pas de chiffre. Le site doit aussi avoir une densité de population proche de celles de votre réseau.
                </>
              ) : (
                <>
                  {' '}Cannibalisation : part de la zone déjà à moins de {km(rayonKm)} d’un de vos points validés.
                  CA : médiane du CA mensuel de vos points validés × (1 − cannibalisation ÷ 2).
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
