'use client';
import { STATUTS } from '../lib/points';
import Icon from './icons';

// Palette de l'interface (reprise dans app/globals.css sous forme de variables).
export const C = {
  ink: '#0b1020',
  text: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e7e9f0',
  lineStrong: '#d5d9e3',
  bg: '#f6f7fb',
  brand: '#4f46e5',
  brandDark: '#4338ca',
  brandSoft: '#eef0ff',
  violet: '#7c3aed',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
};
export const GRADIENT = 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)';

export const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  marginTop: '6px',
  borderRadius: '10px',
  border: '1px solid ' + C.lineStrong,
  boxSizing: 'border-box',
  fontSize: '13px',
  background: 'white',
  color: C.text,
  fontFamily: 'inherit',
  outline: 'none',
};

export const labelStyle = { fontSize: '12px', fontWeight: 600, color: C.body, letterSpacing: '.01em' };

export const btn = (color = C.brand, disabled = false) => ({
  background: disabled ? '#e2e5ee' : color === C.brand ? GRADIENT : color,
  color: disabled ? C.faint : 'white',
  border: 'none',
  padding: '11px 14px',
  borderRadius: '10px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 600,
  fontSize: '13px',
  fontFamily: 'inherit',
  boxShadow: disabled ? 'none' : '0 1px 2px rgba(15,23,42,.08), 0 4px 12px ' + (color === C.brand ? 'rgba(79,70,229,.28)' : 'rgba(15,23,42,.12)'),
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
});

export const ghostBtn = {
  background: 'white',
  color: C.body,
  border: '1px solid ' + C.lineStrong,
  padding: '7px 12px',
  borderRadius: '9px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '12px',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

// Pastille cliquable (filtres, rayons…)
export const chip = (actif) => ({
  padding: '6px 12px',
  borderRadius: '999px',
  border: '1px solid ' + (actif ? C.brand : C.lineStrong),
  background: actif ? C.brandSoft : 'white',
  color: actif ? C.brandDark : C.body,
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: actif ? '0 0 0 3px rgba(79,70,229,.10)' : 'none',
});

export const carte = { background: 'white', border: '1px solid ' + C.line, borderRadius: '14px', padding: '14px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

export const surtitre = { fontSize: '10.5px', color: C.muted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.08em' };

// En-tête d'un onglet : icône, titre, sous-titre.
export function SectionTitle({ icon, title, children, aside }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      {icon && (
        <div style={{ width: 38, height: 38, borderRadius: 11, background: C.brandSoft, color: C.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={icon} size={19} />
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <h3 style={{ margin: 0, color: C.text, fontSize: '17px', fontWeight: 700, letterSpacing: '-.01em' }}>{title}</h3>
          {aside}
        </div>
        {children && <p style={{ margin: '3px 0 0', color: C.muted, fontSize: '12.5px', lineHeight: 1.5 }}>{children}</p>}
      </div>
    </div>
  );
}

export function Empty({ icon = 'pin', children }) {
  return (
    <div style={{ border: '1px dashed ' + C.lineStrong, borderRadius: '14px', padding: '26px 16px', textAlign: 'center', color: C.faint, fontSize: '13px', background: '#fbfbfd', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <Icon name={icon} size={22} />
      <div>{children}</div>
    </div>
  );
}

export function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.brouillon;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

export function Message({ type = 'err', children }) {
  const ok = type === 'ok';
  return (
    <div style={{
      padding: '11px 12px',
      borderRadius: '12px',
      fontSize: '12.5px',
      fontWeight: 500,
      lineHeight: 1.5,
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-start',
      background: ok ? '#ecfdf5' : '#fef2f2',
      color: ok ? '#047857' : '#b91c1c',
      border: '1px solid ' + (ok ? '#a7f3d0' : '#fecaca'),
    }}>
      <Icon name={ok ? 'checkCircle' : 'alert'} size={17} style={{ marginTop: '1px' }} />
      <div>{children}</div>
    </div>
  );
}
