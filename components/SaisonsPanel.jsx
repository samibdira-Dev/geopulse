'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { chargerTout } from '../lib/points';
import { PERIODES, analyserSaisons, libelleMois, periodeDominante } from '../lib/saisons';
import { C, Empty, Message, SectionTitle, carte, inputStyle, labelStyle, surtitre } from './ui';

const pct = (x) => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + ' %';
const compact = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M' : n >= 1e3 ? Math.round(n / 1e3).toLocaleString('fr-FR') + ' k' : Math.round(n).toLocaleString('fr-FR'));

// Saisonnalité des ventes (managers) : effet du ramadan, des Aïd, de l'été et de la rentrée, et prévision des
// 12 prochains mois, pour tout le réseau, un gouvernorat ou un point.
export default function SaisonsPanel({ societeId, points, typesById }) {
  const [reseau, setReseau] = useState(null);
  const [lignes, setLignes] = useState(null); // ventes point par point, chargées seulement si on filtre
  const [erreur, setErreur] = useState(null);
  const [portee, setPortee] = useState('reseau');
  const [gouv, setGouv] = useState('');
  const [pointId, setPointId] = useState('');
  const [survol, setSurvol] = useState(null);

  useEffect(() => {
    supabase.rpc('ventes_mensuelles', { p_societe: societeId }).then(({ data, error }) => {
      if (error) setErreur(error.message); else setReseau(data || []);
    });
  }, [societeId]);
  useEffect(() => {
    if (portee === 'reseau' || lignes) return;
    chargerTout(() => supabase.from('ventes').select('point_id, periode, montant').eq('societe_id', societeId).order('id'))
      .then(({ data, error }) => { if (error) setErreur(error.message); else setLignes(data || []); });
  }, [portee, lignes, societeId]);

  const parId = useMemo(() => Object.fromEntries(points.map((p) => [p.id, p])), [points]);
  const avecVentes = useMemo(() => {
    if (!lignes) return [];
    const ids = new Set(lignes.map((l) => l.point_id));
    return points.filter((p) => ids.has(p.id)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [lignes, points]);
  const gouvernorats = useMemo(() => [...new Set(avecVentes.map((p) => p.gouvernorat).filter(Boolean))].sort(), [avecVentes]);

  const mensuel = useMemo(() => {
    if (portee === 'reseau') return reseau;
    if (!lignes) return null;
    const garde = portee === 'gouvernorat' ? (l) => (parId[l.point_id] || {}).gouvernorat === gouv : (l) => l.point_id === pointId;
    const parMois = {};
    lignes.forEach((l) => {
      if (!garde(l) || !(Number(l.montant) > 0)) return;
      const m = parMois[l.periode] || (parMois[l.periode] = { periode: l.periode, montant: 0, points: 0 });
      m.montant += Number(l.montant);
      m.points += 1;
    });
    return Object.values(parMois);
  }, [portee, reseau, lignes, gouv, pointId, parId]);

  const analyse = useMemo(() => (mensuel ? analyserSaisons(mensuel) : null), [mensuel]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionTitle icon="activity" title="Saisonnalité">
        Ce que le ramadan, les Aïd, l’été et la rentrée font à vos ventes, et ce qu’il faut prévoir pour les 12 prochains mois.
      </SectionTitle>

      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={labelStyle}>Analyser</label>
        <select value={portee} onChange={(e) => { setPortee(e.target.value); setSurvol(null); }} style={{ ...inputStyle, marginTop: 0 }}>
          <option value="reseau">Tout le réseau</option>
          <option value="gouvernorat">Un gouvernorat</option>
          <option value="point">Un point de vente</option>
        </select>
        {portee === 'gouvernorat' && (
          <select value={gouv} onChange={(e) => setGouv(e.target.value)} style={{ ...inputStyle, marginTop: 0 }}>
            <option value="">{lignes ? 'Choisir un gouvernorat' : 'Chargement…'}</option>
            {gouvernorats.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        {portee === 'point' && (
          <select value={pointId} onChange={(e) => setPointId(e.target.value)} style={{ ...inputStyle, marginTop: 0 }}>
            <option value="">{lignes ? 'Choisir un point' : 'Chargement…'}</option>
            {avecVentes.map((p) => <option key={p.id} value={p.id}>{p.nom}{p.code_externe ? ` (${p.code_externe})` : ''}</option>)}
          </select>
        )}
      </div>

      {erreur && <Message>{erreur}</Message>}
      {!erreur && mensuel && !analyse && (
        <Empty icon="chart">
          {(portee === 'gouvernorat' && !gouv) || (portee === 'point' && !pointId)
            ? 'Choisissez ce que vous voulez analyser.'
            : 'Il faut au moins 12 mois de ventes pour mesurer la saisonnalité (24 mois pour des chiffres fiables). Importez votre historique dans l’onglet « Import ».'}
        </Empty>
      )}
      {analyse && <Resultats analyse={analyse} survol={survol} onSurvol={setSurvol} />}
    </div>
  );
}

function Resultats({ analyse, survol, onSurvol }) {
  const { serie, effets, prevision, croissance, erreur } = analyse;
  const cles = Object.keys(PERIODES);
  const max = Math.max(...cles.map((k) => Math.abs(effets[k].effet || 0)), 0.05);
  const totalPrev = prevision.reduce((s, m) => s + m.montant, 0);
  const total12 = serie.slice(-12).reduce((s, m) => s + m.montant, 0);
  const pic = prevision.reduce((a, b) => (b.montant > a.montant ? b : a));
  const creux = prevision.reduce((a, b) => (b.montant < a.montant ? b : a));
  const fiable = serie.length >= 24;

  return (
    <>
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={surtitre}>Effet de chaque période sur le CA</div>
        {cles.map((k) => {
          const e = effets[k];
          const p = PERIODES[k];
          const w = e.effet == null ? 0 : (Math.abs(e.effet) / max) * 50;
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '112px 1fr 52px', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12.5px', color: C.body, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.couleur, flex: 'none' }} />{p.court}
              </span>
              <span style={{ position: 'relative', height: '14px' }}>
                <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: C.lineStrong }} />
                {e.effet != null && (
                  <span title={`${p.label} : ${pct(e.effet)} par rapport à un mois normal (mesuré sur ${e.mois} mois)`}
                    style={{ position: 'absolute', top: 2, height: 10, background: p.couleur, opacity: e.fiable ? 1 : 0.45,
                      left: e.effet >= 0 ? '50%' : `calc(${50 - w}% + 0px)`, width: `max(${w}%, 2px)`,
                      borderRadius: e.effet >= 0 ? '0 4px 4px 0' : '4px 0 0 4px' }} />
                )}
              </span>
              <span className="num" style={{ fontSize: '13px', fontWeight: 700, color: C.text, textAlign: 'right' }}>{e.effet == null ? '—' : pct(e.effet)}</span>
            </div>
          );
        })}
        <div style={{ fontSize: '11.5px', color: C.muted, lineHeight: 1.5 }}>
          Écart du CA par rapport à un mois normal, tendance retirée. Croissance de fond : <b style={{ color: C.text }}>{pct(croissance)}</b> par an
          {analyse.parPoint ? ' par point actif' : ''}.{!fiable ? ' Moins de 24 mois de ventes : chiffres indicatifs.' : ''}
        </div>
      </div>

      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={surtitre}>Ventes mensuelles et prévision</div>
        <Graphique serie={serie} prevision={prevision} survol={survol} onSurvol={onSurvol} />
      </div>

      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={surtitre}>12 prochains mois</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Chiffre valeur={compact(totalPrev) + ' TND'} label={`prévus, ${pct(totalPrev / total12 - 1)} vs 12 derniers mois`} />
          <Chiffre valeur={libelleMois(pic.periode)} label={`mois le plus fort${periodeDominante(pic.parts) ? ' (' + PERIODES[periodeDominante(pic.parts)].court.toLowerCase() + ')' : ''}`} />
        </div>
        <div style={{ fontSize: '12px', color: C.body, lineHeight: 1.55 }}>
          Mois le plus faible : <b>{libelleMois(creux.periode)}</b>{periodeDominante(creux.parts) ? ` (${PERIODES[periodeDominante(creux.parts)].court.toLowerCase()})` : ''}.
          Prévoyez stock et personnel en conséquence. Erreur moyenne du modèle sur votre historique : {(Math.round(erreur * 1000) / 10).toLocaleString('fr-FR')} %.
        </div>
      </div>
    </>
  );
}

function Graphique({ serie, prevision, survol, onSurvol }) {
  const W = 400;
  const H = 170;
  const bas = 18;
  const gauche = 34;
  const mois = [...serie.map((m) => ({ ...m, prev: false })), ...prevision.map((m) => ({ ...m, prev: true }))];
  const max = Math.max(...mois.map((m) => m.montant)) * 1.08;
  const pas = (W - gauche) / mois.length;
  const y = (v) => (H - bas) * (1 - v / max);
  const graduations = [0, 1, 2, 3].map((k) => (max / 1.08) * (k / 3));
  const actif = survol != null ? mois[survol] : mois[serie.length - 1];
  const dom = periodeDominante(actif.parts);
  const tendance = serie.map((m, i) => `${gauche + pas * i + pas / 2},${y(m.tendance)}`).join(' ');

  return (
    <div>
      <div style={{ fontSize: '12.5px', color: C.body, minHeight: '36px', lineHeight: 1.45 }}>
        <b style={{ color: C.text }}>{libelleMois(actif.periode)}</b> · <span className="num">{Math.round(actif.montant).toLocaleString('fr-FR')} TND</span>
        {actif.prev ? ' (prévision)' : ` · ${pct(actif.ecart)} vs tendance`}
        <br />
        <span style={{ color: C.muted }}>{dom ? PERIODES[dom].label : 'Mois sans période particulière'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} onMouseLeave={() => onSurvol(null)} role="img"
        aria-label="CA mensuel, tendance et prévision des 12 prochains mois">
        {graduations.map((g, k) => (
          <g key={k}>
            <line x1={gauche} x2={W} y1={y(g)} y2={y(g)} stroke={C.line} strokeWidth="1" />
            <text x={gauche - 4} y={y(g) + 3} textAnchor="end" fontSize="9" fill={C.faint}>{k ? compact(g) : '0'}</text>
          </g>
        ))}
        {mois.map((m, i) => {
          const x = gauche + pas * i;
          const d = periodeDominante(m.parts);
          const h = H - bas - y(m.montant);
          return (
            <g key={m.periode} onMouseEnter={() => onSurvol(i)} onClick={() => onSurvol(i)} style={{ cursor: 'pointer' }}>
              <rect x={x} y={0} width={pas} height={H} fill="transparent" />
              <path d={`M${x + 1},${H - bas} v${-(h - 2)} q0,-2 2,-2 h${Math.max(0, pas - 6)} q2,0 2,2 v${h - 2} z`}
                fill={m.prev ? '#c7d2fe' : C.brand} opacity={survol == null || survol === i ? 1 : 0.55} />
              {d && <rect x={x + 1} y={H - bas + 3} width={pas - 2} height={4} rx={1} fill={PERIODES[d].couleur} />}
              {Number(m.periode.slice(5, 7)) === 1 && (
                <text x={x + 1} y={H - 1} fontSize="9" fill={C.muted}>{m.periode.slice(0, 4)}</text>
              )}
            </g>
          );
        })}
        <polyline points={tendance} fill="none" stroke={C.text} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.55" pointerEvents="none" />
        <line x1={gauche + pas * serie.length} x2={gauche + pas * serie.length} y1={0} y2={H - bas} stroke={C.faint} strokeWidth="1" strokeDasharray="2 3" />
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: '11px', color: C.muted, marginTop: '6px' }}>
        <Legende couleur={C.brand}>Ventes</Legende>
        <Legende couleur="#c7d2fe">Prévision</Legende>
        <Legende trait>Tendance</Legende>
        {Object.entries(PERIODES).map(([k, p]) => <Legende key={k} couleur={p.couleur} fin>{p.court}</Legende>)}
      </div>
    </div>
  );
}

function Legende({ couleur, trait, fin, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      {trait
        ? <span style={{ width: 14, borderTop: '1.5px dashed ' + C.text, opacity: 0.55 }} />
        : <span style={{ width: fin ? 12 : 9, height: fin ? 4 : 9, borderRadius: 2, background: couleur }} />}
      {children}
    </span>
  );
}

function Chiffre({ valeur, label }) {
  return (
    <div style={{ lineHeight: 1.25 }}>
      <div className="num" style={{ fontSize: '17px', fontWeight: 700, color: C.text }}>{valeur}</div>
      <div style={{ fontSize: '11px', color: C.muted }}>{label}</div>
    </div>
  );
}
