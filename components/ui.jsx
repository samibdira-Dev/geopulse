'use client';
import { STATUTS } from '../lib/points';

export const inputStyle = {
  width: '100%',
  padding: '8px',
  marginTop: '4px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  boxSizing: 'border-box',
  fontSize: '13px',
  background: 'white',
};

export const labelStyle = { fontSize: '12px', fontWeight: 'bold', color: '#334155' };

export const btn = (color = '#10b981', disabled = false) => ({
  background: disabled ? '#cbd5e1' : color,
  color: 'white',
  border: 'none',
  padding: '10px 12px',
  borderRadius: '6px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 'bold',
  fontSize: '13px',
});

export const ghostBtn = {
  background: 'white',
  color: '#334155',
  border: '1px solid #cbd5e1',
  padding: '6px 10px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '12px',
};

export function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.brouillon;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

export function Message({ type = 'err', children }) {
  const ok = type === 'ok';
  return (
    <div style={{
      padding: '10px',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: 'bold',
      background: ok ? '#ecfdf5' : '#fef2f2',
      color: ok ? '#047857' : '#b91c1c',
    }}>
      {children}
    </div>
  );
}
