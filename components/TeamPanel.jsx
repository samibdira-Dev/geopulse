'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLES, traduireErreur } from '../lib/points';
import { btn, C, ghostBtn, inputStyle, labelStyle, Message, SectionTitle } from './ui';
import Icon from './icons';

// Message d'invitation, à envoyer par e-mail ou à copier (WhatsApp, SMS…).
function messageInvitation({ nom, email, code, societeNom }) {
  const adresse = window.location.origin + '/pro';
  return {
    sujet: `Invitation GeoPulse : ${societeNom || 'votre société'}`,
    texte: `Bonjour${nom ? ' ' + nom : ''},\n\nVous êtes invité(e) à rejoindre ${societeNom || 'notre société'} sur GeoPulse.\n\n`
      + `Adresse : ${adresse}\nE-mail : ${email}\nCode d'accès (mot de passe) : ${code}\n\n`
      + `Connectez-vous avec cet e-mail et ce code. Gardez ce code pour vous.`,
  };
}

// Demande au serveur (clé de service) : inviter un membre ou lui donner un nouveau code.
async function appelInvitation(corps) {
  const { data } = await supabase.auth.getSession();
  const jeton = data && data.session ? data.session.access_token : '';
  const r = await fetch('/api/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify(corps),
  });
  let res = {};
  try { res = await r.json(); } catch (e) { /* réponse vide */ }
  if (!r.ok) throw new Error(res.erreur || `Erreur ${r.status}`);
  return res;
}

// Code d'accès masqué, avec afficher / copier.
function CodeAcces({ code }) {
  const [voir, setVoir] = useState(false);
  const [copie, setCopie] = useState(false);
  const copier = () => { navigator.clipboard.writeText(code).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1500); }).catch(() => {}); };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <code className="num" style={{ fontSize: '12px', background: C.bg, border: '1px solid ' + C.line, borderRadius: '6px', padding: '2px 6px', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{voir ? code : '•••••-•••••'}</code>
      <button type="button" onClick={() => setVoir(!voir)} style={{ ...ghostBtn, padding: '2px 7px', fontSize: '11px' }}>{voir ? 'Masquer' : 'Afficher'}</button>
      <button type="button" onClick={copier} title="Copier le code" style={{ ...ghostBtn, padding: '2px 7px', fontSize: '11px' }}>{copie ? 'Copié' : <Icon name="copy" size={12} />}</button>
    </span>
  );
}

