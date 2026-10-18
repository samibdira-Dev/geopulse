'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLES, traduireErreur } from '../lib/points';
import { btn, ghostBtn, inputStyle, labelStyle, Message } from './ui';

// Réservé aux administrateurs : gérer les membres de la société.
export default function TeamPanel({ societeId, membres, userId, onChanged }) {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [role, setRole] = useState('commercial');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const ajouter = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('ajouter_membre', {
      p_societe: societeId,
      p_email: email,
      p_role: role,
      p_nom_affiche: nom || null,
    });
    setBusy(false);
    if (error) {
      setMessage({ type: 'err', text: traduireErreur(error) });
      return;
    }
    setMessage({ type: 'ok', text: 'Membre ajouté.' });
    setEmail('');
    setNom('');
    onChanged();
  };

  const changerRole = async (membre, nouveauRole) => {
    setMessage(null);
    const { data, error } = await supabase
      .from('membres')
      .update({ role: nouveauRole })
      .eq('user_id', membre.user_id)
      .eq('societe_id', societeId)
      .select('user_id');
    if (error) setMessage({ type: 'err', text: traduireErreur(error) });
    else if (!data || data.length === 0) setMessage({ type: 'err', text: 'Modification refusée.' });
    onChanged();
  };

  const retirer = async (membre) => {
    if (!window.confirm(`Retirer ${membre.nom_affiche || 'ce membre'} de la société ?`)) return;
    setMessage(null);
    const { data, error } = await supabase
      .from('membres')
      .delete()
      .eq('user_id', membre.user_id)
      .eq('societe_id', societeId)
      .select('user_id');
    if (error) setMessage({ type: 'err', text: traduireErreur(error) });
    else if (!data || data.length === 0) setMessage({ type: 'err', text: 'Suppression refusée.' });
    onChanged();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>🧑‍🤝‍🧑 Équipe ({membres.length})</h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
          Le commercial propose des points ; le manager les valide ; l’administrateur gère l’équipe.
        </p>
      </div>

      {message && <Message type={message.type}>{message.text}</Message>}

      {membres.map((m) => (
        <div key={m.user_id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e293b' }}>
            {m.nom_affiche || `Membre ${m.user_id.slice(0, 6)}`}{m.user_id === userId ? ' (moi)' : ''}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select value={m.role} onChange={(e) => changerRole(m, e.target.value)} style={{ padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" onClick={() => retirer(m)} style={{ ...ghostBtn, color: '#b91c1c' }} title="Retirer de la société">✕</button>
          </div>
        </div>
      ))}

      <form onSubmit={ajouter} style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>Ajouter un membre</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          La personne doit d’abord créer son compte sur la page de connexion, avec cet e-mail.
        </div>
        <div>
          <label style={labelStyle}>E-mail *</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>Nom affiché</label>
            <input value={nom} onChange={(e) => setNom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rôle</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" disabled={busy || !email.trim()} style={btn('#2563eb', busy || !email.trim())}>
          {busy ? 'Ajout…' : 'Ajouter à la société'}
        </button>
      </form>
    </div>
  );
}
