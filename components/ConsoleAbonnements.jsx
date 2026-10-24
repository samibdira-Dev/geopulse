'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { STATUTS_PAIEMENT, dateFr, erreurAbonnement, tnd } from '../lib/abonnement';
import { C, Message, btn, carte, chip, ghostBtn, inputStyle, labelStyle, surtitre } from './ui';
import Icon from './icons';

// Console : virements à valider, historique des paiements, RIB affiché aux clients et formules (prix, limites).
export default function ConsoleAbonnements({ onChanged }) {
  const [paiements, setPaiements] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [vue, setVue] = useState('a_traiter');
  const [reglages, setReglages] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('plateforme_paiements');
    if (error) { setErreur(erreurAbonnement(error)); return; }
    setErreur(null);
    setPaiements(data || []);
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const traiter = async (p, valider) => {
    let note = null;
    if (valider) {
      if (!window.confirm(`Confirmer la réception de ${tnd(p.montant)} de ${p.societe} (réf. ${p.reference}) ? L’abonnement sera prolongé de ${p.mois} mois.`)) return;
    } else {
      note = window.prompt('Motif du refus (visible par le client) :', 'Virement non reçu');
      if (note === null) return;
    }
    const { error } = await supabase.rpc('plateforme_traiter_paiement', { p_paiement: p.id, p_valider: valider, p_note: note });
    if (error) { setErreur(erreurAbonnement(error)); return; }
    charger(); onChanged();
  };

  const liste = (paiements || []).filter((p) => (vue === 'a_traiter' ? ['annonce', 'a_payer'].includes(p.statut) : true));
  const annonces = (paiements || []).filter((p) => p.statut === 'annonce').length;
  const encaisse12 = (paiements || []).filter((p) => p.statut === 'valide' && new Date(p.traite_le) > new Date(Date.now() - 365 * 86400000)).reduce((s, p) => s + Number(p.montant), 0);

  return (
    <section style={{ ...carte, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', borderBottom: '1px solid ' + C.line }}>
        <Icon name="wallet" size={18} style={{ color: C.brand }} />
        <h2 style={{ margin: '0 8px 0 0', fontSize: '15px', color: C.text }}>Abonnements et paiements</h2>
        {annonces > 0 && <span style={{ background: '#eef0ff', color: C.brandDark, borderRadius: '999px', padding: '2px 9px', fontSize: '11.5px', fontWeight: 700 }}>{annonces} virement{annonces > 1 ? 's' : ''} à vérifier</span>}
        <span style={{ fontSize: '12px', color: C.muted }}>Encaissé sur 12 mois : <b style={{ color: C.text }}>{tnd(encaisse12)}</b> HT</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button type="button" onClick={() => setVue('a_traiter')} style={{ ...chip(vue === 'a_traiter'), padding: '5px 10px', fontSize: '11.5px' }}>À traiter</button>
          <button type="button" onClick={() => setVue('tous')} style={{ ...chip(vue === 'tous'), padding: '5px 10px', fontSize: '11.5px' }}>Tous</button>
          <button type="button" onClick={() => setReglages(!reglages)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: '11.5px' }}><Icon name="edit" size={13} />RIB et formules</button>
        </span>
      </div>
      {erreur && <div style={{ padding: '12px 16px' }}><Message>{erreur}</Message></div>}
      {reglages && !erreur && <Reglages onFermer={() => setReglages(false)} />}
      {paiements && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: '#fafbfd' }}>
                {['Société', 'Référence', 'Formule', 'Montant HT', 'Statut', 'Virement annoncé', 'Période payée', ''].map((h) => (
                  <th key={h} style={{ ...surtitre, textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid ' + C.line, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {liste.map((p) => {
                const s = STATUTS_PAIEMENT[p.statut] || STATUTS_PAIEMENT.a_payer;
                return (
                  <tr key={p.id}>
                    <td style={td}><b style={{ color: C.text }}>{p.societe || p.societe_id}</b><div style={{ fontSize: '11px', color: C.muted }}>{p.cree_par_email || ''} · {dateFr(p.cree_le)}</div></td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, color: C.text }}>{p.reference}</td>
                    <td style={td}>{p.formule.charAt(0).toUpperCase() + p.formule.slice(1)} · {p.periodicite === 'annee' ? '12 mois' : '1 mois'}</td>
                    <td style={{ ...td, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }} className="num">{tnd(p.montant)}</td>
                    <td style={td}><span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span></td>
                    <td style={td}>{p.annonce_le ? <>le {dateFr(p.date_virement)}{p.ref_banque ? <div style={{ fontSize: '11px', color: C.muted }}>réf. {p.ref_banque}</div> : null}</> : '—'}</td>
                    <td style={td}>{p.statut === 'valide' ? `${dateFr(p.debut)} → ${dateFr(p.fin)}` : p.statut === 'refuse' ? (p.note || 'Refusé') : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {['annonce', 'a_payer'].includes(p.statut) && (
                        <>
                          <button type="button" onClick={() => traiter(p, false)} style={{ ...ghostBtn, padding: '5px 9px', fontSize: '11.5px', color: C.danger, marginRight: 6 }}>Refuser</button>
                          <button type="button" onClick={() => traiter(p, true)} style={{ ...btn(C.success), padding: '6px 11px', fontSize: '11.5px' }}><Icon name="check" size={14} />Reçu</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {liste.length === 0 && <div style={{ padding: '18px', textAlign: 'center', color: C.faint, fontSize: '13px' }}>{vue === 'a_traiter' ? 'Aucun paiement en attente.' : 'Aucun paiement pour l’instant.'}</div>}
        </div>
      )}
    </section>
  );
}

const td = { padding: '10px 12px', borderBottom: '1px solid ' + C.line, verticalAlign: 'top', color: C.body };

// RIB affiché aux clients, durée d'essai, remise annuelle et formules.
function Reglages({ onFermer }) {
  const [p, setP] = useState(null);
  const [formules, setFormules] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    Promise.all([
      supabase.from('plateforme_parametres').select('*').eq('id', 1).maybeSingle(),
      supabase.from('formules').select('*').order('ordre'),
    ]).then(([a, b]) => {
      if (a.error || b.error) { setMsg({ type: 'err', text: erreurAbonnement(a.error || b.error) }); return; }
      setP(a.data || {});
      setFormules((b.data || []).map((f) => ({ ...f })));
    });
  }, []);

  const enregistrer = async () => {
    setMsg(null);
    const { error } = await supabase.from('plateforme_parametres').update({
      titulaire: p.titulaire || null, banque: p.banque || null, rib: p.rib || null, iban: p.iban || null,
      email_facturation: p.email_facturation || null, telephone: p.telephone || null,
      essai_jours: Number(p.essai_jours) || 30, mois_offerts_annuel: Math.max(0, Math.min(11, Number(p.mois_offerts_annuel) || 0)), modifie_le: new Date().toISOString(),
    }).eq('id', 1);
    if (error) { setMsg({ type: 'err', text: erreurAbonnement(error) }); return; }
    for (const f of formules) {
      const nombreOuVide = (v) => (v === '' || v == null ? null : Number(v));
      const { error: e2 } = await supabase.from('formules').update({
        nom: f.nom, prix_mensuel: nombreOuVide(f.prix_mensuel), max_utilisateurs: nombreOuVide(f.max_utilisateurs),
        max_points: nombreOuVide(f.max_points), description: f.description || null, actif: f.actif,
      }).eq('code', f.code);
      if (e2) { setMsg({ type: 'err', text: erreurAbonnement(e2) }); return; }
    }
    setMsg({ type: 'ok', text: 'RIB et formules enregistrés. Les clients voient les nouveaux prix immédiatement.' });
  };

  if (!p || !formules) return <div style={{ padding: '12px 16px', fontSize: '12.5px', color: C.muted }}>{msg ? <Message type={msg.type}>{msg.text}</Message> : 'Chargement…'}</div>;
  const champ = (k, props = {}) => <input value={p[k] ?? ''} onChange={(e) => setP({ ...p, [k]: e.target.value })} style={inputStyle} {...props} />;
  const champF = (i, k, props = {}) => (
    <input value={formules[i][k] ?? ''} onChange={(e) => setFormules(formules.map((f, j) => (j === i ? { ...f, [k]: e.target.value } : f)))} style={{ ...inputStyle, marginTop: 0, padding: '7px 9px', fontSize: '12.5px' }} {...props} />
  );
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid ' + C.line, background: '#fafbfd', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={surtitre}>Coordonnées bancaires affichées aux clients</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
        <label style={labelStyle}>Bénéficiaire{champ('titulaire', { placeholder: 'Nom du titulaire du compte' })}</label>
        <label style={labelStyle}>Banque{champ('banque', { placeholder: 'Ex : BIAT, agence …' })}</label>
        <label style={labelStyle}>RIB (20 chiffres){champ('rib', { placeholder: '00 000 0000000000000 00' })}</label>
        <label style={labelStyle}>IBAN (facultatif){champ('iban', { placeholder: 'TN59 …' })}</label>
        <label style={labelStyle}>E-mail facturation{champ('email_facturation', { placeholder: 'contact@…' })}</label>
        <label style={labelStyle}>Téléphone{champ('telephone', { placeholder: '+216 …' })}</label>
        <label style={labelStyle}>Essai gratuit (jours){champ('essai_jours', { type: 'number', min: 0 })}</label>
        <label style={labelStyle}>Mois offerts à l’année{champ('mois_offerts_annuel', { type: 'number', min: 0, max: 11 })}</label>
      </div>
      <div style={surtitre}>Formules</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead><tr style={{ color: C.muted, textAlign: 'left' }}><th style={{ padding: '4px' }}>Nom</th><th>Prix HT / mois (vide = sur devis)</th><th>Comptes bureau max</th><th>Points max</th><th>Description</th><th>Proposée</th></tr></thead>
          <tbody>
            {formules.map((f, i) => (
              <tr key={f.code}>
                <td style={{ padding: '4px', width: '120px' }}>{champF(i, 'nom')}</td>
                <td style={{ padding: '4px', width: '130px' }}>{champF(i, 'prix_mensuel', { type: 'number', min: 0 })}</td>
                <td style={{ padding: '4px', width: '100px' }}>{champF(i, 'max_utilisateurs', { type: 'number', min: 1, placeholder: 'illimité' })}</td>
                <td style={{ padding: '4px', width: '100px' }}>{champF(i, 'max_points', { type: 'number', min: 1, placeholder: 'illimité' })}</td>
                <td style={{ padding: '4px' }}>{champF(i, 'description')}</td>
                <td style={{ padding: '4px', textAlign: 'center' }}><input type="checkbox" checked={!!f.actif} onChange={(e) => setFormules(formules.map((x, j) => (j === i ? { ...x, actif: e.target.checked } : x)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <Message type={msg.type}>{msg.text}</Message>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={enregistrer} style={btn()}>Enregistrer</button>
        <button type="button" onClick={onFermer} style={ghostBtn}>Fermer</button>
      </div>
    </div>
  );
}
