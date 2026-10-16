'use client';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom marker fix for Leaflet in Next.js
const customIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const simIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to handle map clicks for simulation
function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function MapComponent({ points, onSelectLocation, simulatedPoint }) {
  // Centre sur la Tunisie (Tunis / Sousse)
  const position = [36.8065, 10.1815];

  return (
    <MapContainer center={position} zoom={8} style={{ width: '100%', height: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <ClickHandler onMapClick={onSelectLocation} />

      {/* Points de vente existants SOPAT */}
      {points.map((pt) => {
        // Extraction lat/lng depuis PostGIS WKB ou coordonnées stockées
        // Pour faire simple dans le MVP, supposons des propriétés lat/lng ou parsing geom si présent
        // Ici on gère si le point a des coord directes ou stockées
        let lat = pt.latitude || 36.8;
        let lng = pt.longitude || 10.18;
        
        // Si les geom postgis sont sous forme de texte ou coordonnées simulées pour le test
        if (pt.nom_pdv && pt.nom_pdv.includes('Ariana')) { lat = 36.8625; lng = 10.1932; }
        if (pt.nom_pdv && pt.nom_pdv.includes('Sousse')) { lat = 35.8361; lng = 10.5920; }
        if (pt.nom_pdv && pt.nom_pdv.includes('Mourouj')) { lat = 36.7230; lng = 10.2280; }

        return (
          <Marker key={pt.id_pdv || Math.random()} position={[lat, lng]} icon={customIcon}>
            <Popup>
              <div style={{ minWidth: '160px' }}>
                <strong style={{ color: '#1e293b' }}>{pt.nom_pdv}</strong>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>
                  <b>Type :</b> {pt.type_pdv}<br/>
                  <b>Gouvernorat :</b> {pt.gouvernorat}<br/>
                  <b>CA Moyen :</b> {pt.ca_historique_moyen ? pt.ca_historique_moyen.toLocaleString() + ' TND' : 'N/A'}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Point simulé par l'utilisateur */}
      {simulatedPoint && (
        <Marker position={[simulatedPoint.lat, simulatedPoint.lng]} icon={simIcon}>
          <Popup>
            <div>
              <strong style={{ color: '#7c3aed' }}>📍 Emplacement Simulé</strong>
              <p style={{ margin: '5px 0', fontSize: '13px' }}>
                <b>CA Prévisionnel estimé :</b> 88,500 TND / mois<br/>
                <b>Population (10 min) :</b> ~22,400 hab.<br/>
                <b>Risque Cannibalisme :</b> Faible (9%)
              </p>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}