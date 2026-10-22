'use client';
import { useMemo } from 'react';
import { GOUV_COORDS, normalizeGouvernorat, sameGouvernorat } from '../lib/gouvernorats';
import { statsGouvernorat } from '../lib/simulation';
import { inputStyle } from './ui';

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));

// Données INS (table decoupage_administratif) par gouvernorat et délégation.
export default function DemographiePanel({ demographie, gouvernorat, onGouvernorat }) {
  const lignes = useMemo(() => {
    const l = gouvernorat === 'Tous' ? demographie : demographie.filter((d) => sameGouvernorat(d.gouvernorat, gouvernorat));
    return [...l].sort((a, b) => (Number(b.population) || 0) - (Number(a.population) || 0));
  }, [demographie, gouvernorat]);
  const total = gouvernorat === 'Tous' ? null : statsGouvernorat(demographie, gouvernorat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>👥 Démographie (INS)</h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>Choisissez un gouvernorat pour zoomer dessus et voir ses délégations.</p>
      </div>

      <select value={gouvernorat} onChange={(e) => onGouvernorat(e.target.value)} style={{ ...inputStyle, fontWeight: 'bold' }}>
        <option value="Tous">Tous les gouvernorats ({demographie.length} délégations)</option>
        {Object.keys(GOUV_COORDS).map((g) => <option key={g} value={g}>{g}</option>)}
      </select>

      {total && (
        <div style={{ background: '#ede9fe', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#4c1d95' }}>
          <b>{gouvernorat}</b> : {fmt(total.population)} hab. · {fmt(total.menages)} ménages
          {total.revenu != null ? ` · revenu moyen ${fmt(Math.round(total.revenu))} TND` : ''}
        </div>
      )}

      {demographie.length === 0 && (
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          Aucune donnée démographique disponible.
        </div>
      )}

      {lignes.map((z, i) => (
        <div key={z.id ?? `${z.gouvernorat}-${z.delegation}-${i}`} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e293b' }}>{normalizeGouvernorat(z.gouvernorat) || z.gouvernorat} — {z.delegation}</span>
            {z.potentiel_conso && <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>{z.potentiel_conso}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '12px', color: '#475569', marginTop: '6px' }}>
            <div><div style={{ fontSize: '10px', color: '#94a3b8' }}>POPULATION</div><b>{fmt(z.population)}</b></div>
            <div><div style={{ fontSize: '10px', color: '#94a3b8' }}>MÉNAGES</div><b>{fmt(z.nb_menages)}</b></div>
            <div><div style={{ fontSize: '10px', color: '#94a3b8' }}>REVENU MOY.</div><b style={{ color: '#16a34a' }}>{fmt(z.revenu_moyen_tnd)} TND</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}
