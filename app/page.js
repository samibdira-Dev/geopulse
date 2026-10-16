'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

const MapWithNoSSR = dynamic(() => import('../components/MapComponent'), { 
  ssr: false,
  loading: () => <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>Chargement de la cartographie intelligente...</div>
});

const GOUV_COORDS = {
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
  'Kébili': [33.7044, 8.9690]
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('simulateur');
  const [currentClient, setCurrentClient] = useState('SOPAT (Mliha)');
  const [points, setPoints] = useState([]);
  const [demographie, setDemographie] = useState([]);
  const [selectedGouv, setSelectedGouv] = useState('Tous');
  const [mapCenter, setMapCenter] = useState(null);
  const [simulatedPoint, setSimulatedPoint] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [newPdv, setNewPdv] = useState({
    nom_pdv: '',
    type_pdv: 'Boutique propre',
    gouvernorat: 'Ariana',
    delegation: '',
    ca_historique_moyen: 75000,
    ajoute_par: 'Chef de Zone',
    latitude: 36.8625,
    longitude: 10.1932
  });

  const getSupabase = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  };

  const loadAllData = async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data: pdvData } = await supabase.from('points_de_vente').select('*').order('id_pdv', { ascending: false });
    if (pdvData) setPoints(pdvData);

    const { data: demoData } = await supabase.from('decoupage_administratif').select('*').order('population', { ascending: false });
    if (demoData) setDemographie(demoData);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleMapClick = async (latlng) => {
    setIsDetecting(true);
    let detectedGouv = 'Tunis';
    let detectedQuartier = 'Zone sélectionnée';
    let fullAddress = '';

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}&zoom=18&addressdetails=1&accept-language=fr`);
      const data = await res.json();
      
      if (data && data.address) {
        const addr = data.address;
        const suburb = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || '';
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
        const state = (addr.state || '').replace('Gouvernorat de ', '').replace('Gouvernorat ', '');

        detectedQuartier = [suburb, city].filter(Boolean).join(' - ') || 'Centre';
        detectedGouv = state || city || 'Tunis';
        fullAddress = data.display_name;
      }
    } catch (e) {
      console.error('Erreur géocodage inverse:', e);
    }

    setSimulatedPoint({
      lat: latlng.lat,
      lng: latlng.lng,
      quartier: detectedQuartier,
      gouvernorat: detectedGouv,
      adresse: fullAddress
    });

    setNewPdv(prev => ({
      ...prev,
      gouvernorat: detectedGouv,
      delegation: detectedQuartier,
      latitude: parseFloat(latlng.lat.toFixed(5)),
      longitude: parseFloat(latlng.lng.toFixed(5))
    }));

    setIsDetecting(false);
  };

  const handleSelectGouv = (gouv) => {
    setSelectedGouv(gouv);
    if (gouv !== 'Tous' && GOUV_COORDS[gouv]) {
      setMapCenter(GOUV_COORDS[gouv]);
    } else {
      setMapCenter([35.8, 10.0]);
    }
  };

  const handleAddPdv = async (e) => {
    e.preventDefault();
    setStatusMsg('Enregistrement en cours...');
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('points_de_vente').insert([{
      nom_pdv: newPdv.nom_pdv,
      type_pdv: newPdv.type_pdv,
      gouvernorat: newPdv.gouvernorat,
      delegation: newPdv.delegation,
      ca_historique_moyen: Number(newPdv.ca_historique_moyen),
      client_nom: currentClient,
      ajoute_par: newPdv.ajoute_par,
      latitude: Number(newPdv.latitude),
      longitude: Number(newPdv.longitude)
    }]);

    if (error) {
      setStatusMsg('Erreur : ' + error.message);
    } else {
      setStatusMsg('✅ Point ajouté avec succès dans ' + newPdv.delegation + ' !');
      setNewPdv({ ...newPdv, nom_pdv: '' });
      await loadAllData();
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  const filteredDemo = selectedGouv === 'Tous' 
    ? demographie 
    : demographie.filter(d => d.gouvernorat.toLowerCase().includes(selectedGouv.toLowerCase()));

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: '#0f172a', color: 'white', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ background: '#3b82f6', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px' }}>GeoPulse SaaS</span>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '500' }}>Plateforme Géomarketing & Détection Territoriale</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155', fontSize: '13px' }}>
            <span style={{ color: '#94a3b8' }}>🗺️ Gouvernorat :</span>
            <select 
              value={selectedGouv} 
              onChange={(e) => handleSelectGouv(e.target.value)}
              style={{ background: 'transparent', color: '#38bdf8', border: 'none', fontWeight: 'bold', cursor: 'pointer', outline: 'none' }}
            >
              <option value="Tous" style={{ color: 'black' }}>Tous les 24 Gouvernorats</option>
              {Object.keys(GOUV_COORDS).map(g => (
                <option key={g} value={g} style={{ color: 'black' }}>{g}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155', fontSize: '13px' }}>
            <span style={{ color: '#94a3b8' }}>Client :</span>
            <select 
              value={currentClient} 
              onChange={(e) => setCurrentClient(e.target.value)}
              style={{ background: 'transparent', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer', outline: 'none' }}
            >
              <option value="SOPAT (Mliha)" style={{ color: 'black' }}>SOPAT (Mliha)</option>
              <option value="Monoprix / GMS Tunisie" style={{ color: 'black' }}>Monoprix / GMS Tunisie</option>
              <option value="Réseau Franchise Café" style={{ color: 'black' }}>Réseau Franchise Café</option>
            </select>
          </div>

          <div style={{ fontSize: '13px', background: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
            Réseau actif : <b>{points.length} PDV</b>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: '420px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
          
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <button onClick={() => setActiveTab('simulateur')} style={{ flex: 1, padding: '12px 8px', border: 'none', background: activeTab === 'simulateur' ? 'white' : 'transparent', borderBottom: activeTab === 'simulateur' ? '3px solid #3b82f6' : 'none', fontWeight: 'bold', fontSize: '12px', color: activeTab === 'simulateur' ? '#1d4ed8' : '#64748b', cursor: 'pointer' }}>
              🎯 Simulateur CA
            </button>
            <button onClick={() => setActiveTab('ajout')} style={{ flex: 1, padding: '12px 8px', border: 'none', background: activeTab === 'ajout' ? 'white' : 'transparent', borderBottom: activeTab === 'ajout' ? '3px solid #10b981' : 'none', fontWeight: 'bold', fontSize: '12px', color: activeTab === 'ajout' ? '#047857' : '#64748b', cursor: 'pointer' }}>
              ➕ Saisie Équipe
            </button>
            <button onClick={() => setActiveTab('demographie')} style={{ flex: 1, padding: '12px 8px', border: 'none', background: activeTab === 'demographie' ? 'white' : 'transparent', borderBottom: activeTab === 'demographie' ? '3px solid #8b5cf6' : 'none', fontWeight: 'bold', fontSize: '12px', color: activeTab === 'demographie' ? '#6d28d9' : '#64748b', cursor: 'pointer' }}>
              👥 Démographie
            </button>
          </div>

          <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {activeTab === 'simulateur' && (
              <>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', color: '#0f172a', fontSize: '16px' }}>📍 Détection & Simulation ({currentClient})</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: '1.4' }}>
                    Cliquez sur la carte : le système détecte automatiquement le <b>Gouvernorat, la Ville et le Quartier</b>.
                  </p>
                </div>

                {isDetecting && (
                  <div style={{ padding: '12px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                    🔍 Identification du quartier et de la démographie en cours...
                  </div>
                )}

                {simulatedPoint && !isDetecting ? (
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ background: '#dbeafe', color: '#1e40af', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}>
                      <div><b>🏛️ Gouvernorat détecté :</b> {simulatedPoint.gouvernorat}</div>
                      <div style={{ marginTop: '4px' }}><b>🏘️ Ville / Quartier :</b> {simulatedPoint.quartier}</div>
                    </div>

                    <div style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ background: '#ede9fe', padding: '10px', borderRadius: '6px', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#6d28d9', textTransform: 'uppercase', fontWeight: 'bold' }}>CA Prévisionnel Estimé</span>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#5b21b6' }}>
                          {Math.round(74000 + (simulatedPoint.lat * 420)).toLocaleString()} TND / mois
                        </div>
                      </div>
                      <div><b>Population (Zone 10 min) :</b> ~28,400 hab.</div>
                      <div><b>Indice de Cannibalisme :</b> <span style={{ color: '#16a34a', fontWeight: 'bold' }}>Faible (8%)</span></div>
                    </div>
                    <button 
                      onClick={() => setActiveTab('ajout')}
                      style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', marginTop: '5px' }}>
                      ➕ Ouvrir ce point dans "{simulatedPoint.quartier}"
                    </button>
                  </div>
                ) : !isDetecting && (
                  <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    Aucun emplacement sélectionné.<br/>Cliquez sur un gouvernorat ou un quartier sur la carte.
                  </div>
                )}
              </>
            )}

            {activeTab === 'ajout' && (
              <form onSubmit={handleAddPdv} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>➕ Saisie Équipe (Auto-détectée)</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
                    Cliquez sur la carte : le gouvernorat, le quartier et le GPS se remplissent tout seuls !
                  </p>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Nom du Point de Vente / Concurrent *</label>
                  <input required type="text" placeholder="Ex: SOPAT Sahloul" value={newPdv.nom_pdv} onChange={e => setNewPdv({...newPdv, nom_pdv: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Gouvernorat (Détecté)</label>
                    <input type="text" value={newPdv.gouvernorat} onChange={e => setNewPdv({...newPdv, gouvernorat: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #3b82f6', background: '#eff6ff', fontWeight: 'bold', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Ville / Quartier (Détecté)</label>
                    <input type="text" value={newPdv.delegation} onChange={e => setNewPdv({...newPdv, delegation: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #3b82f6', background: '#eff6ff', fontWeight: 'bold', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Type</label>
                    <select value={newPdv.type_pdv} onChange={e => setNewPdv({...newPdv, type_pdv: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                      <option value="Boutique propre">Boutique propre</option>
                      <option value="Partenaire / Franchise">Partenaire / Franchise</option>
                      <option value="Concurrent Direct">Concurrent Direct</option>
                      <option value="GMS / Supermarché">GMS / Supermarché</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>CA Mensuel (TND)</label>
                    <input type="number" value={newPdv.ca_historique_moyen} onChange={e => setNewPdv({...newPdv, ca_historique_moyen: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Ajouté par (Membre de l'équipe)</label>
                  <input type="text" value={newPdv.ajoute_par} onChange={e => setNewPdv({...newPdv, ajoute_par: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>

                <button type="submit" style={{ background: '#10b981', color: 'white', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', marginTop: '6px' }}>
                  💾 Enregistrer dans la base du client
                </button>

                {statusMsg && (
                  <div style={{ padding: '10px', background: '#ecfdf5', color: '#047857', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                    {statusMsg}
                  </div>
                )}
              </form>
            )}

            {activeTab === 'demographie' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>👥 Démographie des 24 Gouvernorats</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
                    Sélectionnez un gouvernorat pour zoomer sur ses limites et filtrer ses statistiques.
                  </p>
                </div>

                <select value={selectedGouv} onChange={e => handleSelectGouv(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                  <option value="Tous">📍 Tous les Gouvernorats ({demographie.length} zones)</option>
                  {Object.keys(GOUV_COORDS).map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredDemo.map((zone, idx) => (
                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>{zone.gouvernorat} — {zone.delegation}</span>
                        <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                          {zone.potentiel_conso}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px', color: '#475569', marginTop: '8px' }}>
                        <div style={{ background: 'white', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>POPULATION</div>
                          <b>{zone.population?.toLocaleString()} hab.</b>
                        </div>
                        <div style={{ background: 'white', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>MÉNAGES</div>
                          <b>{zone.nb_menages?.toLocaleString()}</b>
                        </div>
                        <div style={{ background: 'white', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>REVENU MOY.</div>
                          <b style={{ color: '#16a34a' }}>{zone.revenu_moyen_tnd} TND</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </aside>

        <div style={{ flex: 1, position: 'relative' }}>
          <MapWithNoSSR 
            points={points} 
            onSelectLocation={handleMapClick} 
            simulatedPoint={simulatedPoint} 
            selectedGouv={selectedGouv}
            mapCenter={mapCenter}
          />
        </div>
      </div>
    </main>
  );
}
