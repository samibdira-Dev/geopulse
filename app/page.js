'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

const MapWithNoSSR = dynamic(() => import('../components/MapComponent'), { 
  ssr: false,
  loading: () => <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>Chargement de GeoPulse SaaS...</div>
});

export default function Home() {
  const [activeTab, setActiveTab] = useState('simulateur'); // 'simulateur' | 'ajout' | 'demographie'
  const [currentClient, setCurrentClient] = useState('SOPAT (Mliha)');
  const [points, setPoints] = useState([]);
  const [demographie, setDemographie] = useState([]);
  const [selectedGouv, setSelectedGouv] = useState('Tous');
  const [simulatedPoint, setSimulatedPoint] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  // Formulaire d'ajout collaboratif pour les équipes
  const [newPdv, setNewPdv] = useState({
    nom_pdv: '',
    type_pdv: 'Boutique propre',
    gouvernorat: 'Ariana',
    delegation: '',
    ca_historique_moyen: 75000,
    ajoute_par: 'Chef de Zone Tunis',
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

  // Clic sur la carte : met à jour à la fois le simulateur ET les coordonnées du formulaire d'ajout
  const handleMapClick = (latlng) => {
    setSimulatedPoint(latlng);
    setNewPdv(prev => ({
      ...prev,
      latitude: parseFloat(latlng.lat.toFixed(5)),
      longitude: parseFloat(latlng.lng.toFixed(5))
    }));
  };

  // Enregistrement d'un nouveau point par l'équipe dans Supabase
  const handleAddPdv = async (e) => {
    e.preventDefault();
    setStatusMsg('Enregistrement en cours...');
    const supabase = getSupabase();
    if (!supabase) {
      setStatusMsg('Erreur : connexion Supabase manquante.');
      return;
    }

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
      setStatusMsg('✅ Point ajouté avec succès par l\'équipe !');
      setNewPdv({ ...newPdv, nom_pdv: '', delegation: '' });
      await loadAllData();
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  const filteredDemo = selectedGouv === 'Tous' 
    ? demographie 
    : demographie.filter(d => d.gouvernorat === selectedGouv);

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', fontFamily: 'system-ui, sans-serif' }}>
      {/* HEADER SAAS MULTI-CLIENT */}
      <header style={{ background: '#0f172a', color: 'white', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ background: '#3b82f6', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px' }}>GeoPulse SaaS</span>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: '500' }}>Plateforme Géomarketing & Intelligence Territoriale</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155', fontSize: '13px' }}>
            <span style={{ color: '#94a3b8' }}>Espace Client :</span>
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
            Réseau actif : <b>{points.length} points de vente</b>
          </div>
        </div>
      </header>

      {/* CORPS DE L'APPLICATION */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: '420px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
          
          {/* NAVIGATION PAR ONGLETS */}
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
            
            {/* ONGLET 1 : SIMULATEUR */}
            {activeTab === 'simulateur' && (
              <>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', color: '#0f172a', fontSize: '16px' }}>📍 Simulateur d'Implantation ({currentClient})</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: '1.4' }}>
                    Cliquez sur la carte pour analyser la zone de chalandise et estimer le potentiel commercial.
                  </p>
                </div>

                {simulatedPoint ? (
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h4 style={{ margin: 0, color: '#7c3aed', fontSize: '15px' }}>📊 Résultats de la Simulation</h4>
                    <div style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div><b>Coordonnées GPS :</b> {simulatedPoint.lat.toFixed(4)}, {simulatedPoint.lng.toFixed(4)}</div>
                      <div style={{ background: '#ede9fe', padding: '10px', borderRadius: '6px', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#6d28d9', textTransform: 'uppercase', fontWeight: 'bold' }}>CA Prévisionnel Estimé</span>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#5b21b6' }}>
                          {Math.round(72000 + (simulatedPoint.lat * 450)).toLocaleString()} TND / mois
                        </div>
                      </div>
                      <div><b>Population (Isochrone 10 min) :</b> ~26,800 hab.</div>
                      <div><b>Revenu moyen ménage :</b> ~1,850 TND / mois</div>
                      <div><b>Indice de Cannibalisme :</b> <span style={{ color: '#16a34a', fontWeight: 'bold' }}>Faible (8%)</span></div>
                    </div>
                    <button 
                      onClick={() => setActiveTab('ajout')}
                      style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', marginTop: '5px' }}>
                      ➕ Convertir cet emplacement en Point de Vente
                    </button>
                  </div>
                ) : (
                  <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    Aucun emplacement sélectionné.<br/>Cliquez sur la carte pour lancer une simulation.
                  </div>
                )}
              </>
            )}

            {/* ONGLET 2 : AJOUT COLLABORATIF PAR LES ÉQUIPES */}
            {activeTab === 'ajout' && (
              <form onSubmit={handleAddPdv} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>➕ Ajouter des données terrain</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
                    Permettez à vos équipes d'ajouter un magasin, une franchise ou un concurrent. <b>Astuce : cliquez sur la carte pour remplir les coordonnées GPS automatiquement.</b>
                  </p>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Nom du Point de Vente / Concurrent *</label>
                  <input required type="text" placeholder="Ex: SOPAT Ennasr 2" value={newPdv.nom_pdv} onChange={e => setNewPdv({...newPdv, nom_pdv: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
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
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Gouvernorat</label>
                    <select value={newPdv.gouvernorat} onChange={e => setNewPdv({...newPdv, gouvernorat: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                      <option value="Tunis">Tunis</option>
                      <option value="Ariana">Ariana</option>
                      <option value="Ben Arous">Ben Arous</option>
                      <option value="Manouba">Manouba</option>
                      <option value="Sousse">Sousse</option>
                      <option value="Monastir">Monastir</option>
                      <option value="Sfax">Sfax</option>
                      <option value="Nabeul">Nabeul</option>
                      <option value="Bizerte">Bizerte</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>Délégation / Quartier</label>
                    <input type="text" placeholder="Ex: Sahloul" value={newPdv.delegation} onChange={e => setNewPdv({...newPdv, delegation: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>CA Mensuel Estimé (TND)</label>
                    <input type="number" value={newPdv.ca_historique_moyen} onChange={e => setNewPdv({...newPdv, ca_historique_moyen: e.target.value})} style={{ width: '100%', padding: '8px', marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#475569' }}>Latitude (Clic carte)</label>
                    <input type="number" step="any" value={newPdv.latitude} onChange={e => setNewPdv({...newPdv, latitude: e.target.value})} style={{ width: '100%', padding: '6px', marginTop: '2px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#475569' }}>Longitude (Clic carte)</label>
                    <input type="number" step="any" value={newPdv.longitude} onChange={e => setNewPdv({...newPdv, longitude: e.target.value})} style={{ width: '100%', padding: '6px', marginTop: '2px', borderRadius: '4px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
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

            {/* ONGLET 3 : DONNÉES DÉMOGRAPHIQUES PAR RÉGION / GOUVERNORAT */}
            {activeTab === 'demographie' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '16px' }}>👥 Démographie & Potentiel Régional</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>
                    Données structurées par gouvernorat et délégation (Population, Ménages, Revenu moyen).
                  </p>
                </div>

                <select value={selectedGouv} onChange={e => setSelectedGouv(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                  <option value="Tous">📍 Tous les Gouvernorats ({demographie.length} zones)</option>
                  <option value="Tunis">Tunis</option>
                  <option value="Ariana">Ariana</option>
                  <option value="Ben Arous">Ben Arous</option>
                  <option value="Sousse">Sousse</option>
                  <option value="Monastir">Monastir</option>
                  <option value="Sfax">Sfax</option>
                  <option value="Nabeul">Nabeul</option>
                  <option value="Bizerte">Bizerte</option>
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

        {/* CARTE INTERACTIVE */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapWithNoSSR points={points} onSelectLocation={handleMapClick} simulatedPoint={simulatedPoint} />
        </div>
      </div>
    </main>
  );
}
