'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { traduireErreur } from '../lib/points';
import { inputStyle, labelStyle, btn, Message } from './ui';

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
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: 'system-ui, sans-serif', padding: '16px' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: '380px', background: 'white', borderRadius: '12px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
        <div>
          <span style={{ background: '#3b82f6', color: 'white', padding: '5px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}>GeoPulse SaaS</span>
          <h1 style={{ margin: '14px 0 4px', fontSize: '20px', color: '#0f172a' }}>
            {mode === 'connexion' ? 'Connexion' : 'Créer un compte'}
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Plateforme géomarketing : chaque société accède uniquement à ses propres données.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Adresse e-mail</label>
          <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
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

        <button type="submit" disabled={busy} style={btn('#2563eb', busy)}>
          {busy ? 'Veuillez patienter…' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'connexion' ? 'inscription' : 'connexion'); setMsg(null); }}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px' }}
        >
          {mode === 'connexion' ? 'Pas encore de compte ? Créer un compte' : 'J’ai déjà un compte : me connecter'}
        </button>
      </form>
    </main>
  );
}
