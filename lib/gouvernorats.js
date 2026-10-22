// Source unique pour les 24 gouvernorats : noms canoniques, coordonnées, couleurs
// et normalisation des variantes renvoyées par Nominatim / GeoJSON / base de données.

export const GOUV_COORDS = {
  'Tunis': [36.8065, 10.1815],
  'Ariana': [36.8625, 10.1932],
  'Ben Arous': [36.7435, 10.2319],
  'Manouba': [36.8081, 10.0972],
  'Nabeul': [36.4513, 10.7357],
  'Zaghouan': [36.4029, 10.1429],
  'Bizerte': [37.2744, 9.8739],
  'Béja': [36.7256, 9.1817],
  'Jendouba': [36.5011, 8.7803],
  'Le Kef': [36.1742, 8.7047],
  'Siliana': [36.0850, 9.3708],
  'Sousse': [35.8256, 10.6084],
  'Monastir': [35.7780, 10.8262],
  'Mahdia': [35.5047, 11.0622],
  'Sfax': [34.7406, 10.7603],
  'Kairouan': [35.6781, 10.0963],
  'Kasserine': [35.1675, 8.8367],
  'Sidi Bouzid': [35.0382, 9.4859],
  'Gabès': [33.8815, 10.0982],
  'Medenine': [33.8753, 10.8583],
  'Tataouine': [32.9297, 10.4518],
  'Gafsa': [34.4250, 8.7842],
  'Tozeur': [33.9197, 8.1335],
  'Kébili': [33.7044, 8.9690],
};

export const GOUV_COLORS = {
  'Tunis': '#3b82f6', 'Ariana': '#ef4444', 'Ben Arous': '#10b981', 'Manouba': '#f59e0b',
  'Nabeul': '#8b5cf6', 'Zaghouan': '#ec4899', 'Bizerte': '#14b8a6', 'Béja': '#f97316',
  'Jendouba': '#6366f1', 'Le Kef': '#84cc16', 'Siliana': '#06b6d4', 'Sousse': '#d946ef',
  'Monastir': '#eab308', 'Mahdia': '#22c55e', 'Sfax': '#a855f7', 'Kairouan': '#0ea5e9',
  'Kasserine': '#f43f5e', 'Sidi Bouzid': '#34d399', 'Gabès': '#fbbf24', 'Medenine': '#c084fc',
  'Tataouine': '#38bdf8', 'Gafsa': '#fb7185', 'Tozeur': '#2dd4bf', 'Kébili': '#facc15',
};

// Clé de comparaison : minuscules, sans accents, sans ponctuation, sans préfixes administratifs.
function toKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/gouvernorat\s+(du|de|d['’])?\s*/g, '')
    .replace(/governorate/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Alias connus (clé normalisée -> nom canonique).
const ALIASES = {
  'kef': 'Le Kef',
  'el kef': 'Le Kef',
  'le kef': 'Le Kef',
  'medenine': 'Medenine',
  'mednine': 'Medenine',
  'gabes': 'Gabès',
  'kebili': 'Kébili',
  'beja': 'Béja',
  'sidi bou zid': 'Sidi Bouzid',
  'sidi bouzid': 'Sidi Bouzid',
  'la manouba': 'Manouba',
  'manouba': 'Manouba',
  'monastir': 'Monastir',
  'tunis': 'Tunis',
  'ben arous': 'Ben Arous',
  'ariana': 'Ariana',
};

const CANONICAL_BY_KEY = Object.keys(GOUV_COORDS).reduce((acc, name) => {
  acc[toKey(name)] = name;
  return acc;
}, {});

// Retourne le nom canonique du gouvernorat, ou null s'il n'est pas reconnu.
export function normalizeGouvernorat(raw) {
  const key = toKey(raw);
  if (!key) return null;
  return CANONICAL_BY_KEY[key] || ALIASES[key] || null;
}

// Compare deux noms de gouvernorat après normalisation.
export function sameGouvernorat(a, b) {
  const na = normalizeGouvernorat(a);
  const nb = normalizeGouvernorat(b);
  return !!na && na === nb;
}
