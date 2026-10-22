'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { traduireErreur } from '../lib/points';
import { btn, ghostBtn, inputStyle, Message, SectionTitle } from './ui';

// Réservé aux managers et administrateurs : points « à valider ».
export default function ValidationPanel({ points, typesById, champsByType, auteurs, onFocus, onChanged }) {
  const aValider = points.filter((p) => p.statut === 'a_valider');
  const [rejetId, setRejetId] = useState(null);
  const [motif, setMotif] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const traiter = async (point, statut, commentaire) => {
    setBusyId(point.id);
    setMessage(null);
    const maj = { statut };
    if (commentaire !== undefined) maj.commentaire_validation = commentaire;
    const { data, error } = await supabase
      .from('points')
      .update(maj)
      .eq('id', point.id)
      .eq('statut', 'a_valider')
      .select('id');
    setBusyId(null);
    if (error) {
      setMessage({ type: 'err', text: traduireErreur(error) });
      return;
    }
    if (!data || data.length === 0) {
      setMessage({ type: 'err', text: 'Ce point a déjà été traité par quelqu’un d’autre.' });
    } else {
      setMessage({ type: 'ok', text: statut === 'valide' ? `« ${point.nom} » est validé.` : `« ${point.nom} » est rejeté.` });
      setRejetId(null);
      setMotif('');
    }
    onChanged();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionTitle icon="checkCircle" title={`À valider (${aValider.length})`}>
        Vérifiez la position et les informations, puis validez ou rejetez avec un motif.
      </SectionTitle>

      {message && <Message type={message.type}>{message.text}</Message>}

      {aValider.length === 0 && (
        <div style={{ border: '1px dashed #d5d9e3', borderRadius: '12px', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          Aucun point en attente de validation.
        </div>
      )}

      {aValider.map((p) => {
        const type = typesById[p.type_id];
        const champs = champsByType[p.type_id] || [];
        const donnees = p.donnees || {};
        const enCours = busyId === p.id;
        return (
          <div key={p.id} style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: '12px', padding: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: type ? type.couleur : '#94a3b8', marginRight: '6px' }} />
              {p.nom}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {type ? type.nom : 'Type inconnu'} · {[p.delegation, p.gouvernorat].filter(Boolean).join(' · ') || 'zone non renseignée'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Proposé par {auteurs[p.cree_par] || 'un membre'} · position {p.source_position === 'gps' ? 'GPS' : p.source_position === 'pin_manuel' ? 'posée à la main' : p.source_position}
              {p.precision_m != null ? ` (±${Math.round(p.precision_m)} m)` : ''}
            </div>

            <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr', gap: '2px' }}>
              {champs.map((c) => {
                const v = donnees[c.cle];
                if (v === undefined || v === null || v === '') return null;
                return (
                  <div key={c.id} style={{ fontSize: '12px', color: '#334155' }}>
                    <b>{c.libelle} :</b> {typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v)}
                  </div>
                );
              })}
            </div>

            {rejetId === p.id ? (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  rows={2}
                  placeholder="Motif du rejet (obligatoire) : ex. position à corriger"
                  style={{ ...inputStyle, marginTop: 0, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={enCours || !motif.trim()}
                    onClick={() => traiter(p, 'rejete', motif.trim())}
                    style={btn('#dc2626', enCours || !motif.trim())}
                  >
                    Confirmer le rejet
                  </button>
                  <button type="button" onClick={() => { setRejetId(null); setMotif(''); }} style={ghostBtn}>Annuler</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button type="button" disabled={enCours} onClick={() => traiter(p, 'valide')} style={btn('#059669', enCours)}>✅ Valider</button>
                <button type="button" disabled={enCours} onClick={() => { setRejetId(p.id); setMotif(''); }} style={btn('#dc2626', enCours)}>❌ Rejeter</button>
                <button type="button" onClick={() => onFocus(p)} style={ghostBtn}>🗺 Voir sur la carte</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
