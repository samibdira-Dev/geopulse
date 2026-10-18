'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { champsDuType, champsManquants, isManagerRole, nettoyerDonnees, traduireErreur } from '../lib/points';
import { inputStyle, labelStyle, btn, ghostBtn, Message } from './ui';

const SOURCES = {
  gps: 'position GPS',
  pin_manuel: 'pin posé sur la carte',
  import: 'import',
  osm: 'OpenStreetMap',
};

function ChampInput({ champ, value, onChange }) {
  const v = value === undefined || value === null ? '' : value;
  if (champ.type_champ === 'liste') {
    const options = Array.isArray(champ.options) ? champ.options : [];
    return (
      <select value={v} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (champ.type_champ === 'oui_non') {
    return (
      <select value={String(v)} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </select>
    );
  }
  if (champ.type_champ === 'nombre') {
    return <input type="number" step="any" value={v} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
  }
  if (champ.type_champ === 'date') {
    return <input type="date" value={v} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
  }
  return <input type="text" value={v} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
}

export default function PointForm({
  types,
  champs,
  position,
  editing,
  role,
  societeId,
  onUseGps,
  onSaved,
  onCancelEdit,
}) {
  const [typeId, setTypeId] = useState('');
  const [nom, setNom] = useState('');
  const [gouvernorat, setGouvernorat] = useState('');
  const [delegation, setDelegation] = useState('');
  const [adresse, setAdresse] = useState('');
  const [donnees, setDonnees] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const manager = isManagerRole(role);
  const champsType = useMemo(() => champsDuType(champs, typeId), [champs, typeId]);

  // Type par défaut : le premier de la liste.
  useEffect(() => {
    if (types.length && !types.some((t) => t.id === typeId)) setTypeId(types[0].id);
  }, [types, typeId]);

  // Une nouvelle position (clic, glissement du pin, GPS) remplit la zone détectée.
  useEffect(() => {
    if (!position) return;
    setGouvernorat(position.gouvernorat || '');
    setDelegation(position.quartier || '');
    setAdresse(position.adresse || '');
  }, [position && position.lat, position && position.lng, position && position.gouvernorat, position && position.quartier, position && position.adresse]); // eslint-disable-line react-hooks/exhaustive-deps

  // Passage en mode modification.
  useEffect(() => {
    if (!editing) return;
    setTypeId(editing.type_id);
    setNom(editing.nom || '');
    setDonnees(editing.donnees || {});
    setError('');
  }, [editing && editing.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const annuler = () => {
    setNom('');
    setDonnees({});
    setError('');
    if (onCancelEdit) onCancelEdit();
  };

  const enregistrer = async (statut) => {
    setError('');
    if (!position) return setError('Cliquez sur la carte (ou utilisez votre position) pour fixer l’emplacement du point.');
    if (!typeId) return setError('Choisissez un type de point.');
    if (!nom.trim()) return setError('Le nom est obligatoire.');
    if (statut !== 'brouillon') {
      const manquants = champsManquants(champsType, donnees);
      if (manquants.length) return setError('Champs obligatoires : ' + manquants.join(', ') + '.');
    }

    const row = {
      type_id: typeId,
      nom: nom.trim(),
      latitude: Number(position.lat.toFixed(6)),
      longitude: Number(position.lng.toFixed(6)),
      gouvernorat: gouvernorat.trim() || null,
      delegation: delegation.trim() || null,
      adresse: adresse.trim() || null,
      source_position: position.source || 'pin_manuel',
      precision_m: position.precision == null ? null : position.precision,
      donnees: nettoyerDonnees(champsType, donnees),
      statut,
    };

    setSaving(true);
    const requete = editing
      ? supabase.from('points').update(row).eq('id', editing.id).select('id')
      : supabase.from('points').insert([{ ...row, societe_id: societeId }]).select('id');
    const { data, error: err } = await requete;
    setSaving(false);

    if (err) return setError(traduireErreur(err));
    if (!data || data.length === 0) {
      return setError('Modification refusée : ce point n’est plus modifiable (déjà soumis ou validé).');
    }
    setNom('');
    setDonnees({});
    onSaved(statut);
  };

  const peutBrouillon = !editing || manager || ['brouillon', 'rejete'].includes(editing.statut);

  return (
    <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>
          {editing ? `✏️ Modifier « ${editing.nom} »` : '➕ Nouveau point'}
        </h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
          Cliquez sur la carte pour fixer le point, puis glissez le pin violet pour l’ajuster.
        </p>
      </div>

      {position ? (
        <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#4c1d95' }}>
          📍 <b>{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</b> ({SOURCES[position.source] || 'pin sur la carte'}
          {position.source === 'gps' && position.precision != null ? `, précision ±${position.precision} m` : ''})
          {position.source === 'gps' && position.precision > 100 && (
            <div style={{ color: '#b45309', marginTop: '4px' }}>
              Précision GPS faible : vérifiez la position et ajustez le pin si besoin.
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          Aucun emplacement. Cliquez sur la carte.
        </div>
      )}

      {onUseGps && (
        <button type="button" onClick={onUseGps} style={ghostBtn}>📡 Utiliser ma position actuelle</button>
      )}

      <div>
        <label style={labelStyle}>Type *</label>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} style={inputStyle}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Nom *</label>
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Pharmacie du Lac" style={inputStyle} />
      </div>

      {champsType.map((c) => (
        <div key={c.id}>
          <label style={labelStyle}>{c.libelle}{c.obligatoire ? ' *' : ''}</label>
          <ChampInput champ={c} value={donnees[c.cle]} onChange={(val) => setDonnees({ ...donnees, [c.cle]: val })} />
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Gouvernorat (détecté)</label>
          <input value={gouvernorat} onChange={(e) => setGouvernorat(e.target.value)} style={{ ...inputStyle, border: '1px solid #3b82f6', background: '#eff6ff', fontWeight: 'bold' }} />
        </div>
        <div>
          <label style={labelStyle}>Ville / quartier (détecté)</label>
          <input value={delegation} onChange={(e) => setDelegation(e.target.value)} style={{ ...inputStyle, border: '1px solid #3b82f6', background: '#eff6ff', fontWeight: 'bold' }} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Adresse</label>
        <input value={adresse} onChange={(e) => setAdresse(e.target.value)} style={inputStyle} />
      </div>

      {editing && editing.statut === 'rejete' && editing.commentaire_validation && (
        <Message>Motif du rejet : {editing.commentaire_validation}</Message>
      )}
      {error && <Message>{error}</Message>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {peutBrouillon && (
          <button type="button" disabled={saving} onClick={() => enregistrer('brouillon')} style={btn('#64748b', saving)}>
            💾 Enregistrer en brouillon
          </button>
        )}
        {peutBrouillon && (
          <button type="button" disabled={saving} onClick={() => enregistrer('a_valider')} style={btn('#f59e0b', saving)}>
            📤 Envoyer pour validation
          </button>
        )}
        {manager && (
          <button type="button" disabled={saving} onClick={() => enregistrer('valide')} style={btn('#16a34a', saving)}>
            ✅ Enregistrer et valider
          </button>
        )}
        {editing && (
          <button type="button" onClick={annuler} style={ghostBtn}>Annuler la modification</button>
        )}
      </div>
    </form>
  );
}
