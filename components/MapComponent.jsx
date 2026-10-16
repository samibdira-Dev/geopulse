'use client';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Polygon, useMapEvents, useMap } from 'react-leaflet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GOUV_COLORS, normalizeGouvernorat, sameGouvernorat } from '../lib/gouvernorats';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

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

// Voile opaque sur tout ce qui est hors de la Tunisie (pays voisins et mer) :
// un grand rectangle « monde » percé des contours de chaque gouvernorat.
const WORLD_RING = [[-85, -179.9], [-85, 179.9], [85, 179.9], [85, -179.9]];

function MaskOutsideTunisia({ geoData }) {
  const positions = useMemo(() => {
    const holes = [];
    ((geoData && geoData.features) || []).forEach((feature) => {
      const g = feature.geometry;
      if (!g) return;
      const polygons =
        g.type === 'Polygon' ? [g.coordinates] :
        g.type === 'MultiPolygon' ? g.coordinates : [];
      polygons.forEach((poly) => {
        // Anneau extérieur uniquement, converti de [lng, lat] en [lat, lng].
        if (poly[0]) holes.push(poly[0].map(([lng, lat]) => [lat, lng]));
      });
    });
    return [WORLD_RING, ...holes];
  }, [geoData]);

  return (
    <Polygon
      positions={positions}
      pathOptions={{ stroke: false, fillColor: '#f8fafc', fillOpacity: 1, interactive: false }}
    />
  );
}

function MapUpdater({ center, zoom, resetToCountry }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    if (resetToCountry) {
      map.flyToBounds(TUNISIA_BOUNDS, { duration: 1.2 });
    } else {
      map.flyTo(center, zoom || 11, { duration: 1.2 });
    }
  }, [center, zoom, resetToCountry, map]);
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

export default function MapComponent({ points = [], onSelectLocation, simulatedPoint, selectedGouv, mapCenter }) {
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

  const getCoords = (p, idx) => {
    if (p.latitude && p.longitude) return [Number(p.latitude), Number(p.longitude)];
    return [36.8065 + (idx * 0.015), 10.1815 + (idx * 0.015)];
  };

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
      <MapUpdater center={mapCenter} zoom={9} resetToCountry={selectedGouv === 'Tous'} />
      <LocationSelector onSelect={onSelectLocation} />

      {geoData && <MaskOutsideTunisia geoData={geoData} />}

      {geoData && (
        <GeoJSON
          key={selectedGouv}
          data={geoData} 
          style={geoStyle} 
          onEachFeature={onEachGouv} 
        />
      )}
      
      {points.map((p, idx) => (
        <Marker key={p.id_pdv || idx} position={getCoords(p, idx)} icon={customIcon}>
          <Popup>
            <div style={{ fontFamily: 'sans-serif', lineHeight: '1.5', minWidth: '170px' }}>
              <strong style={{ fontSize: '14px', color: '#1e3a8a' }}>{p.nom_pdv}</strong><br />
              {p.client_nom && <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{p.client_nom}</span>}<br />
              <b>Type :</b> {p.type_pdv}<br />
              <b>Zone :</b> {p.gouvernorat} {p.delegation ? `(${p.delegation})` : ''}<br />
              <b>CA Moyen :</b> {Number(p.ca_historique_moyen).toLocaleString()} TND
            </div>
          </Popup>
        </Marker>
      ))}

      {simulatedPoint && (
        <Marker position={[simulatedPoint.lat, simulatedPoint.lng]} icon={simIcon}>
          <Popup>
            <b>Emplacement détecté</b><br />
            {simulatedPoint.quartier && <span><b>Quartier :</b> {simulatedPoint.quartier}<br /></span>}
            {simulatedPoint.gouvernorat && <span><b>Gouvernorat :</b> {simulatedPoint.gouvernorat}<br /></span>}
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