// Réservé aux administrateurs : gérer les membres de la société.
export default function TeamPanel({ societeId, societeNom, membres, userId, onChanged }) {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [role, setRole] = useState('commercial');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  // E-mails et codes des membres invités (table invitations, lisible par les administrateurs).
  const [invitations, setInvitations] = useState([]);
  const [envoi, setEnvoi] = useState(null); // dernière invitation créée : { email, code, nom, existant }
  const chargerInvitations = useCallback(async () => {
    const { data } = await supabase.from('invitations').select('user_id, email, nom_affiche, role, code, modifie_le').eq('societe_id', String(societeId));
    setInvitations(data || []);
  }, [societeId]);
  useEffect(() => { chargerInvitations(); }, [chargerInvitations]);
  const invitationDe = (m) => invitations.find((i) => i.user_id === m.user_id)
    || invitations.find((i) => !i.user_id && i.nom_affiche && i.nom_affiche === m.nom_affiche);

  const ajouter = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setEnvoi(null);
    try {
      const r = await appelInvitation({ action: 'inviter', societe_id: societeId, email, role, nom_affiche: nom || null });
      setEnvoi({ ...r, nom });
      setMessage({ type: 'ok', text: r.existant ? 'Membre ajouté. Cette personne avait déjà un compte : elle garde son mot de passe.' : 'Membre invité : envoyez-lui son code ci-dessous.' });
      setEmail('');
      setNom('');
      chargerInvitations();
      onChanged();
    } catch (err) {
      setMessage({ type: 'err', text: traduireErreur(err) });
    }
    setBusy(false);
  };

  const nouveauCode = async (inv) => {
    if (!window.confirm(`Donner un nouveau code à ${inv.nom_affiche || inv.email} ? L'ancien ne marchera plus.`)) return;
    setMessage(null);
    try {
      const r = await appelInvitation({ action: 'nouveau_code', societe_id: societeId, email: inv.email });
      setEnvoi({ ...r, nom: inv.nom_affiche });
      setMessage({ type: 'ok', text: 'Nouveau code créé : envoyez-le au membre.' });
      chargerInvitations();
    } catch (err) {
      setMessage({ type: 'err', text: traduireErreur(err) });
    }
  };

  const envoyerMail = () => {
    const { sujet, texte } = messageInvitation({ ...envoi, societeNom });
    window.location.href = `mailto:${envoi.email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte)}`;
  };
  const copierMessage = () => {
    const { texte } = messageInvitation({ ...envoi, societeNom });
    navigator.clipboard.writeText(texte).then(() => setMessage({ type: 'ok', text: 'Message copié : collez-le dans WhatsApp, un SMS ou un e-mail.' })).catch(() => {});
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
      <SectionTitle icon="team" title={`Équipe (${membres.length})`}>
        Le commercial propose des points ; le manager les valide ; l’administrateur gère l’équipe.
      </SectionTitle>

      {message && <Message type={message.type}>{message.text}</Message>}

      {envoi && envoi.code && (
        <div style={{ border: '1px solid ' + C.brand, background: C.brandSoft, borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: C.brandDark }}>Invitation prête pour {envoi.nom || envoi.email}</div>
          <div style={{ fontSize: '12.5px', color: C.body, lineHeight: 1.6 }}>
            E-mail : <b>{envoi.email}</b><br />
            Code d’accès : <code className="num" style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '.06em' }}>{envoi.code}</code>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={envoyerMail} style={btn()}><Icon name="mail" size={15} /> Envoyer par e-mail</button>
            <button type="button" onClick={copierMessage} style={ghostBtn}><Icon name="copy" size={14} /> Copier le message</button>
          </div>
          <div style={{ fontSize: '11.5px', color: C.muted }}>Le code reste visible ici, dans la fiche du membre.</div>
        </div>
      )}

      {membres.map((m) => (
        <div key={m.user_id} style={{ border: '1px solid #e7e9f0', borderRadius: '12px', padding: '10px', background: '#fbfbfd', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
              {m.nom_affiche || `Membre ${m.user_id.slice(0, 6)}`}{m.user_id === userId ? ' (moi)' : ''}
            </div>
            {(() => {
              const inv = invitationDe(m);
              if (!inv) return null;
              return (
                <div style={{ fontSize: '11.5px', color: C.muted, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                  <span>{inv.email}</span>
                  {inv.code && inv.user_id ? (
                    <>
                      <CodeAcces code={inv.code} />
                      <button type="button" onClick={() => nouveauCode(inv)} style={{ ...ghostBtn, padding: '2px 7px', fontSize: '11px' }}>Nouveau code</button>
                    </>
                  ) : <span>(son propre mot de passe)</span>}
                </div>
              );
            })()}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select value={m.role} onChange={(e) => changerRole(m, e.target.value)} style={{ padding: '4px', borderRadius: '9px', border: '1px solid #d5d9e3', fontSize: '12px' }}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" onClick={() => retirer(m)} style={{ ...ghostBtn, color: '#b91c1c' }} title="Retirer de la société">✕</button>
          </div>
        </div>
      ))}

      <form onSubmit={ajouter} style={{ borderTop: '1px solid #e7e9f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Inviter un membre</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          GeoPulse crée son compte avec un code d’accès qui lui sert de mot de passe. Vous lui envoyez ce code et vous le retrouvez ici.
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
        <button type="submit" disabled={busy || !email.trim()} style={btn(undefined, busy || !email.trim())}>
          {busy ? 'Invitation…' : 'Inviter et créer son code'}
        </button>
      </form>
    </div>
  );
}
