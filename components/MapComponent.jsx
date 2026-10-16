'use client';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

const GOUV_COLORS = {
  'Tunis': '#3b82f6', 'Ariana': '#ef4444', 'Ben Arous': '#10b981', 'Manouba': '#f59e0b',
  'Nabeul': '#8b5cf6', 'Zaghouan': '#ec4899', 'Bizerte': '#14b8a6', 'Béja': '#f97316',
  'Jendouba': '#6366f1', 'Le Kef': '#84cc16', 'Siliana': '#06b6d4', 'Sousse': '#d946ef',
  'Monastir': '#eab308', 'Mahdia': '#22c55e', 'Sfax': '#a855f7', 'Kairouan': '#0ea5e9',
  'Kasserine': '#f43f5e', 'Sidi Bouzid': '#34d399', 'Gabès': '#fbbf24', 'Medenine': '#c084fc',
  'Tataouine': '#38bdf8', 'Gafsa': '#fb7185', 'Tozeur': '#2dd4bf', 'Kébili': '#facc15'
};

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

  const getGouvName = (feature) => {
    const p = feature.properties;
    return p.nom || p.name || p.name_fr || p.NAME_1 || p.governorat || 'Tunisie';
  };

  const geoStyle = (feature) => {
    const name = getGouvName(feature);
    const color = GOUV_COLORS[name] || '#3b82f6';
    const isSelected = selectedGouv && selectedGouv !== 'Tous' && name.toLowerCase().includes(selectedGouv.toLowerCase());
    
    return {
      fillColor: color,
      weight: isSelected ? 3 : 2,
      opacity: 1,
      color: '#ffffff',
      fillOpacity: isSelected ? 0.75 : 0.5,
    };
  };

  const onEachGouv = (feature, layer) => {
    const name = getGouvName(feature);
    layer.bindTooltip(`<b>Gouvernorat : ${name}</b>`, { sticky: true });
    layer.on({
      click: (e) => {
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
          key={selectedGouv + JSON.stringify(geoData)} 
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
