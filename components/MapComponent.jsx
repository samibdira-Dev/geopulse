'use client';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
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

// ---------------------------------------------------------------------------
// Couche « Pharmacies » (test) : pins déplaçables, fiches modifiables.
// Les corrections sont enregistrées dans le navigateur (localStorage) et
// exportables en CSV. Données d'origine : /pharmacies.json (OpenStreetMap, ODbL).
// ---------------------------------------------------------------------------
const PHARMA_EDITS_KEY = 'geopulse_pharmacies_edits_v1';

const makePharmaIcon = (color) => L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;box-sizing:border-box;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);color:#fff;font:bold 14px/16px sans-serif;text-align:center;cursor:grab">+</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});
const PHARMA_ICON = makePharmaIcon('#16a34a');
const PHARMA_ICON_EDITED = makePharmaIcon('#f59e0b');

function readPharmaEdits() {
  try {
    return JSON.parse(window.localStorage.getItem(PHARMA_EDITS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function writePharmaEdits(edits) {
  try {
    window.localStorage.setItem(PHARMA_EDITS_KEY, JSON.stringify(edits));
  } catch (e) {
    // Stockage indisponible (navigation privée, etc.) : les corrections restent en mémoire.
  }
}

// Cellule CSV protégée : les données OpenStreetMap sont modifiables par tous,
// on neutralise donc les valeurs qui seraient lues comme une formule par Excel.
function csvCell(value) {
  let s = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function downloadPharmaCsv(rows, baseById, edits) {
  const head = ['id', 'nom', 'ville', 'gouvernorat', 'telephone', 'horaires', 'latitude', 'longitude', 'latitude_origine', 'longitude_origine', 'modifie'];
  const lines = [head.map(csvCell).join(';')];
  rows.forEach((p) => {
    const base = baseById[p.id] || p;
    lines.push([
      p.id, p.nom, p.ville, p.gouvernorat, p.tel, p.horaires,
      p.lat, p.lng, base.lat, base.lng, edits[p.id] ? 'oui' : 'non',
    ].map(csvCell).join(';'));
  });
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pharmacies-corrigees.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const pharmaInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '5px 6px', marginTop: '2px',
  border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 'normal',
};
const pharmaLabelStyle = { display: 'block', marginTop: '6px', fontSize: '11px', fontWeight: 'bold', color: '#334155' };

function PharmacyForm({ pharmacy, modified, onSave, onReset }) {
  const [form, setForm] = useState({
    nom: pharmacy.nom, ville: pharmacy.ville, tel: pharmacy.tel, horaires: pharmacy.horaires,
  });
  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      style={{ fontFamily: 'sans-serif', minWidth: '230px', lineHeight: 1.4 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '14px', color: '#166534' }}>{pharmacy.nom || 'Pharmacie (sans nom)'}</strong>
        {modified && (
          <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '8px', fontWeight: 'bold' }}>modifiée</span>
        )}
      </div>
      <div style={{ fontSize: '11px', color: '#64748b' }}>{pharmacy.gouvernorat}</div>

      <label style={pharmaLabelStyle}>Nom
        <input type="text" value={form.nom} onChange={setField('nom')} style={pharmaInputStyle} />
      </label>
      <label style={pharmaLabelStyle}>Ville / quartier
        <input type="text" value={form.ville} onChange={setField('ville')} style={pharmaInputStyle} />
      </label>
      <label style={pharmaLabelStyle}>Téléphone
        <input type="text" value={form.tel} onChange={setField('tel')} style={pharmaInputStyle} />
      </label>
      <label style={pharmaLabelStyle}>Horaires
        <input type="text" value={form.horaires} onChange={setField('horaires')} style={pharmaInputStyle} />
      </label>

      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
        📍 {pharmacy.lat.toFixed(5)}, {pharmacy.lng.toFixed(5)}<br />
        Position fausse ? Glissez le pin au bon endroit.
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        <button type="submit" style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
          Enregistrer
        </button>
        {modified && (
          <button type="button" onClick={onReset} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}>
            Rétablir l’original
          </button>
        )}
      </div>
      <a
        href={`https://www.openstreetmap.org/${pharmacy.id}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', marginTop: '6px', fontSize: '11px' }}
      >
        Voir sur OpenStreetMap
      </a>
    </form>
  );
}

function PharmacyPanel({ total, modifiedCount, error, onExport, onResetAll }) {
  const btn = { border: '1px solid #cbd5e1', borderRadius: '4px', padding: '5px 8px', fontSize: '12px', background: '#fff', color: '#334155', cursor: 'pointer' };
  return (
    <div style={{
      position: 'absolute', top: '12px', right: '12px', zIndex: 1000, width: '250px',
      background: 'rgba(255,255,255,0.96)', border: '1px solid #e2e8f0', borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.15)', padding: '10px 12px',
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#334155',
    }}>
      <div style={{ fontWeight: 'bold', color: '#166534', fontSize: '13px' }}>💊 Pharmacies : test (source OpenStreetMap)</div>
      {error ? (
        <div style={{ color: '#b91c1c', marginTop: '6px' }}>{error}</div>
      ) : (
        <>
          <div style={{ marginTop: '4px' }}>
            <b>{total}</b> pharmacies · <b style={{ color: modifiedCount ? '#b45309' : 'inherit' }}>{modifiedCount}</b> modifiée(s)
          </div>
          <div style={{ marginTop: '6px', color: '#64748b' }}>
            Cliquez sur un pin pour modifier la fiche, glissez-le pour corriger sa position. Pin orange = modifié.
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <button type="button" onClick={onExport} style={btn}>Exporter (CSV)</button>
            <button type="button" onClick={onResetAll} disabled={!modifiedCount} style={{ ...btn, opacity: modifiedCount ? 1 : 0.5, cursor: modifiedCount ? 'pointer' : 'default' }}>
              Tout rétablir
            </button>
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
            Corrections enregistrées sur cet appareil uniquement.
          </div>
        </>
      )}
    </div>
  );
}

export default function MapComponent({ points = [], onSelectLocation, simulatedPoint, selectedGouv, mapCenter, layer = 'pdv' }) {
  const [geoData, setGeoData] = useState(null);

  // --- Couche pharmacies ---
  const showPharmacies = layer === 'pharmacies';
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmaError, setPharmaError] = useState('');
  const [edits, setEdits] = useState({});
  const [editsLoaded, setEditsLoaded] = useState(false);

  useEffect(() => {
    setEdits(readPharmaEdits());
    setEditsLoaded(true);
  }, []);

  useEffect(() => {
    if (editsLoaded) writePharmaEdits(edits);
  }, [edits, editsLoaded]);

  useEffect(() => {
    if (!showPharmacies || pharmacies.length) return;
    setPharmaError('');
    fetch('/pharmacies.json')
      .then((res) => {
        if (!res.ok) throw new Error('Fichier pharmacies introuvable (HTTP ' + res.status + ')');
        return res.json();
      })
      .then((data) => setPharmacies(data.map((p) => ({ ...p, pos: [p.lat, p.lng] }))))
      .catch((err) => setPharmaError(err.message));
  }, [showPharmacies, pharmacies.length]);

  const baseById = useMemo(
    () => Object.fromEntries(pharmacies.map((p) => [p.id, p])),
    [pharmacies]
  );

  // Données d'origine + corrections. Les fiches non modifiées gardent le même objet.
  const merged = useMemo(
    () => pharmacies.map((p) => {
      const e = edits[p.id];
      if (!e) return p;
      const lat = e.lat != null ? e.lat : p.lat;
      const lng = e.lng != null ? e.lng : p.lng;
      return { ...p, ...e, lat, lng, pos: [lat, lng] };
    }),
    [pharmacies, edits]
  );

  const modifiedCount = useMemo(
    () => pharmacies.filter((p) => edits[p.id]).length,
    [pharmacies, edits]
  );

  // Enregistre uniquement ce qui diffère de l'original ; supprime la correction si tout est revenu à l'identique.
  const patchEdit = (id, mutate) => {
    setEdits((prev) => {
      const cur = { ...(prev[id] || {}) };
      mutate(cur, baseById[id]);
      const next = { ...prev };
      if (Object.keys(cur).length) next[id] = cur;
      else delete next[id];
      return next;
    });
  };

  const savePharmacy = (id, form) => patchEdit(id, (cur, base) => {
    ['nom', 'ville', 'tel', 'horaires'].forEach((k) => {
      const v = (form[k] || '').trim();
      if (v !== base[k]) cur[k] = v;
      else delete cur[k];
    });
  });

  const movePharmacy = (id, latlng) => patchEdit(id, (cur, base) => {
    const lat = Number(latlng.lat.toFixed(5));
    const lng = Number(latlng.lng.toFixed(5));
    if (lat === base.lat && lng === base.lng) {
      delete cur.lat;
      delete cur.lng;
    } else {
      cur.lat = lat;
      cur.lng = lng;
    }
  });

  const resetPharmacy = (id) => setEdits((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });

  const resetAllPharmacies = () => {
    if (window.confirm('Rétablir toutes les pharmacies à leur état d’origine ? Vos corrections seront perdues.')) {
      setEdits({});
    }
  };

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
        <MapUpdater center={mapCenter} zoom={9} resetToCountry={selectedGouv === 'Tous'} />
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

        {showPharmacies && merged.map((p) => (
          <Marker
            key={p.id}
            position={p.pos}
            icon={edits[p.id] ? PHARMA_ICON_EDITED : PHARMA_ICON}
            title={p.nom || 'Pharmacie'}
            draggable
            eventHandlers={{ dragend: (e) => movePharmacy(p.id, e.target.getLatLng()) }}
          >
            <Popup minWidth={240}>
              <PharmacyForm
                key={[p.nom, p.ville, p.tel, p.horaires].join('|')}
                pharmacy={p}
                modified={!!edits[p.id]}
                onSave={(form) => savePharmacy(p.id, form)}
                onReset={() => resetPharmacy(p.id)}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {showPharmacies && (
        <PharmacyPanel
          total={pharmacies.length}
          modifiedCount={modifiedCount}
          error={pharmaError}
          onExport={() => downloadPharmaCsv(merged, baseById, edits)}
          onResetAll={resetAllPharmacies}
        />
      )}
    </div>
  );
}
