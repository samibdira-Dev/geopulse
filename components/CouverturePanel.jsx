'use client';
import { useEffect, useMemo, useState } from 'react';
import { chargerGrille } from '../lib/population';
import { champsCA } from '../lib/simulation';
import { COULEURS, ETATS, TAILLES, analyserCouverture } from '../lib/couverture';
import { C, Empty, Message, SectionTitle, carte, chip, ghostBtn, surtitre } from './ui';
import Icon from './icons';

const compact = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M' : n >= 1e3 ? Math.round(n / 1e3).toLocaleString('fr-FR') + ' k' : Math.round(n).toLocaleString('fr-FR'));
const entier = (n) => Math.round(n).toLocaleString('fr-FR');
const dec = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => Math.round(x * 100) + ' %';

// Dernier calcul pour chaque taille, gardé entre deux ouvertures de l'onglet (même réseau, mêmes ventes).
const CACHE = new Map();

// Couverture du territoire (managers) : hexagones couverts et non couverts, potentiel des zones non couvertes,
// zones prometteuses, zones couvertes sous leur potentiel et bilan par gouvernorat.
export default function CouverturePanel({ points, typesById, champs, ventes, delegations, taille, onTaille, resultat, onResultat, choisi, onChoisir, onVoir }) {
  const [erreur, setErreur] = useState(null);
  const [calcul, setCalcul] = useState(false);
  const [tout, setTout] = useState(false);

  const typesPdv = useMemo(() => Object.values(typesById).filter((t) => ['point_de_vente', 'client'].includes(t.categorie)).map((t) => t.id), [typesById]);
  // Sans ventes importées : champ de CA saisi sur la fiche (jamais un autre nombre comme la surface).
  const cleCA = useMemo(() => {
    const c = champsCA(champs, typesPdv).find((x) => /(^|_)ca(_|$)|chiffre|vente|revenu/i.test(x.cle + ' ' + x.libelle));
    return c ? c.cle : null;
  }, [champs, typesPdv]);

  useEffect(() => {
    const deja = CACHE.get(taille);
    if (deja && deja.points === points && deja.ventes === ventes && deja.delegations === delegations) { onResultat(deja.res); return undefined; }
    let fini = false;
    setCalcul(true);
    setErreur(null);
    chargerGrille().then((grille) => new Promise((ok) => setTimeout(() => ok(grille), 30))).then((grille) => {
      if (fini) return;
      const res = analyserCouverture({ grille, delegations, points, typesById, ventes, cleCA, taille });
      CACHE.set(taille, { points, ventes, delegations, res });
      onResultat(res);
    }).catch((e) => { if (!fini) setErreur(e.message); }).finally(() => { if (!fini) setCalcul(false); });
    return () => { fini = true; };
  }, [taille, points, ventes, delegations, typesById, cleCA, onResultat]);

  const res = resultat && resultat.taille === taille ? resultat : null;
  const h = res && choisi >= 0 ? res.hex[choisi] : null;

  const exporter = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Rang', 'Délégation', 'Gouvernorat', 'Latitude', 'Longitude', 'Habitants non couverts', 'CA potentiel (TND/mois)', 'CA par habitant estimé (TND/mois)', 'Concurrents', 'Distance à votre point le plus proche (km)', 'Zones comparables'],
      ...res.prometteuses.map((z, k) => [k + 1, z.delegation || '', z.gouvernorat || '', Number(z.lat.toFixed(5)), Number(z.lng.toFixed(5)), Math.round(z.pop), Math.round(z.potentiel), z.caParHab != null ? Number(z.caParHab.toFixed(2)) : '', z.concurrents, z.distanceReseau != null ? Number(z.distanceReseau.toFixed(1)) : '', z.semblables.join(', ')]),
    ]), 'Zones prometteuses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Délégation', 'Gouvernorat', 'Points', 'Habitants de la zone', 'CA réel (TND/mois)', 'CA attendu (TND/mois)', 'Manque à gagner (TND/mois)'],
      ...res.sousExploitees.map((z) => [z.delegation || '', z.gouvernorat || '', z.nbPoints, Math.round(z.pop), Math.round(z.ca), Math.round(z.caPrevu), Math.round(z.manque)]),
    ]), 'Sous le potentiel');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Gouvernorat', 'Habitants', 'Habitants couverts', 'Taux de couverture', 'Points', 'CA réalisé (TND/mois)', 'Potentiel non couvert (TND/mois)'],
      ...res.gouvernorats.map((g) => [g.gouvernorat, Math.round(g.pop), Math.round(g.popCouverte), Number(g.couverture.toFixed(3)), g.points, Math.round(g.ca), Math.round(g.potentiel)]),
    ]), 'Gouvernorats');
    XLSX.writeFile(wb, `couverture-${TAILLES.find((t) => t.km === taille).libelle.replace(' ', '')}.xlsx`);
  };

  const aller = (z) => { onChoisir(z.i); onVoir(z.lat, z.lng, taille <= 0.5 ? 13.5 : taille <= 1 ? 12.5 : 11.5); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionTitle icon="hexagon" title="Couverture du territoire">
        Où vous êtes présents, où vous ne l’êtes pas, et ce que les zones non couvertes pourraient rapporter.
      </SectionTitle>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: C.muted, marginRight: '2px' }}>Hexagones de</span>
        {TAILLES.map((t) => <button key={t.km} type="button" onClick={() => onTaille(t.km)} style={chip(taille === t.km)}>{t.libelle}</button>)}
      </div>

      {erreur && <Message>{erreur}</Message>}
      {calcul && !res && <div style={{ ...carte, fontSize: '12.5px', color: C.muted }}>Calcul de la carte de couverture…</div>}
      {res && res.totaux.points === 0 && <Empty icon="hexagon">Ajoutez vos points de vente ou vos clients pour voir votre couverture.</Empty>}

      {res && res.totaux.points > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', opacity: calcul ? 0.5 : 1 }}>
            <Kpi titre="Population couverte" valeur={compact(res.totaux.popCouverte)} detail={pct(res.totaux.popCouverte / res.totaux.pop) + ' des ' + compact(res.totaux.pop) + ' habitants'} couleur={COULEURS.couvert[2]} />
            <Kpi titre="Zones couvertes" valeur={entier(res.zones.length)} detail={entier(res.totaux.points) + ' points du réseau'} couleur={COULEURS.couvert[1]} />
            <Kpi titre="CA réalisé" valeur={res.totaux.ca > 0 ? compact(res.totaux.ca) : '—'} detail="TND par mois" couleur={C.brand} />
            <Kpi titre="Potentiel non couvert" valeur={res.avecCA ? compact(res.totaux.potentiel) : '—'} detail={res.avecCA ? 'TND par mois, si présents' : 'ventes nécessaires'} couleur={COULEURS.pot[3]} />
          </div>

          {res.avecCA ? (
            <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.5 }}>
              Vos zones font en moyenne <b style={{ color: C.text }}>{dec(res.ratioMedian)} TND par habitant et par mois</b>.
              {res.test && <> Testé sur vos {res.test.n} zones (chacune estimée sans elle-même) : <b style={{ color: C.text }}>erreur médiane {pct(res.test.erreurMediane)}</b>.</>}
            </div>
          ) : (
            <div style={{ ...carte, padding: '10px 12px', fontSize: '12px', color: C.body, lineHeight: 1.5, background: C.bg }}>Importez vos ventes (onglet « Import ») ou renseignez le CA de vos points pour estimer le potentiel des zones non couvertes. La carte montre déjà les zones couvertes et non couvertes.</div>
          )}

          <Legende res={res} />

          {h && <ZoneChoisie h={h} res={res} onFermer={() => onChoisir(-1)} />}

          {res.avecCA && res.prometteuses.length > 0 && (
            <div style={{ ...carte, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ ...surtitre, flex: 1 }}>Zones les plus prometteuses</span>
                <button type="button" onClick={exporter} style={{ ...ghostBtn, padding: '4px 9px', fontSize: '11.5px' }}><Icon name="file" size={13} />Excel</button>
              </div>
              {res.prometteuses.slice(0, tout ? 50 : 8).map((z, k) => (
                <button key={z.i} type="button" onClick={() => aller(z)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid ' + (choisi === z.i ? C.brand : C.line), background: choisi === z.i ? C.brandSoft : 'white', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, background: k < 3 ? COULEURS.pot[3] : COULEURS.pot[2], color: 'white', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{k + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.delegation || 'Zone'}{z.gouvernorat && z.gouvernorat !== z.delegation ? ' · ' + z.gouvernorat : ''}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: C.muted }}>
                      {compact(z.pop)} hab. · {z.concurrents} concurrent{z.concurrents > 1 ? 's' : ''}{z.distanceReseau != null ? ' · votre point à ' + dec(z.distanceReseau, 1) + ' km' : ''}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', flex: 'none' }}>
                    <span className="num" style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: COULEURS.pot[3] }}>{compact(z.potentiel)}</span>
                    <span style={{ display: 'block', fontSize: '10px', color: C.faint }}>TND / mois</span>
                  </span>
                </button>
              ))}
              {res.prometteuses.length > 8 && (
                <button type="button" onClick={() => setTout(!tout)} style={{ border: 'none', background: 'none', color: C.brand, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {tout ? 'Voir moins' : `Voir les ${res.prometteuses.length} zones`}
                </button>
              )}
            </div>
          )}

          {res.avecCA && res.sousExploitees.length > 0 && (
            <div style={{ ...carte, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={surtitre}>Zones couvertes sous leur potentiel</span>
              <div style={{ fontSize: '11.5px', color: C.muted, lineHeight: 1.45 }}>Vos zones qui vendent moins que des zones semblables : à creuser (emplacement, gamme, prix, horaires…).</div>
              {res.sousExploitees.slice(0, 5).map((z) => (
                <button key={z.i} type="button" onClick={() => aller(z)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', border: 'none', borderTop: '1px solid ' + C.line, background: choisi === z.i ? C.brandSoft : 'transparent', padding: '7px 2px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '12.5px', color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {z.delegation || 'Zone'} <span style={{ color: C.faint, fontWeight: 500 }}>· {z.nbPoints} pt{z.nbPoints > 1 ? 's' : ''}</span>
                  </span>
                  <span className="num" style={{ fontSize: '11.5px', color: C.muted }}>{compact(z.ca)} → {compact(z.caPrevu)}</span>
                  <span className="num" style={{ fontSize: '12px', fontWeight: 700, color: C.warning, minWidth: '54px', textAlign: 'right' }}>+{compact(z.manque)}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ ...carte, padding: '12px 13px' }}>
            <div style={{ ...surtitre, marginBottom: '6px' }}>Par gouvernorat</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '2px 0' }}>Gouvernorat</th>
                  <th style={{ fontWeight: 600 }}>Couvert</th>
                  <th style={{ fontWeight: 600 }}>CA</th>
                  {res.avecCA && <th style={{ fontWeight: 600 }}>Potentiel</th>}
                </tr>
              </thead>
              <tbody>
                {res.gouvernorats.map((g) => (
                  <tr key={g.gouvernorat} style={{ borderTop: '1px solid ' + C.line }}>
                    <td style={{ padding: '4px 0', color: C.text, fontWeight: 600 }}>{g.gouvernorat}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', width: 34, height: 5, borderRadius: 3, background: '#eef0f4', marginRight: 5, verticalAlign: 'middle', overflow: 'hidden' }}>
                        <span style={{ display: 'block', width: Math.max(2, g.couverture * 100) + '%', height: '100%', background: COULEURS.couvert[2] }} />
                      </span>
                      {pct(g.couverture)}
                    </td>
                    <td className="num" style={{ textAlign: 'right', color: C.body }}>{g.ca > 0 ? compact(g.ca) : '—'}</td>
                    {res.avecCA && <td className="num" style={{ textAlign: 'right', color: COULEURS.pot[3], fontWeight: 600 }}>{compact(g.potentiel)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: '10.5px', color: C.faint, marginTop: '5px' }}>CA et potentiel en TND par mois.</div>
          </div>

          <div style={{ fontSize: '11px', color: C.faint, lineHeight: 1.55 }}>
            Méthode : population Meta 250 m, zone d’un point = hexagones à moins d’environ {res.taille < 1 ? '1 km' : TAILLES.find((t) => t.km === res.taille).libelle}, rattachés au point le plus proche.
            Le potentiel d’une zone non couverte applique le CA par habitant des {7} zones couvertes les plus semblables (densité, pouvoir d’achat de la délégation, concurrents pour 1 000 habitants).
            {res.totaux.popHorsReferences > 0 && <> {compact(res.totaux.popHorsReferences)} habitants vivent dans des lieux moins denses que toutes vos zones : pas d’estimation pour eux (en gris).</>}
            {' '}C’est un potentiel si vous y étiez présents comme dans les zones semblables, pas une prévision.
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ titre, valeur, detail, couleur }) {
  return (
    <div style={{ ...carte, padding: '10px 11px', borderLeft: '3px solid ' + couleur }}>
      <div style={{ ...surtitre, fontSize: '9.5px' }}>{titre}</div>
      <div className="num" style={{ fontSize: '18px', fontWeight: 800, color: C.text, letterSpacing: '-.01em', marginTop: '2px' }}>{valeur}</div>
      <div style={{ fontSize: '10.5px', color: C.muted }}>{detail}</div>
    </div>
  );
}

function Pastille({ couleur }) {
  return <span style={{ width: 13, height: 13, flex: 'none', background: couleur, clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)' }} />;
}

function Legende({ res }) {
  const ligne = (couleurs, texte) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: C.body }}>
      <span style={{ display: 'flex', gap: '2px' }}>{couleurs.map((c) => <Pastille key={c} couleur={c} />)}</span>{texte}
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '2px 2px' }}>
      {res.avecCA ? ligne(COULEURS.couvert, 'Couvert : CA par habitant faible → fort') : ligne([COULEURS.couvertSansCA], 'Couvert : un de vos points à proximité')}
      {res.avecCA ? ligne(COULEURS.pot, 'Non couvert : potentiel faible → très fort') : ligne([COULEURS.pot[1]], 'Non couvert : des habitants, aucun point')}
      {ligne([COULEURS.faible], 'Peu d’habitants ou hors de vos références')}
    </div>
  );
}

function ZoneChoisie({ h, res, onFermer }) {
  const zone = h.zone >= 0 ? res.zones.find((z) => z.i === h.zone) : null;
  const couvert = h.etat === ETATS.point || h.etat === ETATS.desservi;
  const lignes = [
    ['Habitants de l’hexagone', entier(h.pop)],
    ...(couvert && zone ? [
      ['Zone de vos points', `${zone.nbPoints} point${zone.nbPoints > 1 ? 's' : ''} · ${compact(zone.pop)} hab.`],
      ['CA de la zone', zone.ca > 0 ? entier(zone.ca) + ' TND / mois' : 'non renseigné'],
      ...(zone.ratio != null ? [['CA par habitant', dec(zone.ratio) + ' TND / mois']] : []),
      ...(zone.caPrevu ? [['Zones semblables', entier(zone.caPrevu) + ' TND / mois']] : []),
    ] : []),
    ...(!couvert && h.pot > 0 ? [
      ['CA par habitant estimé', dec(h.ratio) + ' TND / mois'],
      ['Potentiel de l’hexagone', entier(h.pot) + ' TND / mois'],
    ] : []),
    ['Concurrents dans l’hexagone', String(h.nbConc)],
  ];
  return (
    <div style={{ ...carte, padding: '11px 13px', borderColor: '#c7d2fe', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ ...surtitre, color: C.brandDark, flex: 1 }}>{couvert ? 'Zone couverte' : 'Zone non couverte'} · {[h.delegation, h.gouvernorat].filter(Boolean).join(', ') || 'hors délégation'}</span>
        <button type="button" onClick={onFermer} title="Fermer" style={{ border: 'none', background: 'none', color: C.faint, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '3px', columnGap: '10px', fontSize: '12px' }}>
        {lignes.map(([a, b]) => [<span key={a} style={{ color: C.muted }}>{a}</span>, <span key={a + 'v'} className="num" style={{ color: C.text, fontWeight: 600, textAlign: 'right' }}>{b}</span>])}
      </div>
      {h.horsReferences && <div style={{ fontSize: '11.5px', color: C.muted }}>Lieu moins dense que toutes vos zones : pas de zone semblable pour l’estimer.</div>}
    </div>
  );
}
