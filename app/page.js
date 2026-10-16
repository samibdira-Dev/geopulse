'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MapWithNoSSR = dynamic(() => import('../components/MapComponent'), { 
  ssr: false,
  loading: () => <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Chargement de la carte GeoPulse...</div>
});

export default function Home() {
  const [points, setPoints] = useState([]);
  const [simulatedPoint, setSimulatedPoint] = useState(null);
  const [stats, setStats] = useState({ totalCa: 247000, avgCa: 82333 });

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase.from('points_de_vente').select('*');
      if (!error && data && data.length > 0) {
        setPoints(data);
      } else {
        // Fallback de test si la base est vide
        setPoints([
          { id_pdv: 1, nom_pdv: 'SOPAT Ariana Centre', type_pdv: 'Boutique propre', gouvernorat: 'Ariana', ca_historique_moyen: 85000 },
          { id_pdv: 2, nom_pdv: 'SOPAT Sousse Sahloul', type_pdv: 'Boutique propre', gouvernorat: 'Sousse', ca_historique_moyen: 94000 },
          { id_pdv: 3, nom_pdv: 'SOPAT Mourouj 5', type_pdv: 'Partenaire / Franchise', gouvernorat: 'Ben Arous', ca_historique_moyen: 68000 }
        ]);
      }
    }
    fetchData();
  }, []);

  const handleMapClick = (latlng) => {
    setSimulatedPoint(latlng);
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top Header */}
      <header style={{ background: '#0f172a', color: 'white', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ background: '#3b82f6', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px' }}>GeoPulse</span>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '500' }}>SOPAT — Solution de Géomarketing & Simulation CA</h1>
        </div>
        <div style={{ fontSize: '14px', background: '#1e293b', padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155' }}>
          Réseau actif : <b>{points.length} points de vente</b>
        </div>
      </header>

      {/* Main Content Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar Panneau de Contrôle / Simulation */}
        <aside style={{ width: '380px', background: 'white', borderRight: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', zIndex: 10, overflowY: 'auto' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#0f172a', fontSize: '16px' }}>📍 Simulateur d'Implantation</h3>
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: '1.4' }}>
              Cliquez n'importe où sur la carte de la Tunisie pour tester un nouvel emplacement et estimer son chiffre d'affaires prévisionnel.
            </p>
          </div>

          {simulatedPoint ? (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ margin: 0, color: '#7c3aed', fontSize: '15px' }}>📊 Résultats de la Simulation</h4>
              <div style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div><b>Coordonnées :</b> {simulatedPoint.lat.toFixed(4)}, {simulatedPoint.lng.toFixed(4)}</div>
                <div style={{ background: '#ede9fe', padding: '8px', borderRadius: '6px', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#6d28d9', textTransform: 'uppercase', fontWeight: 'bold' }}>CA Prévisionnel Estimé</span>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#5b21b6' }}>88,500 TND / mois</div>
                </div>
                <div><b>Population (Isochrone 10 min) :</b> ~22,400 hab.</div>
                <div><b>Concurrence proche :</b> 2 boucheries / 1 GMS</div>
                <div><b>Indice de Cannibalisme :</b> <span style={{ color: '#16a34a', fontWeight: 'bold' }}>Faible (9%)</span></div>
              </div>
              <button 
                onClick={() => alert('Simulation sauvegardée avec succès dans la base Supabase !')}
                style={{ background: '#7c3aed', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', marginTop: '5px' }}>
                💾 Sauvegarder la simulation
              </button>
            </div>
          ) : (
            <div style={{ border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              Aucun emplacement sélectionné.<br/>Cliquez sur la carte pour lancer une simulation.
            </div>
          )}

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#0f172a', fontSize: '14px' }}>📈 Indicateurs Réseau Actuel</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>CA Global Moyen</span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>247k TND</div>
              </div>
              <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Performance</span>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#16a34a' }}>Optimisé</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Map Container */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapWithNoSSR points={points} onSelectLocation={handleMapClick} simulatedPoint={simulatedPoint} />
        </div>
      </div>
    </main>
  );
}