'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { traduireErreur } from '../lib/points';
import { devinerColonnes, lireFichier, preparerImport } from '../lib/ventes';
import { C, btn, ghostBtn, inputStyle, labelStyle, Message, SectionTitle } from './ui';
import PointsImport from './PointsImport';

const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR'));
const moisLabel = (p) => (p ? new Date(p + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '—');
const CHAMPS = [
  ['code', 'Code client *'],
  ['date', 'Date ou mois *'],
  ['montant', 'Montant (TND) *'],
  ['quantite', 'Quantité'],
];
const LOT = 500;

// Réservé aux managers et administrateurs : import des points ou des ventes (Excel / CSV d'un ERP).
export default function VentesImport({ societeId, points, types = [], champs = [], onChanged }) {
  const [vue, setVue] = useState(points.length ? 'ventes' : 'points');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionTitle icon="chart" title={'Import'}>
        Ajoutez vos points et vos ventes depuis un fichier Excel ou CSV exporté de votre ERP.
      </SectionTitle>
      <div style={{ display: 'flex', gap: '2px', background: C.bg, border: '1px solid ' + C.line, borderRadius: '10px', padding: '3px' }}>
        {[['points', 'Points et leurs données'], ['ventes', 'Ventes mensuelles']].map(([m, l]) => (
          <button key={m} type="button" onClick={() => setVue(m)} style={{ flex: 1, border: 'none', borderRadius: '8px', padding: '6px 8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', background: vue === m ? 'white' : 'transparent', color: vue === m ? C.brand : C.muted, boxShadow: vue === m ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>{l}</button>
        ))}
      </div>
      {vue === 'points'
        ? <PointsImport societeId={societeId} types={types} champs={champs} points={points} onChanged={onChanged} />
        : <ImportVentes societeId={societeId} points={points} onChanged={onChanged} />}
    </div>
  );
}

function ImportVentes({ societeId, points, onChanged }) {
  const [fichier, setFichier] = useState(null);
  const [table, setTable] = useState(null);
  const [colonnes, setColonnes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progression, setProgression] = useState(0);
  const [message, setMessage] = useState(null);
  const [mensuel, setMensuel] = useState([]);

  const chargerMensuel = async () => {
    const { data } = await supabase.rpc('ventes_mensuelles', { p_societe: societeId });
    setMensuel(data || []);
  };
  useEffect(() => { chargerMensuel(); }, [societeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const avecCode = points.filter((p) => p.code_externe).length;

  const choisirFichier = async (f) => {
    setMessage(null);
    setTable(null);
    setFichier(f || null);
    if (!f) return;
    try {
      const t = await lireFichier(f);
      if (!t.lignes.length) throw new Error('Le fichier ne contient aucune ligne de données.');
      setTable(t);
      setColonnes(devinerColonnes(t.entetes));
    } catch (e) {
      setMessage({ type: 'err', text: 'Lecture impossible : ' + (e.message || e) });
    }
  };

  const apercu = useMemo(() => {
    if (!table || !colonnes || colonnes.code < 0 || colonnes.date < 0 || colonnes.montant < 0) return null;
    return preparerImport(table.lignes, colonnes, points);
  }, [table, colonnes, points]);

  const importer = async () => {
    if (!apercu || !apercu.lignesVentes.length) return;
    setBusy(true);
    setMessage(null);
    const lignes = apercu.lignesVentes.map((l) => ({ ...l, societe_id: societeId }));
    for (let i = 0; i < lignes.length; i += LOT) {
      const { error } = await supabase.from('ventes').upsert(lignes.slice(i, i + LOT), { onConflict: 'point_id,periode' });
      if (error) {
        setBusy(false);
        setMessage({ type: 'err', text: `Import interrompu après ${i} lignes : ${traduireErreur(error)}` });
        return;
      }
      setProgression(Math.min(lignes.length, i + LOT) / lignes.length);
    }
    setBusy(false);
    setProgression(0);
    setMessage({ type: 'ok', text: `${lignes.length.toLocaleString('fr-FR')} montants mensuels importés pour ${apercu.pointsReconnus} points. Les mois déjà présents ont été remplacés.` });
    setTable(null);
    setFichier(null);
    chargerMensuel();
    onChanged();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '12.5px', color: C.body, lineHeight: 1.5 }}>
        Une ligne par facture ou par mois, avec le code client, la date et le montant. Chaque ligne est reliée au point qui porte le même « Code client (ERP) ».
      </div>

      {avecCode === 0 && (
        <Message>Aucun point n’a encore de code client. Renseignez le champ « Code client (ERP) » sur vos points pour pouvoir y relier les ventes.</Message>
      )}

      {message && <Message type={message.type}>{message.text}</Message>}

      <label style={{ ...ghostBtn, display: 'block', textAlign: 'center', padding: '14px', borderStyle: 'dashed', cursor: 'pointer' }}>
        {fichier ? `${fichier.name}` : 'Choisir un fichier Excel ou CSV'}
        <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => choisirFichier(e.target.files[0])} style={{ display: 'none' }} />
      </label>

      {table && colonnes && (
        <div style={{ border: '1px solid #e7e9f0', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>Colonnes du fichier ({table.lignes.length.toLocaleString('fr-FR')} lignes)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {CHAMPS.map(([k, label]) => (
              <div key={k}>
                <label style={labelStyle}>{label}</label>
                <select value={colonnes[k]} onChange={(e) => setColonnes({ ...colonnes, [k]: Number(e.target.value) })} style={inputStyle}>
                  <option value={-1}>—</option>
                  {table.entetes.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {apercu && (
            <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6 }}>
              <div>Période : <b>{moisLabel(apercu.debut)} → {moisLabel(apercu.fin)}</b></div>
              <div>Total reconnu : <b>{fmt(apercu.total)} TND</b> sur <b>{apercu.pointsReconnus}</b> points</div>
              {apercu.lignesRejetees > 0 && <div style={{ color: '#b45309' }}>{apercu.lignesRejetees} lignes ignorées (date ou montant illisible)</div>}
              {apercu.inconnus.length > 0 && (
                <div style={{ color: '#b45309' }}>
                  {apercu.inconnus.length} code{apercu.inconnus.length > 1 ? 's' : ''} client{apercu.inconnus.length > 1 ? 's' : ''} sans point correspondant ({fmt(apercu.inconnus.reduce((s, i) => s + i.montant, 0))} TND) :{' '}
                  {apercu.inconnus.slice(0, 8).map((i) => i.code).join(', ')}{apercu.inconnus.length > 8 ? '…' : ''}
                </div>
              )}
            </div>
          )}

          <button type="button" disabled={busy || !apercu || !apercu.lignesVentes.length} onClick={importer} style={btn(undefined, busy || !apercu || !apercu.lignesVentes.length)}>
            {busy ? `Import… ${Math.round(progression * 100)} %` : `Importer ${apercu ? apercu.lignesVentes.length.toLocaleString('fr-FR') : 0} montants mensuels`}
          </button>
        </div>
      )}

      <div>
        <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', marginBottom: '6px' }}>Ventes importées par mois</div>
        {mensuel.length === 0 ? (
          <div style={{ border: '1px dashed #d5d9e3', borderRadius: '12px', padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Aucune vente importée.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '4px' }}>Mois</th>
                <th style={{ padding: '4px', textAlign: 'right' }}>CA (TND)</th>
                <th style={{ padding: '4px', textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {mensuel.slice(0, 12).map((m) => (
                <tr key={m.periode} style={{ borderTop: '1px solid #e7e9f0' }}>
                  <td style={{ padding: '4px' }}>{moisLabel(m.periode)}</td>
                  <td style={{ padding: '4px', textAlign: 'right', fontWeight: 600 }}>{fmt(m.montant)}</td>
                  <td style={{ padding: '4px', textAlign: 'right' }}>{m.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
