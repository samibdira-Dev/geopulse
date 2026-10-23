'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CLE_CODE_ERP, champsDuType, traduireErreur } from '../lib/points';
import { lireFichier } from '../lib/ventes';
import { chargerDelegations } from '../lib/recensement';
import { COLONNES_BASE, devinerColonnesPoints, modeleImport, preparerImportPoints } from '../lib/importPoints';
import { C, Message, btn, ghostBtn, inputStyle, labelStyle } from './ui';

const LOT = 200;
const PARALLELE = 6;
const nb = (n) => n.toLocaleString('fr-FR');

// Réservé aux managers et administrateurs : création et mise à jour des points depuis un fichier Excel ou CSV
// (liste des magasins ou des clients d'un ERP, avec leurs loyers, surfaces, références…).
export default function PointsImport({ societeId, types, champs, points, onChanged }) {
  const actifs = types.filter((t) => t.actif !== false);
  const [typeId, setTypeId] = useState(actifs[0] ? actifs[0].id : '');
  const [fichier, setFichier] = useState(null);
  const [table, setTable] = useState(null);
  const [colonnes, setColonnes] = useState(null);
  const [delegations, setDelegations] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progression, setProgression] = useState(0);
  const [message, setMessage] = useState(null);

  useEffect(() => { chargerDelegations().then(setDelegations).catch(() => {}); }, []);

  const type = types.find((t) => t.id === typeId) || null;
  const champsType = useMemo(() => (type ? champsDuType(champs, type.id) : []), [champs, type]);
  const champsLibres = champsType.filter((c) => c.cle !== CLE_CODE_ERP);
  const libelleCode = (champsType.find((c) => c.cle === CLE_CODE_ERP) || {}).libelle || 'Code ERP';

  useEffect(() => { if (table) setColonnes(devinerColonnesPoints(table.entetes, champsType)); }, [table, champsType]);

  const choisirFichier = async (f) => {
    setMessage(null);
    setTable(null);
    setFichier(f || null);
    if (!f) return;
    try {
      const t = await lireFichier(f);
      if (!t.lignes.length) throw new Error('Le fichier ne contient aucune ligne de données.');
      setTable(t);
    } catch (e) {
      setMessage({ type: 'err', text: 'Lecture impossible : ' + (e.message || e) });
    }
  };

  const apercu = useMemo(() => {
    if (!table || !colonnes || (colonnes.nom < 0 && colonnes.code < 0)) return null;
    return preparerImportPoints({ lignes: table.lignes, colonnes, types, champs, points, typeParDefaut: type, delegations });
  }, [table, colonnes, types, champs, points, type, delegations]);

  const telechargerModele = async () => {
    if (!type) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(modeleImport(type, champsType));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Points');
    XLSX.writeFile(wb, `modele-import-${type.nom.replace(/[^\w-]+/g, '-').toLowerCase()}.xlsx`);
  };

  const importer = async () => {
    if (!apercu) return;
    const total = apercu.creations.length + apercu.majs.length;
    if (!total) return;
    setBusy(true);
    setMessage(null);
    let faits = 0;
    const avancer = (n) => { faits += n; setProgression(faits / total); };
    const lignes = apercu.creations.map(({ ligne, ...r }) => ({ ...r, societe_id: societeId }));
    for (let i = 0; i < lignes.length; i += LOT) {
      const { error } = await supabase.from('points').insert(lignes.slice(i, i + LOT));
      if (error) {
        setBusy(false);
        setMessage({ type: 'err', text: `Import interrompu après ${nb(faits)} points : ${traduireErreur(error)}` });
        onChanged();
        return;
      }
      avancer(Math.min(LOT, lignes.length - i));
    }
    const refus = [];
    for (let i = 0; i < apercu.majs.length; i += PARALLELE) {
      const lot = apercu.majs.slice(i, i + PARALLELE);
      const res = await Promise.all(lot.map((m) => supabase.from('points').update(m.patch).eq('id', m.id).eq('societe_id', societeId).select('id')));
      res.forEach((r, k) => { if (r.error || !r.data || !r.data.length) refus.push(`${lot[k].nom} (ligne ${lot[k].ligne})`); });
      avancer(lot.length);
    }
    setBusy(false);
    setProgression(0);
    const ok = total - refus.length;
    setMessage({
      type: refus.length ? 'err' : 'ok',
      text: `${nb(apercu.creations.length)} points créés, ${nb(apercu.majs.length - refus.length)} mis à jour.`
        + (apercu.brouillons ? ` ${nb(apercu.brouillons)} créés en brouillon car des champs obligatoires manquent.` : '')
        + (refus.length ? ` Mise à jour refusée pour ${refus.length} : ${refus.slice(0, 5).join(', ')}${refus.length > 5 ? '…' : ''}.` : ''),
    });
    if (ok) { setTable(null); setFichier(null); }
    onChanged();
  };

  const selecteur = (valeur, onChange) => (
    <select value={valeur ?? -1} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle}>
      <option value={-1}>—</option>
      {table.entetes.map((h, i) => <option key={i} value={i}>{h}</option>)}
    </select>
  );

  const total = apercu ? apercu.creations.length + apercu.majs.length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '12.5px', color: C.body, lineHeight: 1.5 }}>
        Importez la liste de vos magasins ou de vos clients : nom, coordonnées GPS, code ERP et toutes les informations du type
        (loyer, surface, nombre de références, marge…). Un point dont le code ERP existe déjà est mis à jour, les autres sont créés.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Type des points importés</label>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} style={inputStyle}>
            {actifs.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
        </div>
        <button type="button" onClick={telechargerModele} disabled={!type} style={ghostBtn}>Modèle Excel</button>
      </div>

      {message && <Message type={message.type}>{message.text}</Message>}

      <label style={{ ...ghostBtn, display: 'block', textAlign: 'center', padding: '14px', borderStyle: 'dashed', cursor: 'pointer' }}>
        {fichier ? fichier.name : 'Choisir un fichier Excel ou CSV'}
        <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => choisirFichier(e.target.files[0])} style={{ display: 'none' }} />
      </label>

      {table && colonnes && (
        <div style={{ border: '1px solid ' + C.line, borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: C.text }}>Colonnes du fichier ({nb(table.lignes.length)} lignes)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {COLONNES_BASE.map(([cle, libelle]) => (
              <div key={cle}>
                <label style={labelStyle}>{cle === 'code' ? libelleCode : libelle}</label>
                {selecteur(colonnes[cle], (v) => setColonnes({ ...colonnes, [cle]: v }))}
              </div>
            ))}
            {champsLibres.map((c) => (
              <div key={c.id || c.cle}>
                <label style={labelStyle}>{c.libelle}{c.obligatoire ? ' *' : ''}</label>
                {selecteur(colonnes.champs[c.cle], (v) => setColonnes({ ...colonnes, champs: { ...colonnes.champs, [c.cle]: v } }))}
              </div>
            ))}
          </div>

          {apercu && (
            <div style={{ fontSize: '12px', color: C.body, lineHeight: 1.6 }}>
              <div><b className="num">{nb(apercu.creations.length)}</b> nouveaux points
                {apercu.brouillons ? <span style={{ color: C.warning }}> (dont {nb(apercu.brouillons)} en brouillon : champs obligatoires manquants)</span> : ''}</div>
              <div><b className="num">{nb(apercu.majs.length)}</b> points existants mis à jour (même code ERP)</div>
              {apercu.erreurs.length > 0 && (
                <div style={{ color: C.warning }}>
                  {nb(apercu.erreurs.length)} ligne{apercu.erreurs.length > 1 ? 's' : ''} ignorée{apercu.erreurs.length > 1 ? 's' : ''} :
                  <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>
                    {apercu.erreurs.slice(0, 6).map((e) => <li key={e.ligne}>ligne {e.ligne} : {e.raison}</li>)}
                  </ul>
                  {apercu.erreurs.length > 6 ? `et ${nb(apercu.erreurs.length - 6)} autres…` : ''}
                </div>
              )}
            </div>
          )}

          <button type="button" disabled={busy || !total} onClick={importer} style={btn(undefined, busy || !total)}>
            {busy ? `Import… ${Math.round(progression * 100)} %` : `Importer ${nb(total)} points`}
          </button>
        </div>
      )}
    </div>
  );
}
