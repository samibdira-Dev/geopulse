'use client';
import { useMemo } from 'react';
import { GOUV_COORDS, normalizeGouvernorat, sameGouvernorat } from '../lib/gouvernorats';
import { statsGouvernorat } from '../lib/simulation';
import { C, Empty, SectionTitle, inputStyle, surtitre } from './ui';

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
      <SectionTitle icon="users" title="Démographie (INS)">
        Choisissez un gouvernorat pour zoomer dessus et voir ses délégations.
      </SectionTitle>

      <select value={gouvernorat} onChange={(e) => onGouvernorat(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }}>
        <option value="Tous">Tous les gouvernorats ({demographie.length} délégations)</option>
        {Object.keys(GOUV_COORDS).map((g) => <option key={g} value={g}>{g}</option>)}
      </select>

      {total && (
        <div style={{ background: 'radial-gradient(120% 140% at 100% 0%, #4c1d95 0%, #1e1b4b 45%, #0b1020 100%)', borderRadius: '18px', padding: '16px 18px', color: 'white', boxShadow: '0 12px 30px rgba(30,27,75,.3)' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#a5b4fc', fontWeight: 600 }}>{gouvernorat}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '8px' }}>
            {[['Habitants', fmt(total.population)], ['Ménages', fmt(total.menages)], ['Revenu moy.', total.revenu != null ? fmt(Math.round(total.revenu)) + ' TND' : '—']].map(([l, v]) => (
              <div key={l}>
                <div className="num" style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-.01em' }}>{v}</div>
                <div style={{ fontSize: '11px', color: '#c7d2fe' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {demographie.length === 0 && (
        <Empty icon="users">Aucune donnée démographique disponible.</Empty>
      )}

      {lignes.map((z, i) => (
        <div key={z.id ?? `${z.gouvernorat}-${z.delegation}-${i}`} className="gp-row" style={{ border: '1px solid ' + C.line, borderRadius: '14px', padding: '12px 14px', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{normalizeGouvernorat(z.gouvernorat) || z.gouvernorat} — {z.delegation}</span>
            {z.potentiel_conso && <span style={{ background: '#eef0ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{z.potentiel_conso}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '13px', color: '#475569', marginTop: '10px' }}>
            <div><div style={surtitre}>Population</div><b className="num" style={{ color: C.text }}>{fmt(z.population)}</b></div>
            <div><div style={surtitre}>Ménages</div><b className="num" style={{ color: C.text }}>{fmt(z.nb_menages)}</b></div>
            <div><div style={surtitre}>Revenu moy.</div><b className="num" style={{ color: '#059669' }}>{fmt(z.revenu_moyen_tnd)} TND</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}
