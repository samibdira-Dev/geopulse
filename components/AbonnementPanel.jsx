'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { STATUTS_PAIEMENT, dateFr, erreurAbonnement, etatAbonnement, montantPrevu, tnd } from '../lib/abonnement';
import { C, Message, SectionTitle, btn, carte, chip, ghostBtn, inputStyle, labelStyle, surtitre } from './ui';
import Icon from './icons';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Abonnement de la société (administrateur) : formule et échéance, choix d'une formule, paiement par virement
// avec une référence unique, annonce du virement, historique. La validation se fait dans la console GeoPulse.
export default function AbonnementPanel({ societeId, societeNom }) {
  const [abo, setAbo] = useState(null);
  const [formules, setFormules] = useState([]);
  const [param, setParam] = useState(null);
  const [paiements, setPaiements] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [periodicite, setPeriodicite] = useState('annee');
  const [busy, setBusy] = useState(false);
  const [annonce, setAnnonce] = useState({ ref: '', date: aujourdhui() });

  const charger = useCallback(async () => {
    const [a, f, p, h] = await Promise.all([
      supabase.rpc('abonnement_societe', { p_societe: societeId }),
      supabase.from('formules').select('*').eq('actif', true).order('ordre'),
      supabase.from('plateforme_parametres').select('*').eq('id', 1).maybeSingle(),
      supabase.from('paiements').select('*').eq('societe_id', societeId).neq('statut', 'annule').order('cree_le', { ascending: false }),
    ]);
    const err = a.error || f.error || p.error || h.error;
    if (err) { setErreur(erreurAbonnement(err)); return; }
    setErreur(null);
    setAbo((a.data || [])[0] || {});
    setFormules(f.data || []);
    setParam(p.data || {});
    setPaiements(h.data || []);
  }, [societeId]);
  useEffect(() => { charger(); }, [charger]);

  const enCours = paiements.find((x) => x.statut === 'a_payer' || x.statut === 'annonce');
  const historique = paiements.filter((x) => x !== enCours);
  const etat = abo ? etatAbonnement(abo.fin_abonnement) : null;
  const offerts = param ? param.mois_offerts_annuel ?? 2 : 2;

  const choisir = async (f) => {
    setBusy(true); setMessage(null);
    const { error } = await supabase.rpc('abonnement_demander', { p_societe: societeId, p_formule: f.code, p_periodicite: periodicite });
    setBusy(false);
    if (error) { setMessage({ type: 'err', text: erreurAbonnement(error) }); return; }
    charger();
  };
  const annoncer = async (e) => {
    e.preventDefault();
    setBusy(true); setMessage(null);
    const { error } = await supabase.rpc('abonnement_annoncer', { p_paiement: enCours.id, p_ref_banque: annonce.ref, p_date: annonce.date || null });
    setBusy(false);
    if (error) { setMessage({ type: 'err', text: erreurAbonnement(error) }); return; }
    setMessage({ type: 'ok', text: 'Merci ! Nous vérifions la réception du virement et prolongeons votre abonnement dès qu’il arrive.' });
    charger();
  };
  const annuler = async () => {
    if (!window.confirm('Annuler cette demande de paiement ?')) return;
    const { error } = await supabase.rpc('abonnement_annuler', { p_paiement: enCours.id });
    if (error) { setMessage({ type: 'err', text: erreurAbonnement(error) }); return; }
    charger();
  };
  const copier = (t) => { try { navigator.clipboard.writeText(t); } catch (e) { /* presse-papiers indisponible */ } };

  if (erreur) return <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}><Titre /><Message>{erreur}</Message></div>;
  if (!abo) return <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}><Titre /><div style={{ fontSize: '13px', color: C.muted }}>Chargement…</div></div>;

  const couleurEtat = { aucun: C.muted, actif: C.success, bientot: C.warning, expire: C.danger }[etat.cle];
  const formuleEnCours = enCours && formules.find((f) => f.code === enCours.formule);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Titre />

      <div style={{ ...carte, borderLeft: '4px solid ' + couleurEtat, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={surtitre}>Votre formule</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, color: C.text }}>{abo.formule || 'Aucune'}</span>
          {etat.cle !== 'aucun' && (
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: couleurEtat }}>
              {etat.cle === 'expire' ? `expirée depuis ${-etat.jours} jour${-etat.jours > 1 ? 's' : ''}` : `${etat.jours} jour${etat.jours > 1 ? 's' : ''} restant${etat.jours > 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12.5px', color: C.muted }}>
          {abo.fin_abonnement ? `Jusqu’au ${dateFr(abo.fin_abonnement)} inclus.` : 'Pas de date de fin enregistrée.'} {societeNom ? '· ' + societeNom : ''}
        </div>
      </div>

      {message && <Message type={message.type}>{message.text}</Message>}

      {enCours && (
        <div style={{ ...carte, borderColor: enCours.statut === 'annonce' ? '#c7d2fe' : '#fde68a', background: enCours.statut === 'annonce' ? '#f8f9ff' : '#fffdf5', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ ...surtitre, flex: 1, color: C.text }}>{enCours.statut === 'annonce' ? 'Virement en cours de vérification' : 'Paiement à effectuer'}</span>
            <Badge statut={enCours.statut} />
          </div>
          <div style={{ fontSize: '13px', color: C.body, lineHeight: 1.5 }}>
            {formuleEnCours ? formuleEnCours.nom : enCours.formule} · {enCours.periodicite === 'annee' ? '12 mois' : '1 mois'}
            <div style={{ fontSize: '24px', fontWeight: 800, color: C.text, letterSpacing: '-.01em' }} className="num">{tnd(enCours.montant)} <span style={{ fontSize: '12px', fontWeight: 600, color: C.muted }}>HT</span></div>
          </div>
          <div style={{ background: 'white', border: '1px solid ' + C.line, borderRadius: '12px', padding: '10px 12px', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 10px', alignItems: 'center', fontSize: '12.5px' }}>
            <Ligne libelle="Bénéficiaire" valeur={param.titulaire} />
            <Ligne libelle="Banque" valeur={param.banque} />
            <Ligne libelle="RIB" valeur={param.rib} copier={copier} mono />
            {param.iban && <Ligne libelle="IBAN" valeur={param.iban} copier={copier} mono />}
            <Ligne libelle="Libellé" valeur={enCours.reference} copier={copier} mono fort />
          </div>
          {!param.rib && <div style={{ fontSize: '12px', color: C.warning }}>Le RIB de GeoPulse sera affiché ici très bientôt. Vous pouvez aussi le demander à votre contact GeoPulse.</div>}
          <div style={{ fontSize: '11.5px', color: C.muted, lineHeight: 1.5 }}>
            Indiquez bien la référence <b style={{ color: C.text }}>{enCours.reference}</b> dans le libellé du virement : c’est elle qui permet de relier votre paiement à votre société.
          </div>

          {enCours.statut === 'a_payer' ? (
            <form onSubmit={annoncer} style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid ' + C.line, paddingTop: '10px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: C.text }}>Virement fait ? Prévenez-nous</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '8px' }}>
                <label style={labelStyle}>Référence du virement (facultatif)
                  <input value={annonce.ref} onChange={(e) => setAnnonce({ ...annonce, ref: e.target.value })} placeholder="N° d’opération de votre banque" style={inputStyle} />
                </label>
                <label style={labelStyle}>Date
                  <input type="date" max={aujourdhui()} value={annonce.date} onChange={(e) => setAnnonce({ ...annonce, date: e.target.value })} style={inputStyle} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={busy} style={{ ...btn(C.success, busy), flex: 1 }}><Icon name="check" size={15} />J’ai fait le virement</button>
                <button type="button" onClick={annuler} style={{ ...ghostBtn, color: C.muted }}>Annuler</button>
              </div>
            </form>
          ) : (
            <div style={{ fontSize: '12.5px', color: C.brandDark, borderTop: '1px solid ' + C.line, paddingTop: '10px' }}>
              Annoncé le {dateFr(enCours.annonce_le)}{enCours.ref_banque ? ` (réf. ${enCours.ref_banque})` : ''}. Votre abonnement sera prolongé dès réception, en général sous 48 h ouvrées.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...surtitre, flex: 1 }}>{enCours ? 'Changer de formule' : abo.formule && abo.formule !== 'Essai' ? 'Renouveler' : 'Choisir une formule'}</span>
          <button type="button" onClick={() => setPeriodicite('mois')} style={{ ...chip(periodicite === 'mois'), padding: '4px 10px', fontSize: '11.5px' }}>Mensuel</button>
          <button type="button" onClick={() => setPeriodicite('annee')} style={{ ...chip(periodicite === 'annee'), padding: '4px 10px', fontSize: '11.5px' }}>Annuel{offerts > 0 ? ` −${offerts} mois` : ''}</button>
        </div>
        {formules.map((f) => {
          const montant = montantPrevu(f, periodicite, offerts);
          const actuelle = abo.formule === f.nom;
          return (
            <div key={f.code} style={{ ...carte, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: '6px', borderColor: actuelle ? C.brand : C.line }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: C.text, flex: 1 }}>{f.nom}{actuelle && <span style={{ fontSize: '10.5px', fontWeight: 700, color: C.brand, marginLeft: 6 }}>ACTUELLE</span>}</span>
                {montant != null ? (
                  <span style={{ textAlign: 'right' }}>
                    <span className="num" style={{ fontSize: '16px', fontWeight: 800, color: C.text }}>{tnd(montant)}</span>
                    <span style={{ display: 'block', fontSize: '10.5px', color: C.muted }}>HT {periodicite === 'annee' ? 'par an' : 'par mois'}{periodicite === 'annee' ? ` · soit ${tnd(Math.round(montant / 12))} / mois` : ''}</span>
                  </span>
                ) : <span style={{ fontSize: '13px', fontWeight: 700, color: C.body }}>Sur devis</span>}
              </div>
              {f.description && <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.45 }}>{f.description}</div>}
              <div style={{ fontSize: '11.5px', color: C.body }}>
                {f.max_utilisateurs ? `Jusqu’à ${f.max_utilisateurs} utilisateurs` : 'Utilisateurs illimités'} · {f.max_points ? `${Number(f.max_points).toLocaleString('fr-FR')} points` : 'points illimités'}
              </div>
              {montant != null ? (
                <button type="button" disabled={busy} onClick={() => choisir(f)} style={{ ...btn(undefined, busy), padding: '8px 12px', fontSize: '12.5px' }}>
                  {actuelle ? 'Renouveler' : 'Choisir'} · payer par virement
                </button>
              ) : (
                <a href={`mailto:${param.email_facturation || ''}?subject=${encodeURIComponent('Devis GeoPulse Entreprise · ' + (societeNom || ''))}`} style={{ ...ghostBtn, justifyContent: 'center', textDecoration: 'none' }}>Demander un devis</a>
              )}
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.muted, padding: '2px 2px' }}>
          <Icon name="wallet" size={15} /> Paiement par carte bancaire avec Flouci : bientôt disponible.
        </div>
      </div>

      {historique.length > 0 && (
        <div style={{ ...carte, padding: '12px 13px' }}>
          <div style={{ ...surtitre, marginBottom: '6px' }}>Historique des paiements</div>
          {historique.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid ' + C.line, padding: '7px 0', fontSize: '12px' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ color: C.text }}>{(formules.find((f) => f.code === p.formule) || {}).nom || p.formule}</b> · {p.reference}
                <span style={{ display: 'block', color: C.muted, fontSize: '11px' }}>
                  {p.statut === 'valide' ? `du ${dateFr(p.debut)} au ${dateFr(p.fin)}` : p.note || dateFr(p.cree_le)}
                </span>
              </span>
              <span className="num" style={{ fontWeight: 700, color: C.text }}>{tnd(p.montant)}</span>
              <Badge statut={p.statut} />
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: '11px', color: C.faint }}>Prix hors taxes. Une question sur votre abonnement : {param.email_facturation || 'votre contact GeoPulse'}{param.telephone ? ' · ' + param.telephone : ''}.</div>
    </div>
  );
}

function Titre() {
  return <SectionTitle icon="wallet" title="Abonnement">Votre formule GeoPulse, son échéance et le paiement par virement.</SectionTitle>;
}

function Badge({ statut }) {
  const s = STATUTS_PAIEMENT[statut] || STATUTS_PAIEMENT.a_payer;
  return <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function Ligne({ libelle, valeur, copier, mono, fort }) {
  return (
    <>
      <span style={{ color: C.muted }}>{libelle}</span>
      <span style={{ color: C.text, fontWeight: fort ? 800 : 600, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit', fontSize: mono ? '12px' : undefined, wordBreak: mono ? 'break-all' : 'normal' }}>{valeur || '—'}</span>
      {copier && valeur ? <button type="button" onClick={() => copier(valeur)} title="Copier" style={{ border: 'none', background: 'none', color: C.brand, cursor: 'pointer', padding: '2px' }}><Icon name="copy" size={14} /></button> : <span />}
    </>
  );
}
