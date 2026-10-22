'use client';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Circle, ZoomControl, useMapEvents, useMap } from 'react-leaflet';
import { useCallback, useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { normalizeGouvernorat, sameGouvernorat } from '../lib/gouvernorats';

import { STATUTS, isManagerRole } from '../lib/points';
import { caMensuelMoyen, evolution } from '../lib/ventes';

// Pastille colorée selon le type du point ; l'anneau indique le statut de validation.
const RING_BY_STATUT = {
  valide: { color: '#ffffff', style: 'solid' },
  a_valider: { color: '#f59e0b', style: 'dashed' },
  brouillon: { color: '#64748b', style: 'dashed' },
  rejete: { color: '#dc2626', style: 'solid' },
};
const iconCache = {};
function makeTypeIcon(color, statut) {
  const key = color + '|' + statut;
  if (!iconCache[key]) {
    const ring = RING_BY_STATUT[statut] || RING_BY_STATUT.valide;
    const opacity = statut === 'brouillon' ? 0.65 : 1;
    const halo = statut === 'valide' ? `0 0 0 1px ${color}33,` : '';
    iconCache[key] = L.divIcon({
      className: '',
      html: `<div class="gp-marker" style="width:18px;height:18px;box-sizing:border-box;border-radius:50%;background:radial-gradient(circle at 35% 30%, ${color}cc, ${color} 60%);border:2.5px ${ring.style} ${ring.color};box-shadow:${halo}0 2px 6px rgba(15,23,42,.35);opacity:${opacity}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10],
    });
  }
  return iconCache[key];
}

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

// Fonds de carte proposés (bouton « Clair / Plan / Satellite »).
const FONDS = {
  clair: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  plan: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagerie &copy; Esri, Maxar, Earthstar Geographics',
  },
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
  onSelectLocation,
  simulatedPoint,
  onDragSimulated,
  selectedGouv,
  view,
  zoneKm = null,         // rayon de la zone simulée autour du point (km)
  ventes = {},           // id du point -> synthèse des ventes
  fond = 'clair',        // fond de carte : clair, plan ou satellite
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
    const satellite = fond === 'satellite';

    return {
      fillColor: '#6366f1',
      weight: isSelected ? 2.5 : 1,
      opacity: isSelected ? 1 : satellite ? 0.7 : 0.45,
      color: isSelected ? '#4f46e5' : satellite ? '#ffffff' : '#6366f1',
      fillOpacity: isSelected ? 0.18 : satellite ? 0 : 0.035,
    };
  }, [selectedGouv, fond]);

  const onEachGouv = (feature, layer) => {
    const name = getGouvName(feature);
    layer.bindTooltip(name, { sticky: true, direction: 'top', offset: [0, -8] });
    layer.on({
      mouseover: () => layer.setStyle({ fillOpacity: 0.12, weight: 2, opacity: 0.9 }),
      mouseout: () => layer.setStyle(geoStyle(feature)),
      click: (e) => {
        // Empêche l'événement de remonter à la carte (LocationSelector),
        // sinon le géocodage inverse part deux fois pour un seul clic.
        L.DomEvent.stopPropagation(e);
        if (onSelectLocation) onSelectLocation(e.latlng);
      }
    });
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={[34.0, 9.5]}
        zoom={6}
        zoomSnap={0.25}
        zoomControl={false}
        maxBounds={TUNISIA_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer key={fond} url={(FONDS[fond] || FONDS.clair).url} attribution={(FONDS[fond] || FONDS.clair).attribution} />
      
        <ZoomControl position="bottomright" />
        <TunisiaViewport />
        <MapUpdater view={view} />
        <LocationSelector onSelect={onSelectLocation} />

        {geoData && (
          <GeoJSON
            key={selectedGouv + '|' + fond}
            data={geoData} 
            style={geoStyle} 
            onEachFeature={onEachGouv} 
          />
        )}
      
        {points.map((p) => {
          const type = typesById[p.type_id] || { nom: 'Type inconnu', couleur: '#3b82f6' };
          const statut = STATUTS[p.statut] || STATUTS.valide;
          const champs = champsByType[p.type_id] || [];
          const donnees = p.donnees || {};
          const editable = isManagerRole(role) || (p.cree_par === currentUserId && ['brouillon', 'rejete'].includes(p.statut));
          return (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={makeTypeIcon(type.couleur, p.statut)}
              title={p.nom}
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
                  {champs.some((c) => donnees[c.cle] !== undefined && donnees[c.cle] !== null && donnees[c.cle] !== '') && (
                    <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '10px', rowGap: '3px', fontSize: '12px' }}>
                      {champs.map((c) => {
                        const v = donnees[c.cle];
                        if (v === undefined || v === null || v === '') return null;
                        return [
                          <span key={c.id + 'l'} style={{ color: '#94a3b8' }}>{c.libelle}</span>,
                          <span key={c.id + 'v'} style={{ color: '#0f172a', fontWeight: 500 }}>{typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v)}</span>,
                        ];
                      })}
                    </div>
                  )}
                  {p.statut === 'rejete' && p.commentaire_validation && (
                    <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '8px' }}>Motif du rejet : {p.commentaire_validation}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #eef0f4' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Ajouté par {p.cree_par === currentUserId ? 'moi' : (auteurs[p.cree_par] || 'un membre')}</span>
                    {editable && onEditPoint && (
                      <button
                        type="button"
                        onClick={() => onEditPoint(p)}
                        style={{ background: '#eef0ff', color: '#4338ca', border: 'none', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Modifier
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

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
