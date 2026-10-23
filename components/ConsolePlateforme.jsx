'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { traduireErreur } from '../lib/points';
import { C, Message, btn, carte, chip, ghostBtn, inputStyle, labelStyle, surtitre } from './ui';
import Icon, { Logo } from './icons';

export const STATUTS_SOCIETE = {
  en_attente: { label: 'En attente', color: '#b45309', bg: '#fffbeb' },
  active: { label: 'Active', color: '#047857', bg: '#ecfdf5' },
  suspendue: { label: 'Suspendue', color: '#b91c1c', bg: '#fef2f2' },
  refusee: { label: 'Refusée', color: '#475569', bg: '#f1f5f9' },
};
const FORMULES = ['Essai', 'Standard', 'Premium', 'Sur mesure'];
const GENRES = { appel: 'Appel', rdv: 'Rendez-vous', relance: 'Relance', note: 'Note', statut: 'Statut' };

const JOUR = 86400000;
const aujourdhui = () => new Date(new Date().toDateString());
const dateFr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const joursAvant = (d) => (d ? Math.round((new Date(d) - aujourdhui()) / JOUR) : null);
function ilYa(d) {
  if (!d) return 'jamais';
  const j = Math.floor((Date.now() - new Date(d)) / JOUR);
  if (j <= 0) return 'aujourd’hui';
  if (j === 1) return 'hier';
  if (j < 31) return 'il y a ' + j + ' j';
  return dateFr(d);
}
const nombre = (n) => (n || 0).toLocaleString('fr-FR');

// Échéance d'abonnement : rouge si dépassée, orange sous 30 jours.
function etatAbonnement(fin) {
  const j = joursAvant(fin);
  if (j === null) return null;
  if (j < 0) return { color: C.danger, texte: 'expiré' };
  if (j <= 30) return { color: C.warning, texte: 'dans ' + j + ' j' };
  return { color: C.muted, texte: '' };
}

