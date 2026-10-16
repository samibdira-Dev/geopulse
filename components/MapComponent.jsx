'use client';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import { useCallback, useEffect, useState } from 'react';
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

function MapUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 11, { duration: 1.2 });
    }
  }, [center, zoom, map]);
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
    fetch('https://raw.githubusercontent.com/riatelab/tunisie/master/data/tn-gouvernorats.geojson')
      .then((res) => res.json())
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
    const raw = p.nom || p.name || p.name_fr || p.NAME_1 || p.governorat || 'Tunisie';
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
      fillOpacity: isSelected ? 0.75 : 0.5,
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
    <MapContainer center={[34.0, 9.0]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      
      <MapUpdater center={mapCenter} zoom={selectedGouv === 'Tous' ? 6 : 9} />
      <LocationSelector onSelect={onSelectLocation} />

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
