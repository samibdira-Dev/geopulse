import { normalizeGouvernorat } from './gouvernorats';

function dansAnneau(lng, lat, ring) {
  let dedans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

function dansPolygone(lng, lat, rings) {
  if (!rings.length || !dansAnneau(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (dansAnneau(lng, lat, rings[k])) return false;
  return true;
}

// Gouvernorat contenant le point (calcul local sur le GeoJSON), ou '' si hors des limites.
export function gouvernoratAt(geojson, lat, lng) {
  if (!geojson || !geojson.features) return '';
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (polys.some((p) => dansPolygone(lng, lat, p))) {
      const pr = f.properties || {};
      const raw = pr.shapeName || pr.nom || pr.name || pr.name_fr || pr.NAME_1 || '';
      return normalizeGouvernorat(raw) || raw;
    }
  }
  return '';
}

// Quartier / adresse via Nominatim (au mieux : renvoie des champs vides en cas d'échec).
export async function adresseAt(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=fr`);
    if (!res.ok) return { quartier: '', adresse: '' };
    const d = await res.json();
    const a = d.address || {};
    return {
      quartier: a.suburb || a.neighbourhood || a.city_district || a.village || a.town || a.city || '',
      adresse: [a.road, a.suburb || a.neighbourhood].filter(Boolean).join(', '),
    };
  } catch (e) {
    return { quartier: '', adresse: '' };
  }
}

export const TUNISIE = { latMin: 30.0, latMax: 37.8, lngMin: 7.0, lngMax: 12.0 };
export function dansTunisie(lat, lng) {
  return lat >= TUNISIE.latMin && lat <= TUNISIE.latMax && lng >= TUNISIE.lngMin && lng <= TUNISIE.lngMax;
}
