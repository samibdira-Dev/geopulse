'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { traduireErreur } from '../lib/points';
import { inputStyle, labelStyle, btn, Message } from './ui';
import Icon, { Logo } from './icons';

export default function LoginScreen() {
  const [mode, setMode] = useState('connexion');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'connexion') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setMsg({ type: 'err', text: traduireErreur(error) });
        // en cas de succès, l'application détecte la session et affiche la carte
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) {
          setMsg({ type: 'err', text: traduireErreur(error) });
        } else if (!data.session) {
          setMsg({ type: 'ok', text: 'Compte créé. Ouvrez le message de confirmation reçu par e-mail, puis connectez-vous.' });
          setMode('connexion');
        }
      }
    } catch (err) {
      setMsg({ type: 'err', text: traduireErreur(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gp-backdrop gp-login" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '72px', padding: '24px', boxSizing: 'border-box' }}>
      <div className="gp-login-pitch" style={{ maxWidth: '440px', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo size={44} />
          <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.02em' }}>GeoPulse</span>
        </div>
        <h2 style={{ fontSize: '38px', lineHeight: 1.1, letterSpacing: '-.03em', fontWeight: 800, margin: '36px 0 14px' }}>
          Le géomarketing de précision pour la Tunisie.
        </h2>
        <p style={{ color: '#a5b4fc', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
          Cartographiez votre réseau, mesurez vos zones de chalandise et estimez le chiffre d’affaires d’un nouvel emplacement avant d’investir.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '32px' }}>
          {[['target', 'Simulation de CA par emplacement'], ['users', 'Population au carré de 250 m'], ['chart', 'Ventes ERP reliées à chaque point']].map(([i, t]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#e0e7ff', fontSize: '14px' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(129,140,248,.16)', color: '#c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={i} size={16} /></span>
              {t}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: '400px', background: 'white', borderRadius: '20px', padding: '34px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 700, letterSpacing: '-.02em', color: '#0f172a' }}>
            {mode === 'connexion' ? 'Bon retour' : 'Créer un compte'}
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
            {mode === 'connexion' ? 'Connectez-vous à l’espace de votre société.' : 'Chaque société accède uniquement à ses propres données.'}
          </p>
        </div>

        <div>
          <label style={labelStyle}>Adresse e-mail</label>
          <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@societe.tn" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Mot de passe</label>
          <input
            required
            type="password"
            minLength={6}
            autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          {mode === 'inscription' && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>6 caractères minimum.</div>}
        </div>

        {msg && <Message type={msg.type}>{msg.text}</Message>}

        <button type="submit" disabled={busy} style={{ ...btn(undefined, busy), padding: '13px 14px', fontSize: '14px' }}>
          {busy ? 'Veuillez patienter…' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'connexion' ? 'inscription' : 'connexion'); setMsg(null); }}
          style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
        >
          {mode === 'connexion' ? 'Pas encore de compte ? Créer un compte' : 'J’ai déjà un compte : me connecter'}
        </button>
      </form>
    </main>
  );
}
