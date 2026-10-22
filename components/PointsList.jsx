'use client';
import { useMemo, useState } from 'react';
import { STATUTS, peutModifier } from '../lib/points';
import { StatutBadge, ghostBtn } from './ui';

export default function PointsList({ points, typesById, auteurs, userId, role, onFocus, onEdit, onDelete }) {
  const [statut, setStatut] = useState('tous');
  const [portee, setPortee] = useState('tous');
  const [recherche, setRecherche] = useState('');

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return points.filter((p) => {
      if (statut !== 'tous' && p.statut !== statut) return false;
      if (portee === 'miens' && p.cree_par !== userId) return false;
      if (q && !`${p.nom} ${p.code_externe || ''} ${p.gouvernorat || ''} ${p.delegation || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [points, statut, portee, recherche, userId]);

  const chip = (actif) => ({
    padding: '4px 10px',
    borderRadius: '14px',
    border: '1px solid ' + (actif ? '#2563eb' : '#cbd5e1'),
    background: actif ? '#dbeafe' : 'white',
    color: actif ? '#1d4ed8' : '#475569',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>📋 Points ({filtres.length})</h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
          Cliquez sur un point pour le retrouver sur la carte.
        </p>
      </div>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un nom, un code client, un quartier…"
        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <button type="button" onClick={() => setPortee('tous')} style={chip(portee === 'tous')}>Tous</button>
        <button type="button" onClick={() => setPortee('miens')} style={chip(portee === 'miens')}>Mes points</button>
        <span style={{ width: '1px', background: '#e2e8f0' }} />
        <button type="button" onClick={() => setStatut('tous')} style={chip(statut === 'tous')}>Tous statuts</button>
        {Object.entries(STATUTS).map(([k, s]) => (
          <button key={k} type="button" onClick={() => setStatut(k)} style={chip(statut === k)}>{s.label}</button>
        ))}
      </div>

      {filtres.length === 0 && (
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          Aucun point ne correspond.
        </div>
      )}

      {filtres.map((p) => {
        const type = typesById[p.type_id];
        const modifiable = peutModifier(p, role, userId);
        return (
          <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
            <div
              onClick={() => onFocus(p)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: type ? type.couleur : '#94a3b8', marginRight: '6px' }} />
                  {p.nom}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {type ? type.nom : 'Type inconnu'} · {[p.delegation, p.gouvernorat].filter(Boolean).join(' · ') || 'zone non renseignée'}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  par {p.cree_par === userId ? 'moi' : (auteurs[p.cree_par] || 'un membre')}
                </div>
              </div>
              <StatutBadge statut={p.statut} />
            </div>

            {p.statut === 'rejete' && p.commentaire_validation && (
              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '6px' }}>Motif du rejet : {p.commentaire_validation}</div>
            )}

            {modifiable && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button type="button" onClick={() => onEdit(p)} style={ghostBtn}>✏️ Modifier</button>
                {(role === 'admin' || role === 'manager' || ['brouillon', 'rejete'].includes(p.statut)) && (
                  <button type="button" onClick={() => onDelete(p)} style={{ ...ghostBtn, color: '#b91c1c' }}>🗑 Supprimer</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
