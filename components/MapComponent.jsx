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

// Palette de couleurs distinctes pour les gouvernorats
const GOUV_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#d946ef', '#eab308', '#22c55e', '#a855f7',
  '#0ea5e9', '#f43f5e', '#34d399', '#fbbf24', '#c084fc',
  '#38bdf8', '#fb7185', '#2dd4bf', '#facc15'
];

function getGovernorateColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GOUV_COLORS[Math.abs(hash) % GOUV_COLORS.length];
}

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
      .catch((err) => console.error('Erreur chargement limites gouvernorats:', err));
  }, []);

  const getCoords = (p, idx) => {
    if (p.latitude && p.longitude) return [Number(p.latitude), Number(p.longitude)];
    if (p.gouvernorat === 'Ariana') return [36.8625, 10.1932];
    if (p.gouvernorat === 'Sousse') return [35.8361, 10.5920];
    if (p.gouvernorat === 'Ben Arous') return [36.7230, 10.2280];
    if (p.gouvernorat === 'Monastir') return [35.7780, 10.8262];
    if (p.gouvernorat === 'Sfax') return [34.7406, 10.7603];
    return [36.8065 + (idx * 0.015), 10.1815 + (idx * 0.015)];
  };

  const geoStyle = (feature) => {
    const name = feature.properties.name_fr || feature.properties.NAME_1 || 'Gouvernorat';
    const color = getGovernorateColor(name);
    const isSelected = selectedGouv && selectedGouv !== 'Tous' && name.toLowerCase().includes(selectedGouv.toLowerCase());
    
    return {
      fillColor: color,
      weight: isSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected ? '#1d4ed8' : '#334155',
      fillOpacity: isSelected ? 0.6 : 0.35,
    };
  };

  const onEachGouv = (feature, layer) => {
    const name = feature.properties.name_fr || feature.properties.NAME_1 || 'Gouvernorat';
    layer.bindTooltip(`<b>Gouvernorat : ${name}</b>`, { sticky: true });
    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ weight: 3, color: '#0f172a', fillOpacity: 0.6 });
      },
      mouseout: (e) => {
        const l = e.target;
        l.setStyle(geoStyle(feature));
      },
      click: (e) => {
        if (onSelectLocation) onSelectLocation(e.latlng);
      }
    });
  };

  return (
    <MapContainer center={[35.8, 10.0]} zoom={7} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      
      <MapUpdater center={mapCenter} zoom={selectedGouv === 'Tous' ? 7 : 11} />
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
              {p.ajoute_par && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '2px' }}>Ajouté par : {p.ajoute_par}</div>}
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
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              GPS: {simulatedPoint.lat.toFixed(4)}, {simulatedPoint.lng.toFixed(4)}
            </span>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
