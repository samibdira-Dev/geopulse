'use client';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import { useCallback, useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GOUV_COLORS, normalizeGouvernorat, sameGouvernorat } from '../lib/gouvernorats';

import { STATUTS, isManagerRole } from '../lib/points';

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
    const opacity = statut === 'brouillon' ? 0.6 : 1;
    iconCache[key] = L.divIcon({
      className: '',
      html: `<div style="width:22px;height:22px;box-sizing:border-box;border-radius:50%;background:${color};border:3px ${ring.style} ${ring.color};box-shadow:0 1px 4px rgba(0,0,0,.5);opacity:${opacity}"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -12],
    });
  }
  return iconCache[key];
}

const simIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

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
    const color = GOUV_COLORS[name] || '#3b82f6';
    const isSelected = !!selectedGouv && selectedGouv !== 'Tous' && sameGouvernorat(name, selectedGouv);

    return {
      fillColor: color,
      weight: isSelected ? 3 : 2,
      opacity: 1,
      color: '#ffffff',
      fillOpacity: isSelected ? 0.4 : 0.15,
    };
  }, [selectedGouv]);

  const onEachGouv = (feature, layer) => {
    const name = getGouvName(feature);
    layer.bindTooltip(`<b>Gouvernorat : ${name}</b>`, { sticky: true });
    layer.on({
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
        maxBounds={TUNISIA_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
      
        <TunisiaViewport />
        <MapUpdater view={view} />
        <LocationSelector onSelect={onSelectLocation} />

        {geoData && (
          <GeoJSON
            key={selectedGouv}
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
              <Popup minWidth={210}>
                <div style={{ fontFamily: 'sans-serif', lineHeight: 1.45, minWidth: '190px' }}>
                  <strong style={{ fontSize: '14px', color: '#0f172a' }}>{p.nom}</strong>
                  <div style={{ margin: '3px 0 5px' }}>
                    <span style={{ fontSize: '11px', background: type.couleur, color: '#fff', padding: '1px 7px', borderRadius: '10px', fontWeight: 'bold', marginRight: '6px' }}>{type.nom}</span>
                    <span style={{ fontSize: '11px', background: statut.bg, color: statut.color, padding: '1px 7px', borderRadius: '10px', fontWeight: 'bold' }}>{statut.label}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    📍 {[p.delegation, p.gouvernorat].filter(Boolean).join(' · ') || 'Zone non renseignée'}
                  </div>
                  {champs.map((c) => {
                    const v = donnees[c.cle];
                    if (v === undefined || v === null || v === '') return null;
                    return (
                      <div key={c.id} style={{ fontSize: '12px', color: '#334155' }}>
                        <b>{c.libelle} :</b> {typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v)}
                      </div>
                    );
                  })}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Ajouté par {p.cree_par === currentUserId ? 'moi' : (auteurs[p.cree_par] || 'un membre')}
                  </div>
                  {p.statut === 'rejete' && p.commentaire_validation && (
                    <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '4px' }}>Motif du rejet : {p.commentaire_validation}</div>
                  )}
                  {editable && onEditPoint && (
                    <button
                      type="button"
                      onClick={() => onEditPoint(p)}
                      style={{ marginTop: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      ✏️ Modifier
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

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
              <b>Position du point</b><br />
              {simulatedPoint.quartier && <span><b>Quartier :</b> {simulatedPoint.quartier}<br /></span>}
              {simulatedPoint.gouvernorat && <span><b>Gouvernorat :</b> {simulatedPoint.gouvernorat}<br /></span>}
              {onDragSimulated && <span style={{ color: '#64748b', fontSize: '12px' }}>Glissez ce pin pour ajuster la position.</span>}
            </Popup>
          </Marker>
        )}

      </MapContainer>
    </div>
  );
}
