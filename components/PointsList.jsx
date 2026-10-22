'use client';
import { useMemo, useState } from 'react';
import { STATUTS, peutModifier } from '../lib/points';
import { StatutBadge, ghostBtn, SectionTitle, chip, inputStyle, Empty } from './ui';

const PAGE = 200;

export default function PointsList({ points, typesById, auteurs, userId, role, onFocus, onEdit, onDelete }) {
  const [statut, setStatut] = useState('tous');
  const [portee, setPortee] = useState('tous');
  const [recherche, setRecherche] = useState('');
  // Affichage par tranches : une liste de plusieurs milliers de fiches ralentirait l'écran.
  const [limite, setLimite] = useState(PAGE);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return points.filter((p) => {
      if (statut !== 'tous' && p.statut !== statut) return false;
      if (portee === 'miens' && p.cree_par !== userId) return false;
      if (q && !`${p.nom} ${p.code_externe || ''} ${p.gouvernorat || ''} ${p.delegation || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [points, statut, portee, recherche, userId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionTitle icon="list" title={`Points (${filtres.length})`}>
        Cliquez sur un point pour le retrouver sur la carte.
      </SectionTitle>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un nom, un code client, un quartier…"
        style={{ ...inputStyle, marginTop: 0 }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <button type="button" onClick={() => setPortee('tous')} style={chip(portee === 'tous')}>Tous</button>
        <button type="button" onClick={() => setPortee('miens')} style={chip(portee === 'miens')}>Mes points</button>
        <span style={{ width: '1px', background: '#e7e9f0' }} />
        <button type="button" onClick={() => setStatut('tous')} style={chip(statut === 'tous')}>Tous statuts</button>
        {Object.entries(STATUTS).map(([k, s]) => (
          <button key={k} type="button" onClick={() => setStatut(k)} style={chip(statut === k)}>{s.label}</button>
        ))}
      </div>

      {filtres.length === 0 && (
        <Empty icon="search">Aucun point ne correspond.</Empty>
      )}

      {filtres.slice(0, limite).map((p) => {
        const type = typesById[p.type_id];
        const modifiable = peutModifier(p, role, userId);
        return (
          <div key={p.id} className="gp-row" style={{ border: '1px solid #e7e9f0', borderRadius: '14px', padding: '12px 14px', background: 'white', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}>
            <div
              onClick={() => onFocus(p)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>
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
                <button type="button" onClick={() => onEdit(p)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: '11.5px' }}>Modifier</button>
                {(role === 'admin' || role === 'manager' || ['brouillon', 'rejete'].includes(p.statut)) && (
                  <button type="button" onClick={() => onDelete(p)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: '11.5px', color: '#b91c1c', borderColor: '#fecaca' }}>Supprimer</button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {filtres.length > limite && (
        <button type="button" onClick={() => setLimite(limite + PAGE)} style={{ ...ghostBtn, justifyContent: 'center', padding: '10px' }}>
          Afficher {Math.min(PAGE, filtres.length - limite)} points de plus ({(filtres.length - limite).toLocaleString('fr-FR')} restants)
        </button>
      )}
    </div>
  );
}
