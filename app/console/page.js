'use client';
import { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import LoginScreen from '../../components/LoginScreen';
import ConsolePlateforme from '../../components/ConsolePlateforme';
import { C, Message, btn, ghostBtn } from '../../components/ui';
import { Logo } from '../../components/icons';

// Console de l'administrateur de la plateforme GeoPulse : validation des nouvelles sociétés et suivi des clients.
export default function ConsolePage() {
  const [session, setSession] = useState(undefined);
  const [autorise, setAutorise] = useState(undefined);
  const userId = session ? session.user.id : null;

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession((cur) => (cur && s && cur.user.id === s.user.id ? cur : s || null)));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) { setAutorise(undefined); return; }
    supabase.rpc('est_plateforme_admin').then(({ data, error }) => setAutorise(!error && data === true));
  }, [userId]);

  const deconnexion = () => supabase.auth.signOut();

  if (!supabaseConfigured) return <main style={{ padding: '24px' }}><Message>Supabase n’est pas configuré.</Message></main>;
  if (session === undefined || (session && autorise === undefined)) return <Attente texte="Chargement…" />;
  if (!session) return <LoginScreen />;
  if (!autorise) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center' }}>
          <Logo size={44} />
          <h1 style={{ margin: 0, fontSize: '20px', color: C.text }}>Accès réservé</h1>
          <p style={{ margin: 0, color: C.muted, fontSize: '13.5px', lineHeight: 1.6 }}>
            Cette console est réservée à l’équipe GeoPulse. Le compte <b>{session.user.email}</b> n’y a pas accès.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <a href="/pro" style={{ ...btn(), textDecoration: 'none' }}>Ouvrir l’application</a>
            <button type="button" onClick={deconnexion} style={ghostBtn}>Se déconnecter</button>
          </div>
        </div>
      </main>
    );
  }
  return <ConsolePlateforme session={session} onSignOut={deconnexion} />;
}

function Attente({ texte }) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: C.muted, fontSize: '13px' }}>
      <Logo size={48} />
      {texte}
    </main>
  );
}
