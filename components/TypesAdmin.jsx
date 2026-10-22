'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { champsDuType, traduireErreur } from '../lib/points';
import { PARAMS_EXPLOITATION } from '../lib/rentabilite';
import { SECTEURS } from '../lib/marche';
import { btn, ghostBtn, inputStyle, labelStyle, Message, SectionTitle } from './ui';

const CATEGORIES = {
  client: 'Client',
  prospect: 'Prospect',
  concurrent: 'Concurrent',
  point_de_vente: 'Point de vente',
  autre: 'Autre',
};
const TYPES_CHAMP = { texte: 'Texte', nombre: 'Nombre', liste: 'Liste de choix', date: 'Date', oui_non: 'Oui / Non' };

function slug(libelle) {
  const s = String(libelle || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const k = /^[a-z]/.test(s) ? s : 'c_' + s;
  return k.slice(0, 40);
}

// Paramètres d'exploitation d'un type de point de vente (marge, salaires, charges…), pour le calcul de rentabilité.
function ExploitationForm({ type, busy, onSave }) {
  const initial = () => {
    const e = type.exploitation || {};
    return { ...Object.fromEntries(PARAMS_EXPLOITATION.map((f) => [f.cle, e[f.cle] ?? ''])), secteur: e.secteur || '', depense_hab_mois: e.depense_hab_mois ?? '' };
  };
  const [valeurs, setValeurs] = useState(initial);
  const enregistrer = (e) => {
    e.preventDefault();
    const exploitation = {};
    [...PARAMS_EXPLOITATION.map((f) => f.cle), 'depense_hab_mois'].forEach((cle) => {
      const v = String(valeurs[cle]).replace(',', '.').trim();
      if (v !== '' && Number.isFinite(Number(v))) exploitation[cle] = Number(v);
    });
    if (SECTEURS[valeurs.secteur]) exploitation.secteur = valeurs.secteur;
    onSave(exploitation);
  };
  return (
    <form onSubmit={enregistrer} style={{ borderTop: '1px dashed #d5d9e3', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>Paramètres d’exploitation</div>
      <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.45 }}>
        Servent au calcul de rentabilité (point mort, délai de retour) et du potentiel de marché du simulateur. Le loyer et l’investissement se saisissent pour chaque site étudié.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {PARAMS_EXPLOITATION.map((f) => (
          <div key={f.cle}>
            <label style={{ ...labelStyle, fontSize: '11px' }}>{f.libelle} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({f.unite})</span></label>
            <input inputMode="decimal" value={valeurs[f.cle]} onChange={(e) => setValeurs({ ...valeurs, [f.cle]: e.target.value })}
              placeholder={f.defaut != null ? String(f.defaut) : ''} style={inputStyle} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <div>
          <label style={{ ...labelStyle, fontSize: '11px' }}>Secteur <span style={{ color: '#94a3b8', fontWeight: 500 }}>(potentiel de marché)</span></label>
          <select value={valeurs.secteur} onChange={(e) => setValeurs({ ...valeurs, secteur: e.target.value })} style={inputStyle}>
            <option value="">Non renseigné</option>
            {Object.entries(SECTEURS).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
          </select>
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: '11px' }}>Dépense par habitant <span style={{ color: '#94a3b8', fontWeight: 500 }}>(TND/mois, facultatif)</span></label>
          <input inputMode="decimal" value={valeurs.depense_hab_mois} onChange={(e) => setValeurs({ ...valeurs, depense_hab_mois: e.target.value })}
            placeholder={SECTEURS[valeurs.secteur] ? `${(Math.round(SECTEURS[valeurs.secteur].depenseAn / 1.2) / 10).toLocaleString('fr-FR')} (INS 2021)` : ''} style={inputStyle} />
        </div>
      </div>
      <button type="submit" disabled={busy} style={btn(undefined, busy)}>Enregistrer les paramètres</button>
    </form>
  );
}

// Réservé aux administrateurs : types de points et champs personnalisés de la société.
export default function TypesAdmin({ societeId, types, champs, onChanged }) {
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nouveau, setNouveau] = useState({ nom: '', categorie: 'client', couleur: '#3b82f6' });
  const [ouvert, setOuvert] = useState(null);
  const [champ, setChamp] = useState({ libelle: '', type_champ: 'texte', options: '', obligatoire: false });

  const executer = async (promesse, ok) => {
    setBusy(true);
    setMessage(null);
    const { error } = await promesse;
    setBusy(false);
    if (error) setMessage({ type: 'err', text: traduireErreur(error) });
    else if (ok) setMessage({ type: 'ok', text: ok });
    onChanged();
    return !error;
  };

  const ajouterType = async (e) => {
    e.preventDefault();
    const ordre = types.length ? Math.max(...types.map((t) => t.ordre || 0)) + 1 : 0;
    const ok = await executer(
      supabase.from('types_point').insert([{ societe_id: societeId, nom: nouveau.nom.trim(), categorie: nouveau.categorie, couleur: nouveau.couleur, ordre }]),
      'Type ajouté.'
    );
    if (ok) setNouveau({ ...nouveau, nom: '' });
  };

  const majType = (t, patch) => executer(supabase.from('types_point').update(patch).eq('id', t.id).eq('societe_id', societeId));

  const supprimerType = async (t) => {
    if (!window.confirm(`Supprimer le type « ${t.nom} » ? Impossible s’il est utilisé par des points : désactivez-le plutôt.`)) return;
    await executer(supabase.from('types_point').delete().eq('id', t.id).eq('societe_id', societeId), 'Type supprimé.');
  };

  const ajouterChamp = async (e, t) => {
    e.preventDefault();
    const options = champ.type_champ === 'liste' ? champ.options.split(',').map((o) => o.trim()).filter(Boolean) : [];
    if (champ.type_champ === 'liste' && options.length < 2) {
      setMessage({ type: 'err', text: 'Une liste de choix demande au moins deux options séparées par des virgules.' });
      return;
    }
    const existants = champsDuType(champs, t.id);
    let cle = slug(champ.libelle);
    if (!cle) {
      setMessage({ type: 'err', text: 'Libellé invalide.' });
      return;
    }
    let base = cle;
    let n = 2;
    while (existants.some((c) => c.cle === cle)) cle = base.slice(0, 37) + '_' + n++;
    const ordre = existants.length ? Math.max(...existants.map((c) => c.ordre || 0)) + 1 : 0;
    const ok = await executer(
      supabase.from('champs_type').insert([{
        type_id: t.id, societe_id: societeId, cle, libelle: champ.libelle.trim(),
        type_champ: champ.type_champ, options, obligatoire: champ.obligatoire, ordre,
      }]),
      'Champ ajouté.'
    );
    if (ok) setChamp({ libelle: '', type_champ: 'texte', options: '', obligatoire: false });
  };

  const supprimerChamp = async (c) => {
    if (!window.confirm(`Supprimer le champ « ${c.libelle} » ? Les valeurs déjà saisies restent dans les fiches mais ne seront plus affichées.`)) return;
    await executer(supabase.from('champs_type').delete().eq('id', c.id).eq('societe_id', societeId), 'Champ supprimé.');
  };

  const basculerObligatoire = (c) => executer(supabase.from('champs_type').update({ obligatoire: !c.obligatoire }).eq('id', c.id).eq('societe_id', societeId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionTitle icon="tag" title={'Types et champs'}>
        Définissez vos types de points (client, concurrent, agence…) et les informations à saisir pour chacun.
      </SectionTitle>

      {message && <Message type={message.type}>{message.text}</Message>}

      {types.map((t) => {
        const cs = champsDuType(champs, t.id);
        const est = ouvert === t.id;
        return (
          <div key={t.id} style={{ border: '1px solid #e7e9f0', borderRadius: '12px', background: '#fbfbfd', opacity: t.actif ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px' }}>
              <input type="color" value={t.couleur} onChange={(e) => majType(t, { couleur: e.target.value })} style={{ width: '28px', height: '28px', border: 'none', padding: 0, background: 'none' }} title="Couleur" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{t.nom}{t.actif ? '' : ' (désactivé)'}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>{CATEGORIES[t.categorie] || t.categorie} · {cs.length} champ(s)</div>
              </div>
              <button type="button" onClick={() => setOuvert(est ? null : t.id)} style={ghostBtn}>{est ? 'Fermer' : ['point_de_vente', 'client'].includes(t.categorie) ? 'Champs et exploitation' : 'Champs'}</button>
            </div>

            {est && (
              <div style={{ borderTop: '1px solid #e7e9f0', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cs.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155' }}>
                    <span style={{ flex: 1 }}>
                      <b>{c.libelle}</b> · {TYPES_CHAMP[c.type_champ]}
                      {c.type_champ === 'liste' && Array.isArray(c.options) ? ` (${c.options.join(', ')})` : ''}
                    </span>
                    <label style={{ whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={c.obligatoire} onChange={() => basculerObligatoire(c)} /> obligatoire
                    </label>
                    <button type="button" onClick={() => supprimerChamp(c)} style={{ ...ghostBtn, color: '#b91c1c' }}>✕</button>
                  </div>
                ))}
                {cs.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8' }}>Aucun champ pour ce type.</div>}

                <form onSubmit={(e) => ajouterChamp(e, t)} style={{ borderTop: '1px dashed #d5d9e3', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <input required value={champ.libelle} onChange={(e) => setChamp({ ...champ, libelle: e.target.value })} placeholder="Libellé (ex : Chiffre d’affaires)" style={inputStyle} />
                    <select value={champ.type_champ} onChange={(e) => setChamp({ ...champ, type_champ: e.target.value })} style={inputStyle}>
                      {Object.entries(TYPES_CHAMP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {champ.type_champ === 'liste' && (
                    <input value={champ.options} onChange={(e) => setChamp({ ...champ, options: e.target.value })} placeholder="Options séparées par des virgules" style={inputStyle} />
                  )}
                  <label style={{ fontSize: '12px', color: '#334155' }}>
                    <input type="checkbox" checked={champ.obligatoire} onChange={(e) => setChamp({ ...champ, obligatoire: e.target.checked })} /> Obligatoire pour envoyer à validation
                  </label>
                  <button type="submit" disabled={busy || !champ.libelle.trim()} style={btn(undefined, busy || !champ.libelle.trim())}>Ajouter le champ</button>
                </form>

                {['point_de_vente', 'client'].includes(t.categorie) && (
                  <ExploitationForm type={t} busy={busy} onSave={(exploitation) => executer(
                    supabase.from('types_point').update({ exploitation }).eq('id', t.id).eq('societe_id', societeId),
                    'Paramètres d’exploitation enregistrés.'
                  )} />
                )}

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => majType(t, { actif: !t.actif })} style={ghostBtn}>{t.actif ? 'Désactiver ce type' : 'Réactiver ce type'}</button>
                  <button type="button" onClick={() => supprimerType(t)} style={{ ...ghostBtn, color: '#b91c1c' }}>Supprimer ce type</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <form onSubmit={ajouterType} style={{ borderTop: '1px solid #e7e9f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Nouveau type de point</div>
        <div>
          <label style={labelStyle}>Nom *</label>
          <input required value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} placeholder="Ex : Grossiste, Agence, Pharmacie…" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <select value={nouveau.categorie} onChange={(e) => setNouveau({ ...nouveau, categorie: e.target.value })} style={inputStyle}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <input type="color" value={nouveau.couleur} onChange={(e) => setNouveau({ ...nouveau, couleur: e.target.value })} style={{ width: '40px', height: '36px', border: 'none', padding: 0, background: 'none' }} title="Couleur" />
        </div>
        <button type="submit" disabled={busy || !nouveau.nom.trim()} style={btn('#059669', busy || !nouveau.nom.trim())}>Ajouter le type</button>
      </form>
    </div>
  );
}
