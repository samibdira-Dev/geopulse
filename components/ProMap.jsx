'use client';
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, GeoJSON, Circle, ImageOverlay, ZoomControl, Pane, Polygon, useMapEvents, useMap } from 'react-leaflet';
import { depuisLe } from '../lib/visites';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { normalizeGouvernorat, sameGouvernorat } from '../lib/gouvernorats';

import { STATUTS, isManagerRole, valeurChamp } from '../lib/points';
import { caMensuelMoyen, evolution } from '../lib/ventes';
import { couleurDensite, couleurPauvrete } from '../lib/recensement';
import { COULEURS_GENERATEURS, indiceNational, niveauPassage, scorePassage } from '../lib/generateurs';
import { ETATS, couleurHex, hexEn, sommetsHex } from '../lib/couverture';

// Pastille colorée selon le type du point ; l'anneau indique le statut de validation.
// Dessinée sur le canvas (CircleMarker) : la carte reste fluide même avec des milliers de points.
const RING_BY_STATUT = {
  valide: { color: '#ffffff', dashArray: null },
  a_valider: { color: '#f59e0b', dashArray: '3 3' },
  brouillon: { color: '#64748b', dashArray: '3 3' },
  rejete: { color: '#dc2626', dashArray: null },
};
// Points plus petits sur téléphone (compact), sinon le réseau devient une seule tache à l'échelle du pays.
function styleDuPoint(color, statut, compact) {
  const ring = RING_BY_STATUT[statut] || RING_BY_STATUT.valide;
  return { radius: compact ? 5 : 7.5, color: ring.color, weight: compact ? 1.8 : 2.5, dashArray: ring.dashArray, fillColor: color, fillOpacity: statut === 'brouillon' ? 0.6 : 1, opacity: 1 };
}
const OMBRE = { radius: 10, stroke: false, fillColor: '#0f172a', fillOpacity: 0.16 };
const OMBRE_COMPACTE = { ...OMBRE, radius: 6.5 };

