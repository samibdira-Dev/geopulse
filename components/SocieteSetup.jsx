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
          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>Demander l’ouverture de ma société</div>
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
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
            L’équipe GeoPulse valide chaque nouvelle société avant son ouverture. Vous en serez l’administrateur.
          </div>
          {error && <Message>{error}</Message>}
          <button type="submit" disabled={busy || !nom.trim()} style={btn(undefined, busy || !nom.trim())}>
            {busy ? 'Envoi…' : 'Envoyer ma demande'}
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

const ETATS = {
  en_attente: {
    titre: 'Demande en cours de validation',
    texte: 'Votre demande d’ouverture a bien été reçue. L’équipe GeoPulse la vérifie et vous contacte pour activer votre espace.',
    couleur: '#d97706', fond: '#fffbeb',
  },
  suspendue: {
    titre: 'Accès suspendu',
    texte: 'L’accès de cette société à GeoPulse est suspendu. Vos données sont conservées. Contactez l’équipe GeoPulse pour le rétablir.',
    couleur: '#dc2626', fond: '#fef2f2',
  },
  refusee: {
    titre: 'Demande non retenue',
    texte: 'Cette demande d’ouverture n’a pas été retenue. Contactez l’équipe GeoPulse pour en savoir plus.',
    couleur: '#64748b', fond: '#f1f5f9',
  },
};

// Affiché tant que la société n'est pas active (en attente de validation, suspendue ou refusée).
export function SocieteEnAttente({ societe, email, memberships, onChoisir, onRecharger, onSignOut }) {
  const e = ETATS[societe.statut] || ETATS.en_attente;
  const autres = (memberships || []).filter((m) => m.societe_id !== societe.id);
  return (
    <main className="gp-backdrop" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '440px', background: 'white', borderRadius: '20px', padding: '32px', boxSizing: 'border-box', boxShadow: '0 30px 80px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <span style={{ alignSelf: 'flex-start', background: e.fond, color: e.couleur, padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>{e.titre}</span>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, letterSpacing: '-.02em', color: '#0f172a' }}>{societe.nom}</h1>
        <p style={{ margin: 0, fontSize: '13.5px', color: '#475569', lineHeight: 1.6 }}>{e.texte}</p>
        <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>Connecté en tant que <b>{email}</b>.</p>
        <button type="button" onClick={onRecharger} style={btn()}>Vérifier à nouveau</button>
        {autres.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={labelStyle}>Ouvrir une autre société</div>
            {autres.map((m) => (
              <button key={m.societe_id} type="button" onClick={() => onChoisir(m.societe_id)} style={{ ...ghostBtn, justifyContent: 'center', padding: '10px 12px' }}>{m.societes ? m.societes.nom : m.societe_id}</button>
            ))}
          </div>
        )}
        <button type="button" onClick={onSignOut} style={{ ...ghostBtn, justifyContent: 'center', padding: '10px 12px' }}>Se déconnecter</button>
      </div>
    </main>
  );
}
