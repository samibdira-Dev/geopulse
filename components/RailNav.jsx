'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './icons';

// Rail des onglets (ordinateur) : défile quand l'écran est bas, avec une flèche en haut et en bas
// tant qu'il reste des onglets cachés, pour qu'aucun onglet ne passe inaperçu.
export default function RailNav({ onglets, tab, onChoisir }) {
  const nav = useRef(null);
  const [cache, setCache] = useState({ haut: false, bas: false });

  const mesurer = useCallback(() => {
    const el = nav.current;
    if (!el) return;
    const haut = el.scrollTop > 2;
    const bas = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setCache((c) => (c.haut === haut && c.bas === bas ? c : { haut, bas }));
  }, []);

  useEffect(() => {
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, [mesurer, onglets.length]);

  // L'onglet actif reste visible.
  useEffect(() => {
    const actif = nav.current?.querySelector('.gp-rail-item.actif');
    if (actif) actif.scrollIntoView({ block: 'nearest' });
  }, [tab]);

  const defiler = (sens) => nav.current?.scrollBy({ top: sens * 160, behavior: 'smooth' });

  return (
    <div className="gp-rail-zone" style={{ position: 'relative', width: '100%', flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
      <nav ref={nav} onScroll={mesurer} className="gp-rail-nav" style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', flex: '1 1 auto', minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {onglets.map(([k, icone, label, badge]) => (
          <button key={k} type="button" onClick={() => onChoisir(k)} title={label.replace('­', '')}
            className={'gp-rail-item' + (tab === k ? ' actif' : '')}
            style={{ position: 'relative', border: 'none', background: undefined, borderRadius: '12px', padding: '7px 2px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '62px', flex: 'none' }}>
            <Icon name={icone} size={20} />
            <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '.01em', lineHeight: 1.1, textAlign: 'center' }}>{label}</span>
            {badge ? (
              <span style={{ position: 'absolute', top: '4px', right: '9px', minWidth: '17px', height: '17px', padding: '0 4px', boxSizing: 'border-box', borderRadius: '9px', background: '#f59e0b', color: '#0b1020', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {cache.haut && (
        <button type="button" className="gp-rail-fleche haut" onClick={() => defiler(-1)} title="Autres onglets au-dessus" aria-label="Afficher les onglets au-dessus">
          <Icon name="chevron" size={16} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      )}
      {cache.bas && (
        <button type="button" className="gp-rail-fleche bas" onClick={() => defiler(1)} title="Autres onglets en dessous" aria-label="Afficher les onglets en dessous">
          <Icon name="chevron" size={16} style={{ transform: 'rotate(90deg)' }} />
        </button>
      )}
    </div>
  );
}
