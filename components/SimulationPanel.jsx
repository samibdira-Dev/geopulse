'use client';
import { useEffect, useMemo, useState } from 'react';
import { champsCA, simuler } from '../lib/simulation';
import { chargerGrille } from '../lib/population';
import { Message, labelStyle, inputStyle } from './ui';

const RAYONS = [0.5, 1, 2, 3, 5];
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR'));
const km = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${(Math.round(d * 10) / 10).toLocaleString('fr-FR')} km`);

function Carte({ titre, valeur, detail, couleur = '#0f172a', fond = 'white' }) {
  return (
    <div style={{ background: fond, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
      <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>{titre}</div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: couleur, marginTop: '2px' }}>{valeur}</div>
      {detail && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{detail}</div>}
    </div>
  );
}

// Simulateur d'emplacement : population de la zone, cannibalisation, concurrence et CA estimé.
export default function SimulationPanel({ position, rayonKm, onRayon, points, typesById, champs, demographie, surfaces, onAjouter }) {
  const typesPdv = useMemo(() => Object.values(typesById).filter((t) => t.categorie === 'point_de_vente').map((t) => t.id), [typesById]);
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

  const res = useMemo(
    () => (position ? simuler({ position, rayonKm, points, typesById, demographie, surfaces, grille, cleCA }) : null),
    [position, rayonKm, points, typesById, demographie, surfaces, grille, cleCA]
  );

  const niveau = !res ? null : res.cannibalisation < 0.15
    ? { label: 'Faible', color: '#16a34a' }
    : res.cannibalisation < 0.4 ? { label: 'Moyen', color: '#d97706' } : { label: 'Élevé', color: '#dc2626' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>🎯 Simulateur d’emplacement</h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
          Cliquez sur la carte pour placer l’emplacement à étudier, puis choisissez la taille de la zone.
        </p>
      </div>

      <div>
        <label style={labelStyle}>Rayon de la zone de chalandise</label>
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
          {RAYONS.map((r) => (
            <button key={r} type="button" onClick={() => onRayon(r)} style={{ padding: '5px 10px', borderRadius: '14px', border: '1px solid ' + (r === rayonKm ? '#2563eb' : '#cbd5e1'), background: r === rayonKm ? '#dbeafe' : 'white', color: r === rayonKm ? '#1d4ed8' : '#475569', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
              {km(r)}
            </button>
          ))}
        </div>
      </div>

      {!position && (
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          Aucun emplacement sélectionné.
        </div>
      )}

      {res && (
        <>
          <div style={{ background: '#dbeafe', color: '#1e40af', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}>
            <b>{res.gouvernorat || 'Gouvernorat inconnu'}</b>{position.quartier ? ` · ${position.quartier}` : ''}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Carte
              titre="CA mensuel estimé"
              valeur={res.caEstime != null ? `${fmt(res.caEstime)} TND` : '—'}
              detail={res.caEstime != null ? `Médiane de ${res.nbValeursCA} PDV, ajustée de la cannibalisation` : 'Pas encore de CA saisi sur vos PDV'}
              couleur="#5b21b6"
              fond="#f5f3ff"
            />
            <Carte
              titre="Cannibalisation"
              valeur={<span style={{ color: niveau.color }}>{niveau.label} ({Math.round(res.cannibalisation * 100)} %)</span>}
              detail={res.plusProche ? `PDV le plus proche à ${km(res.plusProche.distance)}` : 'Aucun PDV validé'}
            />
            <Carte
              titre="Population de la zone"
              valeur={res.population != null ? `${fmt(res.population)} hab.` : '—'}
              detail={res.population == null ? 'Données de population indisponibles'
                : [res.menages != null ? `${fmt(res.menages)} ménages` : null, `${fmt(res.densite)} hab./km²`,
                  res.sourcePopulation === 'gouvernorat' ? 'moyenne du gouvernorat' : null].filter(Boolean).join(' · ')}
            />
            <Carte
              titre="Concurrents dans la zone"
              valeur={res.concurrentsZone.length}
              detail={res.plusProcheConcurrent ? `Le plus proche à ${km(res.plusProcheConcurrent.distance)}` : 'Aucun concurrent saisi'}
            />
          </div>

          {res.revenu != null && (
            <div style={{ fontSize: '12px', color: '#475569' }}>
              Revenu moyen du gouvernorat : <b>{fmt(res.revenu)} TND</b> ({res.delegations} délégations)
            </div>
          )}

          {champsDispo.length > 1 && (
            <div>
              <label style={labelStyle}>Champ utilisé comme CA</label>
              <select value={cleCA} onChange={(e) => setCleCA(e.target.value)} style={inputStyle}>
                {champsDispo.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
              </select>
            </div>
          )}

          {res.caEstime == null && (
            <Message type="ok">
              Pour estimer le CA, ajoutez un champ « Nombre » (ex. « CA mensuel ») au type « Point de vente » dans l’onglet Types, puis renseignez-le sur vos points.
            </Message>
          )}

          {res.reseauProches.length > 0 && (
            <div style={{ fontSize: '12px', color: '#334155' }}>
              <b>Vos PDV qui partagent la zone :</b>
              {res.reseauProches.map((p) => <div key={p.id}>· {p.nom} — {km(p.distance)}</div>)}
            </div>
          )}

          <details style={{ fontSize: '11px', color: '#64748b' }}>
            <summary style={{ cursor: 'pointer' }}>Méthode de calcul</summary>
            <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
              Zone : cercle de {km(rayonKm)} autour du point (à vol d’oiseau). Population : somme des habitants des carrés de
              250 m situés dans le cercle, d’après la grille High Resolution Settlement Layer (Meta et CIESIN, licence CC BY 4.0).
              Ménages : population ÷ taille moyenne des ménages du gouvernorat (INS).
              Cannibalisation : part de la zone déjà à moins de {km(rayonKm)} d’un de vos points de vente validés. CA : médiane du CA
              de vos points de vente validés × (1 − cannibalisation ÷ 2), car dans la partie déjà couverte la clientèle se partage
              entre l’ancien et le nouveau point.
            </p>
          </details>

          <button type="button" onClick={onAjouter} style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
            ➕ Enregistrer un point à cet emplacement
          </button>
        </>
      )}
    </div>
  );
}