export function BadgeSociete({ statut }) {
  const s = STATUTS_SOCIETE[statut] || STATUTS_SOCIETE.en_attente;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

export default function ConsolePlateforme({ session, onSignOut }) {
  const [societes, setSocietes] = useState(null);
  const [erreur, setErreur] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [choisie, setChoisie] = useState(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('plateforme_societes');
    if (error) { setErreur(traduireErreur(error)); return; }
    setErreur('');
    setSocietes(data || []);
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const liste = societes || [];
  const enAttente = liste.filter((s) => s.statut === 'en_attente');
  const kpi = useMemo(() => {
    const actives = liste.filter((s) => s.statut === 'active');
    return {
      attente: enAttente.length,
      actives: actives.length,
      utilisateurs: actives.reduce((t, s) => t + s.nb_membres, 0),
      points: actives.reduce((t, s) => t + s.nb_points, 0),
      renouveler: actives.filter((s) => { const j = joursAvant(s.fin_abonnement); return j !== null && j <= 30; }).length,
      relances: liste.filter((s) => { const j = joursAvant(s.prochaine_relance); return j !== null && j <= 0; }).length,
      inactives: actives.filter((s) => !s.derniere_connexion || Date.now() - new Date(s.derniere_connexion) > 14 * JOUR).length,
    };
  }, [liste, enAttente.length]);

  const filtrees = liste.filter((s) => {
    if (filtre === 'relance') { const j = joursAvant(s.prochaine_relance); if (j === null || j > 0) return false; }
    else if (filtre === 'renouveler') { const j = joursAvant(s.fin_abonnement); if (s.statut !== 'active' || j === null || j > 30) return false; }
    else if (filtre !== 'tous' && s.statut !== filtre) return false;
    const q = recherche.trim().toLowerCase();
    return !q || [s.nom, s.secteur, s.admin_email, s.contact].some((v) => v && v.toLowerCase().includes(q));
  });
  const detail = choisie && liste.find((s) => s.id === choisie);

  const changerStatut = async (s, statut) => {
    const { error } = await supabase.rpc('plateforme_maj_societe', {
      p_societe: s.id, p_statut: statut, p_formule: s.formule || (statut === 'active' ? 'Essai' : null),
      p_fin_abonnement: s.fin_abonnement, p_contact: s.contact, p_telephone: s.telephone,
    });
    if (error) { setErreur(traduireErreur(error)); return; }
    charger();
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <header style={{ background: C.ink, color: 'white', padding: '14px max(16px, env(safe-area-inset-left))', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 10 }}>
        <Logo size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-.01em' }}>Console GeoPulse</div>
          <div style={{ fontSize: '11.5px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.user.email}</div>
        </div>
        <a href="/pro" className="gp-console-lien" style={{ color: '#c7d2fe', fontSize: '12.5px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Icon name="globe" size={16} /> <span className="gp-texte-large">Ouvrir l’application</span>
        </a>
        <button type="button" onClick={onSignOut} title="Se déconnecter" style={{ border: 'none', background: 'rgba(255,255,255,.08)', color: '#e2e8f0', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex' }}>
          <Icon name="logout" size={17} />
        </button>
      </header>

      <main style={{ maxWidth: '1480px', margin: '0 auto', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {erreur && <Message>{erreur}</Message>}
        {!societes && !erreur && <div style={{ color: C.muted, fontSize: '13px' }}>Chargement des sociétés…</div>}

        {societes && (
          <>
            <div className="gp-console-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '12px' }}>
              <Tuile titre="Demandes à valider" valeur={kpi.attente} couleur={kpi.attente ? C.warning : C.text} onClick={() => setFiltre('en_attente')} />
              <Tuile titre="Sociétés actives" valeur={kpi.actives} onClick={() => setFiltre('active')} />
              <Tuile titre="Utilisateurs actifs" valeur={kpi.utilisateurs} />
              <Tuile titre="Points cartographiés" valeur={kpi.points} />
              <Tuile titre="À renouveler (30 j)" valeur={kpi.renouveler} couleur={kpi.renouveler ? C.danger : C.text} onClick={() => setFiltre('renouveler')} />
              <Tuile titre="Relances du jour" valeur={kpi.relances} couleur={kpi.relances ? C.brand : C.text} onClick={() => setFiltre('relance')}
                note={kpi.inactives ? kpi.inactives + ' client' + (kpi.inactives > 1 ? 's' : '') + ' sans connexion depuis 14 j' : ''} />
            </div>

            {enAttente.length > 0 && (
              <section style={{ ...carte, padding: '16px', borderColor: '#fde68a', background: '#fffdf5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Icon name="alert" size={18} style={{ color: C.warning }} />
                  <h2 style={{ margin: 0, fontSize: '15px', color: C.text }}>Nouvelles demandes d’ouverture</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {enAttente.map((s) => (
                    <div key={s.id} className="gp-console-demande" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid ' + C.line, borderRadius: '12px', padding: '12px 14px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: C.text, fontSize: '14px' }}>{s.nom}</div>
                        <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                          {[s.secteur, s.admin_email, 'demande du ' + dateFr(s.inscrit_le)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
                        <button type="button" onClick={() => setChoisie(s.id)} style={ghostBtn}>Détails</button>
                        <button type="button" onClick={() => changerStatut(s, 'refusee')} style={{ ...ghostBtn, color: C.danger }}>Refuser</button>
                        <button type="button" onClick={() => changerStatut(s, 'active')} style={{ ...btn(C.success), padding: '7px 14px', fontSize: '12px' }}>
                          <Icon name="check" size={15} /> Valider
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="gp-console-corps" style={{ display: 'grid', gridTemplateColumns: detail ? 'minmax(0, 1fr) 420px' : 'minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
              <div style={{ ...carte, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', borderBottom: '1px solid ' + C.line }}>
                  <h2 style={{ margin: '0 8px 0 0', fontSize: '15px', color: C.text }}>Clients</h2>
                  {[['tous', 'Toutes'], ['active', 'Actives'], ['en_attente', 'En attente'], ['suspendue', 'Suspendues'], ['refusee', 'Refusées'], ['renouveler', 'À renouveler'], ['relance', 'Relances']].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setFiltre(k)} style={{ ...chip(filtre === k), padding: '5px 10px', fontSize: '11.5px' }}>{l}</button>
                  ))}
                  <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une société, un e-mail…"
                    style={{ ...inputStyle, marginTop: 0, marginLeft: 'auto', width: '230px', padding: '7px 10px', fontSize: '12.5px' }} className="gp-console-recherche" />
                </div>

                <div className="gp-console-table" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#fafbfd' }}>
                      {['Société', 'Statut', 'Formule', 'Fin d’abonnement', 'Utilisateurs', 'Points', 'Ventes', 'Dernière connexion', 'Activité 30 j', 'Relance'].map((h) => (
                        <th key={h} style={{ ...surtitre, textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid ' + C.line, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrees.map((s) => {
                      const ab = etatAbonnement(s.fin_abonnement);
                      const rel = joursAvant(s.prochaine_relance);
                      return (
                        <tr key={s.id} onClick={() => setChoisie(s.id)} className="gp-console-ligne"
                          style={{ cursor: 'pointer', background: choisie === s.id ? C.brandSoft : undefined }}>
                          <td style={td}>
                            <div style={{ fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{s.nom}</div>
                            <div style={{ color: C.muted, fontSize: '11.5px' }}>{s.secteur || '—'}</div>
                          </td>
                          <td style={td}><BadgeSociete statut={s.statut} /></td>
                          <td style={td}>{s.formule || '—'}</td>
                          <td style={td}>
                            {dateFr(s.fin_abonnement)}
                            {ab && ab.texte && <div style={{ color: ab.color, fontWeight: 700, fontSize: '11px' }}>{ab.texte}</div>}
                          </td>
                          <td style={{ ...td, textAlign: 'right' }} className="num">{s.nb_membres}</td>
                          <td style={{ ...td, textAlign: 'right' }} className="num">{nombre(s.nb_points)}</td>
                          <td style={td}>{s.mois_ventes ? s.mois_ventes + ' mois' : '—'}</td>
                          <td style={{ ...td, color: !s.derniere_connexion || Date.now() - new Date(s.derniere_connexion) > 14 * JOUR ? C.danger : C.body }}>{ilYa(s.derniere_connexion)}</td>
                          <td style={{ ...td, textAlign: 'right' }} className="num">{s.actions_30j}</td>
                          <td style={{ ...td, color: rel !== null && rel <= 0 ? C.brand : C.body, fontWeight: rel !== null && rel <= 0 ? 700 : 400 }}>{s.prochaine_relance ? dateFr(s.prochaine_relance) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>

                <div className="gp-console-cartes" style={{ display: 'none', flexDirection: 'column' }}>
                  {filtrees.map((s) => {
                    const ab = etatAbonnement(s.fin_abonnement);
                    return (
                      <button key={s.id} type="button" onClick={() => setChoisie(s.id)} style={{ textAlign: 'left', border: 'none', borderBottom: '1px solid ' + C.line, background: choisie === s.id ? C.brandSoft : 'white', padding: '12px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                          <span style={{ fontWeight: 700, color: C.text, fontSize: '14px', flex: 1 }}>{s.nom}</span>
                          <BadgeSociete statut={s.statut} />
                        </div>
                        <div style={{ fontSize: '12px', color: C.muted }}>
                          {s.nb_membres} utilisateur{s.nb_membres > 1 ? 's' : ''} · {nombre(s.nb_points)} points · connexion {ilYa(s.derniere_connexion)}
                        </div>
                        {(s.formule || s.fin_abonnement) && (
                          <div style={{ fontSize: '12px', color: ab ? ab.color : C.muted }}>{s.formule || 'Sans formule'} · fin {dateFr(s.fin_abonnement)} {ab && ab.texte ? '(' + ab.texte + ')' : ''}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {filtrees.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: C.faint, fontSize: '13px' }}>Aucune société dans ce filtre.</div>}
              </div>

              {detail && <FicheClient key={detail.id} societe={detail} moi={session.user.email} onFermer={() => setChoisie(null)} onChanged={charger} />}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

const td = { padding: '10px 12px', borderBottom: '1px solid ' + C.line, verticalAlign: 'top', color: C.body };

function Tuile({ titre, valeur, couleur = C.text, onClick, note }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ ...carte, textAlign: 'left', cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={surtitre}>{titre}</span>
      <span className="num" style={{ fontSize: '26px', fontWeight: 800, color: couleur, letterSpacing: '-.02em' }}>{nombre(valeur)}</span>
      {note && <span style={{ fontSize: '11px', color: C.danger }}>{note}</span>}
    </button>
  );
}

// Fiche d'une société : statut, abonnement, contact, utilisateurs et notes de suivi.
function FicheClient({ societe, moi, onFermer, onChanged }) {
  const [f, setF] = useState({
    statut: societe.statut, formule: societe.formule || '', fin: societe.fin_abonnement || '',
    contact: societe.contact || '', telephone: societe.telephone || '',
  });
  const [membres, setMembres] = useState(null);
  const [suivi, setSuivi] = useState(null);
  const [note, setNote] = useState({ genre: 'appel', texte: '', relance: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const chargerDetail = useCallback(async () => {
    const [m, s] = await Promise.all([
      supabase.rpc('plateforme_membres', { p_societe: societe.id }),
      supabase.from('plateforme_suivi').select('*').eq('societe_id', societe.id).order('cree_le', { ascending: false }),
    ]);
    if (m.error || s.error) { setMsg({ type: 'err', text: traduireErreur(m.error || s.error) }); return; }
    setMembres(m.data || []);
    setSuivi(s.data || []);
  }, [societe.id]);
  useEffect(() => { chargerDetail(); }, [chargerDetail]);

  const enregistrer = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('plateforme_maj_societe', {
      p_societe: societe.id, p_statut: f.statut, p_formule: f.formule, p_fin_abonnement: f.fin || null,
      p_contact: f.contact, p_telephone: f.telephone,
    });
    setBusy(false);
    if (error) { setMsg({ type: 'err', text: traduireErreur(error) }); return; }
    setMsg({ type: 'ok', text: 'Fiche enregistrée.' });
    onChanged(); chargerDetail();
  };

  const ajouterNote = async (e) => {
    e.preventDefault();
    if (!note.texte.trim()) return;
    const { error } = await supabase.from('plateforme_suivi').insert({
      societe_id: societe.id, genre: note.genre, texte: note.texte.trim(), relance_le: note.relance || null, auteur_email: moi,
    });
    if (error) { setMsg({ type: 'err', text: traduireErreur(error) }); return; }
    setNote({ genre: 'appel', texte: '', relance: '' });
    chargerDetail(); onChanged();
  };

  const basculer = async (n) => {
    await supabase.from('plateforme_suivi').update({ fait: !n.fait }).eq('id', n.id);
    chargerDetail(); onChanged();
  };

  const champ = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });

  return (
    <aside className="gp-console-fiche" style={{ ...carte, padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '17px', color: C.text }}>{societe.nom}</div>
          <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
            {societe.secteur || 'Secteur non renseigné'} · inscrite le {dateFr(societe.inscrit_le)}
            {societe.valide_le ? ' · validée le ' + dateFr(societe.valide_le) : ''}
          </div>
        </div>
        <button type="button" onClick={onFermer} style={{ ...ghostBtn, padding: '5px 9px' }}>Fermer</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        <Mini titre="Utilisateurs" valeur={societe.nb_membres} />
        <Mini titre="Points" valeur={nombre(societe.nb_points)} sous={nombre(societe.nb_points_reseau) + ' du réseau'} />
        <Mini titre="Ventes" valeur={societe.mois_ventes ? societe.mois_ventes + ' mois' : '—'} sous={societe.derniere_vente ? 'jusqu’à ' + new Date(societe.derniere_vente).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : ''} />
        <Mini titre="Dernière connexion" valeur={ilYa(societe.derniere_connexion)} />
        <Mini titre="Dernière modification" valeur={ilYa(societe.derniere_activite)} />
        <Mini titre="Actions sur 30 j" valeur={societe.actions_30j} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={surtitre}>Abonnement et contact</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label style={labelStyle}>Statut
            <select {...champ('statut')} style={inputStyle}>
              {Object.entries(STATUTS_SOCIETE).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Formule
            <select {...champ('formule')} style={inputStyle}>
              <option value="">—</option>
              {FORMULES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Fin d’abonnement
            <input type="date" {...champ('fin')} style={inputStyle} />
          </label>
          <label style={labelStyle}>Téléphone
            <input {...champ('telephone')} placeholder="+216 …" style={inputStyle} />
          </label>
        </div>
        <label style={labelStyle}>Contact
          <input {...champ('contact')} placeholder="Nom et fonction de l’interlocuteur" style={inputStyle} />
        </label>
        {msg && <Message type={msg.type}>{msg.text}</Message>}
        <button type="button" onClick={enregistrer} disabled={busy} style={btn(undefined, busy)}>{busy ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={surtitre}>Utilisateurs</div>
        {!membres ? <div style={{ fontSize: '12px', color: C.muted }}>Chargement…</div> : membres.map((m) => (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nom_affiche || m.email}</div>
              {m.nom_affiche && <div style={{ fontSize: '11.5px', color: C.muted }}>{m.email}</div>}
            </div>
            <span style={{ fontSize: '11px', color: C.brandDark, background: C.brandSoft, padding: '1px 7px', borderRadius: '999px', fontWeight: 600 }}>{m.role}</span>
            <span style={{ fontSize: '11.5px', color: C.muted, width: '78px', textAlign: 'right' }}>{ilYa(m.derniere_connexion)}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={surtitre}>Suivi client</div>
        <form onSubmit={ajouterNote} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['appel', 'rdv', 'relance', 'note'].map((g) => (
              <button key={g} type="button" onClick={() => setNote({ ...note, genre: g })} style={{ ...chip(note.genre === g), padding: '5px 10px', fontSize: '11.5px' }}>{GENRES[g]}</button>
            ))}
          </div>
          <textarea value={note.texte} onChange={(e) => setNote({ ...note, texte: e.target.value })} rows={2} placeholder="Ex : démo faite avec le directeur commercial, attend le devis"
            style={{ ...inputStyle, marginTop: 0, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <label style={{ ...labelStyle, flex: 1 }}>Prochaine relance (facultatif)
              <input type="date" value={note.relance} onChange={(e) => setNote({ ...note, relance: e.target.value })} style={inputStyle} />
            </label>
            <button type="submit" disabled={!note.texte.trim()} style={{ ...btn(undefined, !note.texte.trim()), padding: '10px 14px' }}>Ajouter</button>
          </div>
        </form>
        {suivi && suivi.length === 0 && <div style={{ fontSize: '12px', color: C.faint }}>Aucune note pour l’instant.</div>}
        {(suivi || []).map((n) => {
          const due = n.relance_le && !n.fait && joursAvant(n.relance_le) <= 0;
          return (
            <div key={n.id} style={{ borderLeft: '3px solid ' + (n.genre === 'statut' ? C.success : due ? C.brand : C.line), padding: '4px 0 4px 10px', fontSize: '12.5px' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', color: C.muted, fontSize: '11px' }}>
                <b style={{ color: C.body }}>{GENRES[n.genre] || n.genre}</b>
                <span>{dateFr(n.cree_le)}</span>
                {n.auteur_email && <span>· {n.auteur_email}</span>}
              </div>
              <div style={{ color: C.text, marginTop: '2px', whiteSpace: 'pre-wrap' }}>{n.texte}</div>
              {n.relance_le && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '11.5px', color: n.fait ? C.faint : due ? C.brand : C.body, fontWeight: due ? 700 : 500, cursor: 'pointer' }}>
                  <input type="checkbox" checked={n.fait} onChange={() => basculer(n)} />
                  Relance du {dateFr(n.relance_le)} {n.fait ? '(faite)' : ''}
                </label>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function Mini({ titre, valeur, sous }) {
  return (
    <div style={{ background: C.bg, borderRadius: '10px', padding: '8px 10px' }}>
      <div style={{ fontSize: '10px', color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{titre}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: C.text, marginTop: '2px' }}>{valeur}</div>
      {sous && <div style={{ fontSize: '10.5px', color: C.muted }}>{sous}</div>}
    </div>
  );
}