// Emplacement étudié : repère violet avec une onde qui pulse.
const simIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:34px;height:44px">
    <div class="gp-pulse" style="position:absolute;left:5px;bottom:-12px;width:24px;height:24px;border-radius:50%;background:rgba(124,58,237,.35)"></div>
    <svg width="34" height="44" viewBox="0 0 34 44" style="position:absolute;inset:0;filter:drop-shadow(0 4px 8px rgba(76,29,149,.45))">
      <defs><linearGradient id="gpSim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
      <path d="M17 43s14-13.2 14-25.5A14 14 0 0 0 3 17.5C3 29.8 17 43 17 43Z" fill="url(#gpSim)" stroke="white" stroke-width="2"/>
      <circle cx="17" cy="17.5" r="5.5" fill="white"/>
    </svg>
  </div>`,
  iconSize: [34, 44],
  iconAnchor: [17, 43],
  popupAnchor: [0, -38],
});

// Fond de carte unique : le plan OpenStreetMap (une seule couche de tuiles, plus léger sur téléphone).
const FOND = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
};

// Emprise de la Tunisie (sud-ouest, nord-est) : la vue ne peut pas en sortir.
const TUNISIA_BOUNDS = [[30.0, 7.3], [37.7, 11.9]];

// Cadre la carte sur la Tunisie et empêche de dézoomer au-delà du pays.
function TunisiaViewport() {
  const map = useMap();
  useEffect(() => {
    const applyMinZoom = () => {
      map.setMinZoom(map.getBoundsZoom(TUNISIA_BOUNDS, false));
    };
    applyMinZoom();
    map.fitBounds(TUNISIA_BOUNDS);
    map.on('resize', applyMinZoom);
    return () => {
      map.off('resize', applyMinZoom);
    };
  }, [map]);
  return null;
}

// `view` est un objet recréé à chaque demande de déplacement : { reset } ou { center, zoom }.
function MapUpdater({ view }) {
  const map = useMap();
  useEffect(() => {
    if (!view) return;
    if (view.reset) {
      map.flyToBounds(TUNISIA_BOUNDS, { duration: 1.2 });
    } else if (view.center) {
      map.flyTo(view.center, view.zoom || 11, { duration: 1.2 });
    }
  }, [view, map]);
  return null;
}

// Couche des générateurs de trafic : seulement à partir du zoom 12 et dans la partie visible de la carte.
const ZOOM_GENERATEURS = 12;
function CoucheGenerateurs({ generateurs, actives, compact }) {
  const map = useMap();
  const [vue, setVue] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds().pad(0.2) }));
  useMapEvents({ moveend: () => setVue({ zoom: map.getZoom(), bounds: map.getBounds().pad(0.2) }) });
  const visibles = useMemo(() => {
    if (vue.zoom < ZOOM_GENERATEURS) return [];
    const classes = new Set(actives.map((cle) => generateurs.classes.findIndex((c) => c.cle === cle)));
    return generateurs.points.filter((p) => classes.has(p[0]) && vue.bounds.contains([p[1], p[2]]));
  }, [generateurs, actives, vue]);
  const r = (compact ? 3.5 : 4.5) + (vue.zoom >= 15 ? 1.5 : 0);
  return (
    <>
      {vue.zoom < ZOOM_GENERATEURS && (
        <div className="gp-glass" style={{ position: 'absolute', left: '50%', bottom: compact ? '96px' : '24px', transform: 'translateX(-50%)', zIndex: 1000, padding: '7px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, color: '#334155', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          Zoomez pour voir les générateurs de trafic
        </div>
      )}
      {visibles.map((p, i) => {
        const c = generateurs.classes[p[0]];
        return (
          <CircleMarker key={i + '-' + p[1] + '-' + p[2]} center={[p[1], p[2]]} bubblingMouseEvents={false}
            pathOptions={{ radius: r, color: '#ffffff', weight: 1.2, fillColor: COULEURS_GENERATEURS[c.cle], fillOpacity: 0.95 }}>
            <Popup>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: COULEURS_GENERATEURS[c.cle], fontWeight: 700 }}>{c.libelle}</div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{p[3] || 'Sans nom'}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>Générateur de trafic · Overture Maps</div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

// Carte de couverture : hexagones dessinés sur des tuiles de canvas (fluide même avec 150 000 hexagones),
// avec une info-bulle au survol. Le clic passe par onSelectLocation (voir la page).
const fmt = (n, d = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
function infoHex(res, h) {
  const lieu = [h.delegation, h.gouvernorat].filter(Boolean).join(' · ') || 'Hors délégation';
  const couvert = h.etat === ETATS.point || h.etat === ETATS.desservi;
  const etat = h.etat === ETATS.point ? 'Couvert · vos points' : couvert ? 'Couvert · zone de vos points' : 'Non couvert';
  let detail = '';
  if (couvert && h.ratio != null) detail = `<br>CA de la zone : ${fmt(h.ratio, 2)} TND / hab. / mois`;
  else if (!couvert && h.pot > 0) detail = `<br>Potentiel : <b>${fmt(Math.round(h.pot))} TND / mois</b> (${fmt(h.ratio, 2)} TND / hab.)`;
  else if (h.horsReferences) detail = '<br>Moins dense que toutes vos zones : pas d’estimation';
  return `<b>${lieu}</b><br><span style="color:${couvert ? '#15803d' : '#c2410c'};font-weight:600">${etat}</span>`
    + `<br>${fmt(h.pop)} habitants${h.nbConc ? ` · ${h.nbConc} concurrent${h.nbConc > 1 ? 's' : ''}` : ''}${detail}`;
}
function CoucheCouverture({ res }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('couverture')) {
      const p = map.createPane('couverture');
      p.style.zIndex = 350;
      p.style.pointerEvents = 'none';
    }
    const S = sommetsHex(res.taille);
    const couleurs = res.hex.map((h) => couleurHex(res, h));
    const cos = res.hex.map((h) => Math.cos((h.lat * Math.PI) / 180));
    const projections = new Map();
    const projeter = (z) => {
      if (!projections.has(z)) {
        const a = new Float64Array(res.hex.length * 2);
        res.hex.forEach((h, i) => { const p = map.project([h.lat, h.lng], z); a[2 * i] = p.x; a[2 * i + 1] = p.y; });
        projections.set(z, a);
      }
      return projections.get(z);
    };
    const Couche = L.GridLayer.extend({
      createTile(coords) {
        const tile = L.DomUtil.create('canvas', 'leaflet-tile');
        const taille = this.getTileSize();
        tile.width = taille.x;
        tile.height = taille.y;
        const ctx = tile.getContext('2d');
        const a = projeter(coords.z);
        const x0 = coords.x * taille.x;
        const y0 = coords.y * taille.y;
        const parDegre = (256 * 2 ** coords.z) / 360;
        const off = S.map(([dLat, dLng]) => [dLng * parDegre, dLat * parDegre]);
        const rayon = Math.abs(off[0][0]) / Math.cos(Math.PI / 6);
        const marge = rayon * 1.6 + 2;
        const petit = rayon < 2.2;
        if (rayon > 7) { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; }
        for (let i = 0; i < res.hex.length; i++) {
          const c = couleurs[i];
          if (!c) continue;
          const x = a[2 * i] - x0;
          const y = a[2 * i + 1] - y0;
          if (x < -marge || y < -marge || x > taille.x + marge || y > taille.y + marge) continue;
          ctx.fillStyle = c;
          if (petit) { const r = Math.max(1.4, rayon * 1.15); ctx.fillRect(x - r, y - r, 2 * r, 2 * r); continue; }
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const px = x + off[k][0];
            const py = y - off[k][1] / cos[i];
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          if (rayon > 7) ctx.stroke();
        }
        return tile;
      },
    });
    const couche = new Couche({ pane: 'couverture', opacity: 0.55, updateWhenZooming: false, keepBuffer: 2 });
    couche.addTo(map);
    // Info-bulle au survol : l'hexagone sous la souris.
    const bulle = L.tooltip({ direction: 'top', offset: [0, -12], opacity: 0.97 });
    let attente = null;
    let dernier = null;
    const survol = (e) => {
      dernier = e.latlng;
      if (attente) return;
      attente = requestAnimationFrame(() => {
        attente = null;
        const i = hexEn(res, dernier.lat, dernier.lng);
        if (i < 0 || !couleurs[i]) { map.closeTooltip(bulle); return; }
        bulle.setLatLng(dernier).setContent(infoHex(res, res.hex[i]));
        if (!map.hasLayer(bulle)) map.openTooltip(bulle);
      });
    };
    const sortie = () => map.closeTooltip(bulle);
    map.on('mousemove', survol);
    map.on('mouseout', sortie);
    return () => {
      map.off('mousemove', survol);
      map.off('mouseout', sortie);
      if (attente) cancelAnimationFrame(attente);
      map.closeTooltip(bulle);
      map.removeLayer(couche);
    };
  }, [map, res]);
  return null;
}

// Contour de l'hexagone choisi.
function HexChoisi({ res, i }) {
  const h = res.hex[i];
  const positions = sommetsHex(res.taille).map(([dLat, dLng]) => [h.lat + dLat, h.lng + dLng]);
  return <Polygon positions={positions} interactive={false} pathOptions={{ color: '#1e1b4b', weight: 2.5, fill: false }} />;
}

function LocationSelector({ onSelect }) {
  useMapEvents({
    click(e) {
      if (onSelect) onSelect(e.latlng);
    },
  });
  return null;
}


export default function ProMap({
  points = [],            // points de la société (nouveau modèle)
  typesById = {},         // id du type -> { nom, couleur }
  champsByType = {},      // id du type -> [champs personnalisés]
  auteurs = {},           // user_id -> nom affiché
  currentUserId = null,
  role = 'commercial',
  onEditPoint,
  visites = {},
  onVisite,
  onSelectLocation,
  simulatedPoint,
  onDragSimulated,
  selectedGouv,
  view,
  zoneKm = null,         // rayon de la zone simulée autour du point (km)
  ventes = {},           // id du point -> synthèse des ventes
  compact = false,       // téléphone : points plus petits, pas de boutons de zoom
  generateurs = null,    // générateurs de trafic (lib/generateurs.js), affichés si des classes sont actives
  classesGenerateurs = [], // clés des classes de générateurs affichées
  delegations = null,    // contours et chiffres des délégations (lib/recensement.js) : carte de densité
  carteDelegations = 'densite', // 'densite' (habitants / km²) ou 'pauvrete' (taux de pauvreté)
  isochrone = null,      // zones accessibles autour de l'emplacement simulé : { url, bounds } (lib/isochrones.js)
  couverture = null,     // carte de couverture en hexagones (lib/couverture.js)
  hexChoisi = -1,        // indice de l'hexagone choisi dans la carte de couverture
}) {
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    // Fichier hébergé dans le projet (dossier public/) : plus de dépendance à un dépôt externe.
    fetch('/tn-gouvernorats.geojson')
      .then((res) => {
        if (!res.ok) throw new Error('GeoJSON introuvable (HTTP ' + res.status + ')');
        return res.json();
      })
      .then((data) => setGeoData(data))
      .catch((err) => console.error('Erreur GeoJSON:', err));
  }, []);

  // Nom canonique du gouvernorat (les variantes du GeoJSON sont normalisées).
  const getGouvName = (feature) => {
    const p = feature.properties || {};
    // shapeName : propriété utilisée par geoBoundaries
    const raw = p.shapeName || p.nom || p.name || p.name_fr || p.NAME_1 || p.governorat || 'Tunisie';
    return normalizeGouvernorat(raw) || raw;
  };

  const geoStyle = useCallback((feature) => {
    const name = getGouvName(feature);
    const isSelected = !!selectedGouv && selectedGouv !== 'Tous' && sameGouvernorat(name, selectedGouv);

    return {
      fillColor: '#6366f1',
      weight: isSelected ? 2.5 : 1,
      opacity: isSelected ? 1 : 0.45,
      color: isSelected ? '#4f46e5' : '#6366f1',
      fillOpacity: isSelected ? 0.18 : 0.035,
    };
  }, [selectedGouv]);

  // La couche des gouvernorats est créée une seule fois : le style et le clic passent par des refs
  // (pas de reconstruction des 24 polygones à chaque changement d'onglet ou de fond).
  const styleRef = useRef(geoStyle);
  styleRef.current = geoStyle;
  const selectRef = useRef(onSelectLocation);
  selectRef.current = onSelectLocation;
  const geoRef = useRef(null);
  useEffect(() => {
    if (geoRef.current) geoRef.current.setStyle(geoStyle);
  }, [geoStyle]);
  // Carte de couverture : l'info-bulle de l'hexagone remplace celle du gouvernorat.
  const avecCouverture = !!couverture;
  useEffect(() => {
    if (!geoRef.current) return;
    geoRef.current.eachLayer((l) => {
      if (avecCouverture) l.unbindTooltip();
      else if (!l.getTooltip()) l.bindTooltip(l.feature.nomGouv, { sticky: true, direction: 'top', offset: [0, -8] });
    });
  }, [avecCouverture, geoData]);

  const onEachGouv = useCallback((feature, layer) => {
    const name = getGouvName(feature);
    layer.bindTooltip(name, { sticky: true, direction: 'top', offset: [0, -8] });
    layer.feature.nomGouv = name;
    layer.on({
      mouseover: () => layer.setStyle({ fillOpacity: 0.12, weight: 2, opacity: 0.9 }),
      mouseout: () => layer.setStyle(styleRef.current(feature)),
      click: (e) => {
        // Empêche l'événement de remonter à la carte (LocationSelector),
        // sinon le géocodage inverse part deux fois pour un seul clic.
        L.DomEvent.stopPropagation(e);
        if (selectRef.current) selectRef.current(e.latlng);
      }
    });
  }, []);

  // Ordre de dessin : concurrents d'abord, puis prospects, et le réseau de la société par-dessus.
  const ordonnes = useMemo(() => {
    const rang = (p) => ({ concurrent: 0, autre: 1, prospect: 2 })[(typesById[p.type_id] || {}).categorie] ?? 3;
    return [...points].sort((a, b) => rang(a) - rang(b));
  }, [points, typesById]);
  const ombres = useMemo(
    () => ordonnes.map((p) => <CircleMarker key={'o' + p.id} center={[p.latitude, p.longitude]} pathOptions={compact ? OMBRE_COMPACTE : OMBRE} interactive={false} />),
    [ordonnes, compact]
  );
  const marqueurs = useMemo(() => ordonnes.map((p) => {
    const type = typesById[p.type_id] || { nom: 'Type inconnu', couleur: '#3b82f6' };
    const statut = STATUTS[p.statut] || STATUTS.valide;
    const champs = champsByType[p.type_id] || [];
    const donnees = p.donnees || {};
    const editable = isManagerRole(role) || (p.cree_par === currentUserId && ['brouillon', 'rejete'].includes(p.statut));
    return (
      <CircleMarker
        key={p.id}
        center={[p.latitude, p.longitude]}
        pathOptions={styleDuPoint(type.couleur, p.statut, compact)}
      >
        <Popup minWidth={250} maxWidth={290}>
          <div style={{ fontFamily: 'inherit', lineHeight: 1.45, minWidth: '230px', color: '#334155' }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10.5px', background: type.couleur + '1a', color: type.couleur, padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>{type.nom}</span>
              <span style={{ fontSize: '10.5px', background: statut.bg, color: statut.color, padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>{statut.label}</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', letterSpacing: '-.01em', paddingRight: '14px' }}>{p.nom}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
              {[p.delegation, p.gouvernorat].filter(Boolean).join(' · ') || 'Zone non renseignée'}{p.code_externe ? ` · ${p.code_externe}` : ''}
            </div>
            {ventes[p.id] && (() => {
              const v = ventes[p.id];
              const evo = evolution(v);
              // CA par m² : premier champ numérique « surface » / « m² » du type.
              const cSurface = champs.find((c) => c.type_champ === 'nombre' && /surface|m2|m²/i.test(c.cle + ' ' + c.libelle));
              const m2 = cSurface ? Number((p.donnees || {})[cSurface.cle]) : NaN;
              const caM2 = m2 > 0 && caMensuelMoyen(v) ? caMensuelMoyen(v) / m2 : null;
              return (
                <div style={{ marginTop: '10px', background: 'linear-gradient(135deg, #0b1020, #1e1b4b)', color: 'white', padding: '10px 12px', borderRadius: '12px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#a5b4fc', fontWeight: 600 }}>CA 12 mois</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '19px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(Number(v.ca_12m)).toLocaleString('fr-FR')} TND</span>
                    {evo != null && <span style={{ fontSize: '11px', fontWeight: 700, color: evo >= 0 ? '#34d399' : '#f87171' }}>{evo >= 0 ? '▲' : '▼'} {Math.abs(Math.round(evo * 100))} %</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#c7d2fe' }}>{Math.round(caMensuelMoyen(v) || 0).toLocaleString('fr-FR')} TND / mois{caM2 != null ? ` · ${Math.round(caM2).toLocaleString('fr-FR')} TND/m²` : ''}</div>
                </div>
              );
            })()}
            {generateurs && (() => {
              const indice = indiceNational(generateurs, scorePassage(generateurs, p.latitude, p.longitude));
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
                  <span style={{ color: '#94a3b8' }}>Passage</span>
                  <span style={{ flex: 1, height: '5px', borderRadius: '5px', background: '#eef0f4', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: Math.max(3, indice) + '%', height: '100%', background: '#6366f1' }} />
                  </span>
                  <span style={{ color: '#0f172a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{indice}/100 · {niveauPassage(indice).toLowerCase()}</span>
                </div>
              );
            })()}
            {champs.some((c) => { const v = valeurChamp(p, c); return v !== undefined && v !== null && v !== ''; }) && (
              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '10px', rowGap: '3px', fontSize: '12px' }}>
                {champs.map((c) => {
                  const v = valeurChamp(p, c);
                  if (v === undefined || v === null || v === '') return null;
                  return [
                    <span key={c.id + 'l'} style={{ color: '#94a3b8' }}>{c.libelle}</span>,
                    <span key={c.id + 'v'} style={{ color: '#0f172a', fontWeight: 500 }}>{typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v)}</span>,
                  ];
                })}
              </div>
            )}
            {visites[p.id] && (
              <div style={{ fontSize: '12px', marginTop: '8px', color: '#64748b' }}>
                Dernière visite <b style={{ color: '#0f172a', fontWeight: 600 }}>{depuisLe(visites[p.id].derniere_visite)}</b>
                {visites[p.id].derniere_commande ? ` · commande ${depuisLe(visites[p.id].derniere_commande)}` : ''}
              </div>
            )}
            {p.statut === 'rejete' && p.commentaire_validation && (
              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '8px' }}>Motif du rejet : {p.commentaire_validation}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #eef0f4' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Ajouté par {p.cree_par === currentUserId ? 'moi' : (auteurs[p.cree_par] || 'un membre')}</span>
              <span style={{ display: 'flex', gap: '6px' }}>
              {onVisite && (typesById[p.type_id] || {}).categorie !== 'concurrent' && (
                <button
                  type="button"
                  onClick={() => onVisite(p)}
                  style={{ background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Visite
                </button>
              )}
              {editable && onEditPoint && (
                <button
                  type="button"
                  onClick={() => onEditPoint(p)}
                  style={{ background: '#eef0ff', color: '#4338ca', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Modifier
                </button>
              )}
              </span>
            </div>
          </div>
        </Popup>
      </CircleMarker>
    );
  }), [ordonnes, typesById, champsByType, auteurs, currentUserId, role, onEditPoint, ventes, compact, generateurs, visites, onVisite]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={[34.0, 9.5]}
        zoom={6}
        zoomSnap={0.25}
        wheelPxPerZoomLevel={110}
        preferCanvas
        zoomControl={false}
        maxBounds={TUNISIA_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={FOND.url} attribution={FOND.attribution} keepBuffer={4} updateWhenZooming={false} />

        {!compact && <ZoomControl position="bottomright" />}
        <TunisiaViewport />
        <MapUpdater view={view} />
        <LocationSelector onSelect={onSelectLocation} />

        {geoData && (
          <GeoJSON
            ref={geoRef}
            data={geoData}
            // Le GeoJSON arrive après les points : on le renvoie sous eux sur le canvas pour que les clics atteignent les points.
            eventHandlers={{ add: (e) => e.target.bringToBack() }}
            style={geoStyle}
            onEachFeature={onEachGouv}
          />
        )}
      
        {delegations && (
          // Carte de densité des délégations (onglet Démographie), au-dessus des gouvernorats.
          <Pane name="delegations" style={{ zIndex: 405 }}>
            <GeoJSON
              key={'del-' + carteDelegations + '-' + (selectedGouv || 'Tous')}
              data={delegations}
              style={(f) => {
                const p = f.properties;
                const dansGouv = !selectedGouv || selectedGouv === 'Tous' || sameGouvernorat(p.gouvernorat, selectedGouv);
                const couleur = carteDelegations === 'pauvrete' && p.pauvrete != null ? couleurPauvrete(p.pauvrete) : couleurDensite(p.population / Math.max(0.1, p.surface_km2));
                return { fillColor: couleur, fillOpacity: dansGouv ? 0.55 : 0.12, color: '#ffffff', weight: dansGouv ? 1 : 0.4, opacity: dansGouv ? 0.9 : 0.3 };
              }}
              onEachFeature={(f, layer) => {
                const p = f.properties;
                const densite = Math.round(p.population / Math.max(0.1, p.surface_km2));
                layer.bindTooltip(
                  `<b>${p.delegation}</b> · ${p.gouvernorat}<br>${p.population.toLocaleString('fr-FR')} hab. · ${densite.toLocaleString('fr-FR')} hab./km²`
                  + (p.pauvrete != null ? `<br>Pauvreté ${p.pauvrete.toLocaleString('fr-FR')} % · pouvoir d'achat ${p.indice_depense.toLocaleString('fr-FR')}` : '')
                  + (p.source === 'rgph2024' ? '<br><span style="color:#059669">Recensement 2024</span>' : '<br><span style="color:#94a3b8">Estimation 2024</span>'),
                  { sticky: true, direction: 'top', offset: [0, -8] }
                );
                layer.on('click', (e) => { L.DomEvent.stopPropagation(e); if (selectRef.current) selectRef.current(e.latlng); });
              }}
            />
          </Pane>
        )}

        {couverture && <CoucheCouverture res={couverture} />}
        {couverture && hexChoisi >= 0 && hexChoisi < couverture.hex.length && <HexChoisi res={couverture} i={hexChoisi} />}

        {generateurs && classesGenerateurs.length > 0 && (
          <CoucheGenerateurs generateurs={generateurs} actives={classesGenerateurs} compact={compact} />
        )}

        {ombres}
        {marqueurs}

        {simulatedPoint && simulatedPoint.source === 'gps' && simulatedPoint.precision > 0 && (
          // Précision du GPS du téléphone : la position réelle est quelque part dans ce cercle.
          <Circle
            center={[simulatedPoint.lat, simulatedPoint.lng]}
            radius={simulatedPoint.precision}
            pathOptions={{ color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.15 }}
            interactive={false}
          />
        )}

        {isochrone && (
          <Pane name="isochrone" style={{ zIndex: 390, pointerEvents: 'none' }}>
            <ImageOverlay url={isochrone.url} bounds={isochrone.bounds} opacity={0.6} className="gp-isochrone" />
          </Pane>
        )}

        {simulatedPoint && zoneKm && (
          <Circle
            center={[simulatedPoint.lat, simulatedPoint.lng]}
            radius={zoneKm * 1000}
            pathOptions={{ color: '#6d28d9', weight: 1.5, fillColor: '#8b5cf6', fillOpacity: 0.14, dashArray: '2 6', lineCap: 'round' }}
            interactive={false}
          />
        )}

        {simulatedPoint && (
          <Marker
            position={[simulatedPoint.lat, simulatedPoint.lng]}
            icon={simIcon}
            draggable={!!onDragSimulated}
            eventHandlers={{
              dragend: (e) => {
                if (onDragSimulated) onDragSimulated(e.target.getLatLng());
              },
            }}
          >
            <Popup>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#7c3aed', fontWeight: 600 }}>Emplacement étudié</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{[simulatedPoint.quartier, simulatedPoint.gouvernorat].filter(Boolean).join(' · ') || 'Position choisie'}</div>
              {onDragSimulated && <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>Glissez le repère pour ajuster la position.</div>}
            </Popup>
          </Marker>
        )}

      </MapContainer>
    </div>
  );
}
