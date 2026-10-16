'use client';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
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

function LocationSelector({ onSelect }) {
  useMapEvents({
    click(e) {
      if (onSelect) onSelect(e.latlng);
    },
  });
  return null;
}

export default function MapComponent({ points = [], onSelectLocation, simulatedPoint }) {
  const getCoords = (p, idx) => {
    // 1. Utilise les coordonnées GPS exactes si elles ont été saisies par l'équipe
    if (p.latitude && p.longitude) return [Number(p.latitude), Number(p.longitude)];
    
    // 2. Sinon, positionne par gouvernorat pour les anciens points
    if (p.gouvernorat === 'Ariana') return [36.8625, 10.1932];
    if (p.gouvernorat === 'Sousse') return [35.8361, 10.5920];
    if (p.gouvernorat === 'Ben Arous') return [36.7230, 10.2280];
    if (p.gouvernorat === 'Monastir') return [35.7780, 10.8262];
    if (p.gouvernorat === 'Sfax') return [34.7406, 10.7603];
    if (p.gouvernorat === 'Nabeul') return [36.4513, 10.7357];
    if (p.gouvernorat === 'Bizerte') return [37.2744, 9.8739];
    
    return [36.8065 + (idx * 0.015), 10.1815 + (idx * 0.015)];
  };

  return (
    <MapContainer center={[36.0, 10.2]} zoom={7} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <LocationSelector onSelect={onSelectLocation} />
      
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
            <b>Nouvelle implantation simulée</b><br />
            Lat: {simulatedPoint.lat.toFixed(4)}, Lng: {simulatedPoint.lng.toFixed(4)}
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
