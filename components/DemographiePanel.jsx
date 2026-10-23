'use client';
import { useMemo } from 'react';
import { GOUV_COORDS, normalizeGouvernorat, sameGouvernorat } from '../lib/gouvernorats';
import { statsGouvernorat } from '../lib/simulation';
import { PALIERS_DENSITE, couleurDensite } from '../lib/recensement';
import { C, Empty, SectionTitle, inputStyle, surtitre } from './ui';

const fmt = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR'));

// Population et ménages par délégation (recensement INS 2024, lib/recensement.js), revenu saisi dans la table INS.
export default function DemographiePanel({ demographie, gouvernorat, onGouvernorat }) {
  const lignes = useMemo(() => {
    const l = gouvernorat === 'Tous' ? demographie : demographie.filter((d) => sameGouvernorat(d.gouvernorat, gouvernorat));
    return [...l].sort((a, b) => (Number(b.population) || 0) - (Number(a.population) || 0));
  }, [demographie, gouvernorat]);
  const total = gouvernorat === 'Tous'
    ? { population: demographie.reduce((s, d) => s + (Number(d.population) || 0), 0), menages: demographie.reduce((s, d) => s + (Number(d.nb_menages) || 0), 0), revenu: null }
    : statsGouvernorat(demographie, gouvernorat);
  const recensement = demographie.some((d) => d.source);
  const officielles = lignes.filter((d) => d.source === 'rgph2024').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionTitle icon="users" title="Démographie (INS)">
        Choisissez un gouvernorat pour zoomer dessus et voir ses délégations.
      </SectionTitle>

      <select value={gouvernorat} onChange={(e) => onGouvernorat(e.target.value)} style={{ ...inputStyle, fontWeight: 600 }}>
        <option value="Tous">Toute la Tunisie ({demographie.length} délégations)</option>
        {Object.keys(GOUV_COORDS).map((g) => <option key={g} value={g}>{g}</option>)}
      </select>

      {total && total.population > 0 && (
        <div style={{ background: 'radial-gradient(120% 140% at 100% 0%, #4c1d95 0%, #1e1b4b 45%, #0b1020 100%)', borderRadius: '18px', padding: '16px 18px', color: 'white', boxShadow: '0 12px 30px rgba(30,27,75,.3)' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#a5b4fc', fontWeight: 600 }}>{gouvernorat === 'Tous' ? 'Tunisie' : gouvernorat}{recensement ? ' · recensement 2024' : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '8px' }}>
            {[['Habitants', fmt(total.population)], ['Ménages', fmt(total.menages)],
              total.revenu != null ? ['Revenu moy.', fmt(Math.round(total.revenu)) + ' TND'] : ['Pers. / ménage', total.menages ? (Math.round((total.population / total.menages) * 100) / 100).toLocaleString('fr-FR') : '—']].map(([l, v]) => (
              <div key={l}>
                <div className="num" style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-.01em' }}>{v}</div>
                <div style={{ fontSize: '11px', color: '#c7d2fe' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recensement && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: '11px', color: C.muted }}>
          <span style={{ fontWeight: 600, color: C.body }}>Habitants / km²</span>
          {[...PALIERS_DENSITE].reverse().map(([, couleur, libelle]) => (
            <span key={libelle} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: couleur }} />{libelle}
            </span>
          ))}
        </div>
      )}

      {demographie.length === 0 && (
        <Empty icon="users">Aucune donnée démographique disponible.</Empty>
      )}

      {lignes.map((z, i) => (
        <div key={z.id ?? `${z.gouvernorat}-${z.delegation}-${i}`} className="gp-row" style={{ border: '1px solid ' + C.line, borderRadius: '14px', padding: '12px 14px', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', color: '#1e293b', minWidth: 0 }}>
              {z.surface_km2 > 0 && <span style={{ width: 10, height: 10, borderRadius: 3, flex: 'none', background: couleurDensite(z.population / z.surface_km2) }} />}
              {gouvernorat === 'Tous' ? `${normalizeGouvernorat(z.gouvernorat) || z.gouvernorat} — ` : ''}{z.delegation}
            </span>
            {z.source ? (
              <span title={z.source === 'rgph2024' ? 'Chiffre officiel publié par l’INS' : 'Total 2024 du gouvernorat réparti selon la grille de population'}
                style={{ flex: 'none', background: z.source === 'rgph2024' ? '#ecfdf5' : '#f1f5f9', color: z.source === 'rgph2024' ? '#047857' : '#64748b', padding: '2px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: 600 }}>
                {z.source === 'rgph2024' ? 'INS 2024' : 'Estimation 2024'}
              </span>
            ) : z.potentiel_conso && <span style={{ background: '#eef0ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{z.potentiel_conso}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '13px', color: '#475569', marginTop: '10px' }}>
            <div><div style={surtitre}>Population</div><b className="num" style={{ color: C.text }}>{fmt(z.population)}</b></div>
            <div><div style={surtitre}>Ménages</div><b className="num" style={{ color: C.text }}>{fmt(z.nb_menages)}</b></div>
            {z.revenu_moyen_tnd != null
              ? <div><div style={surtitre}>Revenu moy.</div><b className="num" style={{ color: '#059669' }}>{fmt(z.revenu_moyen_tnd)} TND</b></div>
              : <div><div style={surtitre}>Densité</div><b className="num" style={{ color: C.text }}>{z.surface_km2 > 0 ? fmt(Math.round(z.population / z.surface_km2)) : '—'}</b> <span style={{ fontSize: '11px', color: C.muted }}>hab./km²</span></div>}
          </div>
        </div>
      ))}

      {recensement && (
        <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>
          Sources : INS, recensement général de la population et de l’habitat 2024 (population et ménages par gouvernorat
          {officielles ? ', et chiffres officiels des délégations déjà publiés' : ''}). Pour les autres délégations, le total 2024 du gouvernorat
          est réparti selon les habitants de la grille de 250 m (Meta et CIESIN) dans leurs contours (Overture Maps, ODbL) : sur les
          29 délégations où l’INS a publié son chiffre, l’écart médian de cette méthode est de 7 %. Ménages : population ÷ taille moyenne
          des ménages du gouvernorat (INS 2024).
        </div>
      )}
    </div>
  );
}
