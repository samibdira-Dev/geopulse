'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { traduireErreur } from '../lib/points';
import { inputStyle, labelStyle, btn, ghostBtn, Message } from './ui';

// Affiché quand le compte n'appartient encore à aucune société.
export default function SocieteSetup({ email, onCreated, onSignOut }) {
  const [nom, setNom] = useState('');
  const [secteur, setSecteur] = useState('');
  const [moi, setMoi] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('creer_societe', {
      p_nom: nom,
      p_secteur: secteur || null,
      p_nom_affiche: moi || null,
    });
    setBusy(false);
    if (err) {
      setError(traduireErreur(err));
      return;
    }
    onCreated();
  };

  return (
    <main className="gp-backdrop" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '440px', background: 'white', borderRadius: '20px', padding: '32px', boxSizing: 'border-box', boxShadow: '0 30px 80px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 700, letterSpacing: '-.02em', color: '#0f172a' }}>Bienvenue sur GeoPulse</h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
            Connecté en tant que <b>{email}</b>. Ce compte n’appartient encore à aucune société.
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>Créer ma société (vous en serez l’administrateur)</div>
          <div>
            <label style={labelStyle}>Nom de la société *</label>
            <input required value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : SOPAT" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Secteur d’activité</label>
            <input value={secteur} onChange={(e) => setSecteur(e.target.value)} placeholder="Ex : Agroalimentaire, pharmacie, café…" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Votre nom (affiché à vos collègues)</label>
            <input value={moi} onChange={(e) => setMoi(e.target.value)} placeholder="Ex : Sami" style={inputStyle} />
          </div>
          {error && <Message>{error}</Message>}
          <button type="submit" disabled={busy || !nom.trim()} style={btn(undefined, busy || !nom.trim())}>
            {busy ? 'Création…' : 'Créer ma société'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid #e7e9f0', paddingTop: '12px', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
          Vous rejoignez une société existante ? Donnez cet e-mail à son administrateur : <b>{email}</b>.
          Il vous ajoutera depuis l’onglet « Équipe », puis rechargez cette page.
        </div>

        <button type="button" onClick={onSignOut} style={ghostBtn}>Se déconnecter</button>
      </div>
    </main>
  );
}
