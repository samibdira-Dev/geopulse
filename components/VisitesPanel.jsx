'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isManagerRole } from '../lib/points';
import { RESULTATS, SEUILS_JOURS, aSuivre, aujourdhui, bilanVisites, depuisLe, erreurVisites, pointLePlusProche, pointsAVisiter, visitable } from '../lib/visites';
import { C, Empty, Message, SectionTitle, btn, carte, chip, ghostBtn, inputStyle, labelStyle, surtitre } from './ui';
import Icon from './icons';

const HISTORIQUE = 5000;
const LISTE = 40;
const nb = (n) => Math.round(n).toLocaleString('fr-FR');
const dateFr = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

// Journal des visites des commerciaux : noter un passage (résultat, commande, remarque), voir les points
// à visiter (sans visite depuis X jours) et l'historique de l'équipe.
export default function VisitesPanel({ societeId, points, typesById, auteurs, userId, role, resume, pointChoisi, onPointChoisi, onChanged, onFocus, onCarte }) {
  const manager = isManagerRole(role);
  const [historique, setHistorique] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [pointId, setPointId] = useState(null);
  const [date, setDate] = useState(aujourdhui());
  const [resultat, setResultat] = useState('commande');
  const [montant, setMontant] = useState('');
  const [note, setNote] = useState('');
  const [seuil, setSeuil] = useState(30);
  const [surCarte, setSurCarte] = useState(false);
  const [portee, setPortee] = useState('tous');
  const [limite, setLimite] = useState(LISTE);

  const charger = useCallback(async () => {
    // Visites des 90 derniers jours : le bilan porte sur 30 jours, l'historique montre les plus récentes.
    const depuis = aujourdhui(new Date(Date.now() - 90 * 24 * 3600 * 1000));
    const { data, error } = await supabase.from('visites').select('*').eq('societe_id', societeId).gte('date_visite', depuis)
      .order('date_visite', { ascending: false }).order('id', { ascending: false }).limit(HISTORIQUE);
    if (error) { setErreur(erreurVisites(error)); return; }
    setErreur(null);
    setHistorique(data || []);
  }, [societeId]);
  useEffect(() => { charger(); }, [charger]);

  // Point choisi depuis la carte (« Noter une visite » dans la fiche du point).
  useEffect(() => {
    if (pointChoisi) { setPointId(pointChoisi.id); setRecherche(''); setMessage(null); onPointChoisi(null); }
  }, [pointChoisi, onPointChoisi]);

  const parId = useMemo(() => Object.fromEntries(points.map((p) => [p.id, p])), [points]);
  const point = pointId ? parId[pointId] : null;
  const suggestions = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return [];
    return points.filter((p) => visitable(p, typesById)
      && `${p.nom} ${p.code_externe || ''} ${p.delegation || ''} ${p.gouvernorat || ''}`.toLowerCase().includes(q)).slice(0, 6);
  }, [recherche, points, typesById]);

  const aVisiter = useMemo(() => pointsAVisiter(points, typesById, resume, seuil), [points, typesById, resume, seuil]);
  const jamais = aVisiter.filter((x) => x.jours == null).length;
  const visitables = useMemo(() => points.filter((p) => aSuivre(p, typesById)).length, [points, typesById]);
  const visibles = portee === 'miens' ? historique.filter((v) => v.auteur === userId) : historique;
  const bilan = useMemo(() => bilanVisites(visibles, 30), [visibles]);

  // La carte montre seulement les points à visiter quand l'option est cochée.
  useEffect(() => { onCarte(surCarte ? aVisiter.map((x) => x.point.id) : null); }, [surCarte, aVisiter, onCarte]);
  useEffect(() => () => onCarte(null), [onCarte]);

  const localiser = () => {
    if (!navigator.geolocation) { setMessage({ type: 'err', text: 'La géolocalisation n’est pas disponible sur cet appareil.' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const proche = pointLePlusProche(points, typesById, pos.coords.latitude, pos.coords.longitude);
        if (proche) { setPointId(proche.point.id); setRecherche(''); setMessage(null); }
        else setMessage({ type: 'err', text: 'Aucun point à moins de 300 m de votre position. Cherchez-le par son nom.' });
      },
      () => setMessage({ type: 'err', text: 'Position refusée ou indisponible. Cherchez le point par son nom.' }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const enregistrer = async () => {
    if (!point) return;
    const m = resultat === 'commande' && montant !== '' ? Number(String(montant).replace(/\s/g, '').replace(',', '.')) : null;
    if (m != null && !(m >= 0)) { setMessage({ type: 'err', text: 'Montant de la commande illisible.' }); return; }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from('visites').insert([{
      societe_id: societeId, point_id: point.id, date_visite: date, resultat, montant_commande: m, note: note.trim() || null,
    }]);
    setBusy(false);
    if (error) { setMessage({ type: 'err', text: erreurVisites(error) }); return; }
    setMessage({ type: 'ok', text: `Visite chez ${point.nom} enregistrée.` });
    setPointId(null); setMontant(''); setNote(''); setResultat('commande'); setDate(aujourdhui());
    charger();
    onChanged();
  };

  const supprimer = async (v) => {
    if (!window.confirm('Supprimer cette visite ?')) return;
    const { data, error } = await supabase.from('visites').delete().eq('id', v.id).select('id');
    if (error || !data || !data.length) setMessage({ type: 'err', text: error ? erreurVisites(error) : 'Suppression refusée.' });
    charger();
    onChanged();
  };

  const exporter = async () => {
    const XLSX = await import('xlsx');
    const lignes = [['Point', 'Code ERP', 'Type', 'Délégation', 'Gouvernorat', 'Dernière visite', 'Jours sans visite', 'Dernier résultat'],
      ...aVisiter.map(({ point: p, derniere, jours, resume: r }) => [p.nom, p.code_externe || '', (typesById[p.type_id] || {}).nom || '',
        p.delegation || '', p.gouvernorat || '', derniere || 'jamais', jours == null ? '' : jours, r ? (RESULTATS[r.dernier_resultat] || {}).label || '' : ''])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lignes), 'A visiter');
    XLSX.writeFile(wb, `points-a-visiter-${seuil}-jours.xlsx`);
  };

  const nomAuteur = (v) => (v.auteur === userId ? 'moi' : (v.auteur && auteurs[v.auteur]) || v.auteur_email || 'un membre');

  if (erreur) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionTitle icon="calendar" title="Visites">Le journal des visites de vos commerciaux.</SectionTitle>
        <Message>{erreur}</Message>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionTitle icon="calendar" title="Visites">
        Notez chaque passage chez un client : résultat, commande, remarque. Repérez les points que personne n’a visités depuis longtemps.
      </SectionTitle>

      {/* Nouvelle visite */}
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={surtitre}>Nouvelle visite</div>
        {point ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid ' + C.brand, background: C.brandSoft, borderRadius: '10px', padding: '9px 11px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: (typesById[point.type_id] || {}).couleur || C.faint, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '13.5px', color: C.text }}>{point.nom}</div>
              <div style={{ fontSize: '11.5px', color: C.muted }}>
                {[point.code_externe, point.delegation, point.gouvernorat].filter(Boolean).join(' · ')}
                {' · '}dernière visite {depuisLe(resume[point.id] && resume[point.id].derniere_visite)}
              </div>
            </div>
            <button type="button" onClick={() => setPointId(null)} style={{ ...ghostBtn, padding: '4px 9px', fontSize: '11.5px' }}>Changer</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, code client ou quartier du point…"
                style={{ ...inputStyle, marginTop: 0 }} />
              <button type="button" onClick={localiser} style={ghostBtn} title="Choisir le point le plus proche de moi"><Icon name="crosshair" size={14} />Ici</button>
            </div>
            {suggestions.length > 0 && (
              <div style={{ border: '1px solid ' + C.line, borderRadius: '10px', marginTop: '6px', overflow: 'hidden' }}>
                {suggestions.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setPointId(p.id); setRecherche(''); }}
                    style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'center', border: 'none', borderBottom: '1px solid ' + C.line, background: 'white', padding: '8px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: (typesById[p.type_id] || {}).couleur || C.faint, flex: 'none' }} />
                    <span style={{ flex: 1, fontSize: '12.5px', color: C.text, fontWeight: 600 }}>{p.nom}</span>
                    <span style={{ fontSize: '11px', color: C.muted }}>{p.code_externe || p.delegation || ''}</span>
                  </button>
                ))}
              </div>
            )}
            {recherche.trim() && suggestions.length === 0 && <div style={{ fontSize: '12px', color: C.muted, marginTop: '6px' }}>Aucun point ne correspond.</div>}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {Object.entries(RESULTATS).map(([k, r]) => (
            <button key={k} type="button" onClick={() => setResultat(k)} aria-pressed={resultat === k}
              style={{ ...chip(resultat === k), ...(resultat === k ? { borderColor: r.couleur, background: r.fond, color: r.couleur, boxShadow: 'none' } : {}) }}>
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: resultat === 'commande' ? '1fr 1fr' : '1fr', gap: '8px' }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value || aujourdhui())} style={inputStyle} />
          </div>
          {resultat === 'commande' && (
            <div>
              <label style={labelStyle}>Montant commandé (TND)</label>
              <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="ex. 1 250" style={inputStyle} />
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Remarque</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Rupture de stock, demande de promo, gérant absent…"
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        {message && <Message type={message.type}>{message.text}</Message>}
        <button type="button" onClick={enregistrer} disabled={busy || !point} style={btn(undefined, busy || !point)}>
          {busy ? 'Enregistrement…' : point ? 'Enregistrer la visite' : 'Choisissez d’abord un point'}
        </button>
      </div>

      {/* Bilan 30 jours */}
      <div style={{ ...carte, padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={surtitre}>30 derniers jours</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button type="button" onClick={() => setPortee('tous')} style={{ ...chip(portee === 'tous'), padding: '3px 9px', fontSize: '11px' }}>Équipe</button>
            <button type="button" onClick={() => setPortee('miens')} style={{ ...chip(portee === 'miens'), padding: '3px 9px', fontSize: '11px' }}>Mes visites</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          <Chiffre valeur={nb(bilan.visites)} label="visites" />
          <Chiffre valeur={bilan.taux == null ? '—' : Math.round(bilan.taux * 100) + ' %'} label="avec commande" />
          <Chiffre valeur={nb(bilan.montant)} label="TND commandés" accent />
          <Chiffre valeur={`${nb(bilan.points)}`} label="points visités" />
        </div>
      </div>

      {/* Points à visiter */}
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={surtitre}>À visiter</div>
          {manager && aVisiter.length > 0 && <button type="button" onClick={exporter} style={{ ...ghostBtn, padding: '4px 9px', fontSize: '11.5px' }}><Icon name="file" size={13} />Excel</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: C.muted }}>Sans visite depuis</span>
          {SEUILS_JOURS.map((s) => <button key={s} type="button" onClick={() => setSeuil(s)} style={chip(seuil === s)}>{s} jours</button>)}
        </div>
        <div style={{ fontSize: '12.5px', color: C.body }}>
          <b className="num" style={{ color: aVisiter.length ? C.danger : C.success }}>{nb(aVisiter.length)}</b> point{aVisiter.length > 1 ? 's' : ''} sur {nb(visitables)}
          {jamais ? <span style={{ color: C.muted }}> (dont {nb(jamais)} jamais visité{jamais > 1 ? 's' : ''})</span> : ''}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: C.body, cursor: 'pointer' }}>
          <input type="checkbox" checked={surCarte} onChange={(e) => setSurCarte(e.target.checked)} />
          Afficher seulement ces points sur la carte
        </label>
        {aVisiter.length === 0 && <Empty icon="checkCircle">Tous les points ont été visités ces {seuil} derniers jours.</Empty>}
        {aVisiter.slice(0, limite).map(({ point: p, jours }) => (
          <div key={p.id} className="gp-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid ' + C.line, paddingTop: '8px' }}>
            <div onClick={() => onFocus(p)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: (typesById[p.type_id] || {}).couleur || C.faint, marginRight: 6 }} />
                {p.nom}
              </div>
              <div style={{ fontSize: '11.5px', color: C.muted }}>{[p.code_externe, p.delegation].filter(Boolean).join(' · ') || 'zone non renseignée'}</div>
            </div>
            <span className="num" style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
              background: jours == null ? '#fee2e2' : jours >= 2 * seuil ? '#ffedd5' : '#fef3c7', color: jours == null ? '#b91c1c' : jours >= 2 * seuil ? '#c2410c' : '#b45309' }}>
              {jours == null ? 'jamais' : `${jours} j`}
            </span>
            <button type="button" onClick={() => { setPointId(p.id); setMessage(null); }} style={{ ...ghostBtn, padding: '4px 9px', fontSize: '11.5px' }}>Visiter</button>
          </div>
        ))}
        {aVisiter.length > limite && (
          <button type="button" onClick={() => setLimite(limite + LISTE)} style={{ ...ghostBtn, justifyContent: 'center' }}>
            Afficher {Math.min(LISTE, aVisiter.length - limite)} de plus ({nb(aVisiter.length - limite)} restants)
          </button>
        )}
      </div>

      {/* Historique */}
      <div style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={surtitre}>Dernières visites{portee === 'miens' ? ' (les miennes)' : ''}</div>
        {visibles.length === 0 && <Empty icon="calendar">Aucune visite enregistrée pour l’instant.</Empty>}
        {visibles.slice(0, 60).map((v) => {
          const p = parId[v.point_id];
          const r = RESULTATS[v.resultat] || RESULTATS.sans_commande;
          return (
            <div key={v.id} style={{ borderTop: '1px solid ' + C.line, paddingTop: '8px', fontSize: '12.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span onClick={() => p && onFocus(p)} style={{ flex: 1, minWidth: 0, fontWeight: 600, color: C.text, cursor: p ? 'pointer' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p ? p.nom : 'Point supprimé'}
                </span>
                <span style={{ background: r.fond, color: r.couleur, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {r.label}{v.resultat === 'commande' && v.montant_commande != null ? ` · ${nb(Number(v.montant_commande))} TND` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: C.muted, fontSize: '11.5px', marginTop: '2px' }}>
                <span>{dateFr(v.date_visite)} · par {nomAuteur(v)}</span>
                {(v.auteur === userId || manager) && (
                  <button type="button" onClick={() => supprimer(v)} style={{ border: 'none', background: 'none', color: C.faint, cursor: 'pointer', padding: 0, fontSize: '11.5px', fontFamily: 'inherit' }}>Supprimer</button>
                )}
              </div>
              {v.note && <div style={{ color: C.body, marginTop: '3px', fontStyle: 'italic' }}>« {v.note} »</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chiffre({ valeur, label, accent }) {
  return (
    <div style={{ lineHeight: 1.2, minWidth: 0 }}>
      <div className="num" style={{ fontSize: '17px', fontWeight: 700, color: accent ? C.brand : C.text, letterSpacing: '-.01em' }}>{valeur}</div>
      <div style={{ fontSize: '10.5px', color: C.muted }}>{label}</div>
    </div>
  );
}
