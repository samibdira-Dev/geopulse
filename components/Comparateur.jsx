'use client';
import { useState } from 'react';
import { LIGNES, MAX_SITES, meilleurs, ouvrirRapport, recommandation } from '../lib/comparateur';
import { C, btn, carte, ghostBtn, surtitre } from './ui';
import Icon from './icons';

const lettre = (i) => String.fromCharCode(65 + i);

// Comparateur des sites étudiés dans le simulateur (4 au plus) : tableau, recommandation et rapport PDF.
export default function Comparateur({ sites, societe, auteur, onRetirer, onRenommer, onVoir, onVider }) {
  const [ouvert, setOuvert] = useState(true);
  const [erreur, setErreur] = useState(null);
  if (!sites.length) return null;
  const best = meilleurs(sites);
  const reco = recommandation(sites);

  const rapport = () => {
    setErreur(null);
    if (!ouvrirRapport({ sites, societe, auteur })) setErreur('Le navigateur a bloqué l’ouverture du rapport : autorisez les fenêtres pour ce site.');
  };

  return (
    <div style={{ ...carte, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: '10px', borderColor: '#c7d2fe' }}>
      <button type="button" onClick={() => setOuvert(!ouvert)} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span style={{ ...surtitre, color: C.brandDark, flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="split" size={13} />Comparateur de sites ({sites.length}/{MAX_SITES})</span>
        <Icon name="chevron" size={14} style={{ color: C.muted, transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {ouvert && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {sites.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: reco && reco.site.id === s.id ? C.success : C.brand, color: 'white', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{lettre(i)}</span>
                <input value={s.nom} onChange={(e) => onRenommer(s.id, e.target.value)} aria-label={`Nom du site ${lettre(i)}`}
                  style={{ flex: 1, minWidth: 0, border: '1px solid transparent', borderRadius: '7px', padding: '3px 6px', fontSize: '12.5px', fontWeight: 600, color: C.text, fontFamily: 'inherit', background: C.bg }} />
                <button type="button" onClick={() => onVoir(s)} title="Voir sur la carte" style={{ border: 'none', background: 'none', color: C.muted, cursor: 'pointer', padding: '2px' }}><Icon name="pin" size={14} /></button>
                <button type="button" onClick={() => onRetirer(s.id)} title="Retirer du comparateur" style={{ border: 'none', background: 'none', color: C.faint, cursor: 'pointer', padding: '2px' }}><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>

          {sites.length >= 2 && (
            <div style={{ overflowX: 'auto', margin: '0 -2px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr>
                    <th />
                    {sites.map((s, i) => <th key={s.id} style={{ textAlign: 'right', padding: '3px 4px', color: C.brandDark, fontWeight: 800 }}>{lettre(i)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {LIGNES.filter((l) => !l.rapport).map((l, k) => (l.groupe ? (
                    <tr key={'g' + k}><td colSpan={sites.length + 1} style={{ ...surtitre, fontSize: '9.5px', padding: '7px 0 2px' }}>{l.groupe}</td></tr>
                  ) : (
                    <tr key={l.cle} style={{ borderTop: '1px solid ' + C.line }}>
                      <td style={{ color: C.muted, padding: '4px 4px 4px 0', whiteSpace: 'nowrap' }}>{l.libelle}</td>
                      {sites.map((s) => (
                        <td key={s.id} className="num" style={{ textAlign: 'right', padding: '4px', whiteSpace: 'nowrap', fontWeight: best[l.cle] === s.id ? 700 : 500, color: best[l.cle] === s.id ? C.success : C.text }}>
                          {l.court ? l.court(s) : l.texte(s).replace(' TND', '')}
                        </td>
                      ))}
                    </tr>
                  )))}
                </tbody>
              </table>
              <div style={{ fontSize: '10.5px', color: C.faint, marginTop: '4px' }}>Montants en TND par mois (k = milliers). En vert : meilleure valeur de la ligne.</div>
            </div>
          )}

          {reco && (
            <div style={{ background: reco.aucun ? '#fffbeb' : '#ecfdf5', border: '1px solid ' + (reco.aucun ? '#fcd34d' : '#a7f3d0'), borderRadius: '10px', padding: '9px 11px', fontSize: '12px', color: reco.aucun ? '#92400e' : '#065f46', lineHeight: 1.5 }}>
              <b>{reco.aucun ? 'Aucun site rentable. Le moins défavorable' : 'Recommandé'} : {lettre(sites.indexOf(reco.site))}. {reco.site.nom}</b><br />{reco.phrase}
              {reco.reserves.length > 0 && <div style={{ color: '#92400e', marginTop: '3px' }}>À surveiller : {reco.reserves.join(' ; ')}.</div>}
            </div>
          )}
          {sites.length < 2 && <div style={{ fontSize: '12px', color: C.muted }}>Étudiez un deuxième emplacement et ajoutez-le pour comparer.</div>}
          {erreur && <div style={{ fontSize: '12px', color: C.danger }}>{erreur}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={rapport} style={{ ...btn(), flex: 1, padding: '9px 12px' }}><Icon name="file" size={15} />Rapport PDF</button>
            <button type="button" onClick={onVider} style={{ ...ghostBtn, color: C.muted }}>Vider</button>
          </div>
        </>
      )}
    </div>
  );
}
