'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { isManagerRole, ROLES, traduireErreur } from '../../lib/points';
import { adresseAt, dansTunisie, gouvernoratAt } from '../../lib/geo';
import LoginScreen from '../../components/LoginScreen';
import SocieteSetup from '../../components/SocieteSetup';
import PointForm from '../../components/PointForm';
import PointsList from '../../components/PointsList';
import ValidationPanel from '../../components/ValidationPanel';
import TeamPanel from '../../components/TeamPanel';
import TypesAdmin from '../../components/TypesAdmin';
import VentesImport from '../../components/VentesImport';
import SimulationPanel from '../../components/SimulationPanel';
import DemographiePanel from '../../components/DemographiePanel';
import { surfacesGouvernorats } from '../../lib/simulation';
import { GOUV_COORDS } from '../../lib/gouvernorats';
import { Message, ghostBtn } from '../../components/ui';

const ProMap = dynamic(() => import('../../components/ProMap'), {
  ssr: false,
  loading: () => <div style={{ padding: '20px', color: '#64748b' }}>Chargement de la carte…</div>,
});

export default function ProPage() {
  const [session, setSession] = useState(undefined); // undefined = en cours de lecture
  const [memberships, setMemberships] = useState([]);
  const [choix, setChoix] = useState(null); // société choisie par l'utilisateur
  const [membership, setMembership] = useState(undefined); // undefined = chargement, null = aucune société
  const [societe, setSociete] = useState(null);
  const [types, setTypes] = useState([]);
  const [champs, setChamps] = useState([]);
  const [points, setPoints] = useState([]);
  const [membres, setMembres] = useState([]);
  const [tab, setTab] = useState('nouveau');
  const [position, setPosition] = useState(null);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState(null);
  const [geo, setGeo] = useState(null);
  const [ventes, setVentes] = useState({}); // id du point -> synthèse des ventes (ventes_resume)
  const [filtreType, setFiltreType] = useState('tous');
  const [info, setInfo] = useState(null);
  const [demographie, setDemographie] = useState([]);
  const [rayonKm, setRayonKm] = useState(1);
  const [gouvDemo, setGouvDemo] = useState('Tous');
  const requete = useRef(0);

  const userId = session ? session.user.id : null;
  const role = membership ? membership.role : 'commercial';
  const manager = isManagerRole(role);

  // Session de connexion
  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return undefined; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Limites des gouvernorats (détection locale du gouvernorat d'un point)
  useEffect(() => {
    fetch('/tn-gouvernorats.geojson').then((r) => r.json()).then(setGeo).catch(() => {});
  }, []);
  const surfaces = useMemo(() => surfacesGouvernorats(geo), [geo]);

  // Données démographiques INS (communes à toutes les sociétés)
  useEffect(() => {
    if (!session) return;
    supabase.from('decoupage_administratif').select('*').then(({ data }) => setDemographie(data || []));
  }, [session]);

  const choisirGouvDemo = (g) => {
    setGouvDemo(g);
    setView(g !== 'Tous' && GOUV_COORDS[g] ? { center: GOUV_COORDS[g], zoom: 10 } : { reset: true });
  };

  // Société de l'utilisateur
  const chargerMembership = useCallback(async () => {
    if (!userId) { setMembership(null); return; }
    const { data, error } = await supabase
      .from('membres')
      .select('societe_id, role, nom_affiche, societes(id, nom, secteur)')
      .eq('user_id', userId);
    if (error) { setInfo({ type: 'err', text: traduireErreur(error) }); setMembership(null); return; }
    if (!data || !data.length) { setMemberships([]); setMembership(null); setSociete(null); return; }
    let saved = null;
    try { saved = window.localStorage.getItem('geopulse_societe'); } catch (e) { /* stockage indisponible */ }
    setMemberships(data);
    setChoix((cur) => cur || saved);
  }, [userId]);

  // Société active : celle choisie, sinon la première.
  useEffect(() => {
    if (!memberships.length) return;
    const m = memberships.find((x) => x.societe_id === choix) || memberships[0];
    setMembership(m);
    setSociete(m.societes);
  }, [memberships, choix]);

  const changerSociete = (id) => {
    setChoix(id);
    setPoints([]); setTypes([]); setChamps([]); setMembres([]);
    setPosition(null); setEditing(null); setFiltreType('tous'); setTab('nouveau');
    try { window.localStorage.setItem('geopulse_societe', id); } catch (e) { /* ignoré */ }
  };

  useEffect(() => {
    if (session === undefined) return;
    setMembership(undefined);
    chargerMembership();
  }, [session, chargerMembership]);

  // Données de la société
  const charger = useCallback(async () => {
    if (!membership) return;
    const sid = membership.societe_id;
    const num = ++requete.current;
    const [t, c, p, m] = await Promise.all([
      supabase.from('types_point').select('*').eq('societe_id', sid).order('ordre'),
      supabase.from('champs_type').select('*').eq('societe_id', sid).order('ordre'),
      supabase.from('points').select('*').eq('societe_id', sid).order('cree_le', { ascending: false }).limit(5000),
      supabase.from('membres').select('user_id, role, nom_affiche').eq('societe_id', sid),
    ]);
    if (num !== requete.current) return;
    const err = t.error || c.error || p.error || m.error;
    if (err) { setInfo({ type: 'err', text: traduireErreur(err) }); return; }
    setTypes(t.data || []);
    setChamps(c.data || []);
    setPoints(p.data || []);
    setMembres(m.data || []);
    // Synthèse des ventes : absente tant que le script ventes.sql n'a pas été lancé (on l'ignore alors).
    const v = await supabase.rpc('ventes_resume', { p_societe: sid });
    if (num !== requete.current) return;
    setVentes(Object.fromEntries((v.data || []).map((r) => [r.point_id, r])));
  }, [membership]);

  useEffect(() => { charger(); }, [charger]);

  const typesActifs = useMemo(() => types.filter((t) => t.actif), [types]);
  const typesById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  const champsByType = useMemo(() => {
    const out = {};
    champs.forEach((c) => { (out[c.type_id] = out[c.type_id] || []).push(c); });
    return out;
  }, [champs]);
  const auteurs = useMemo(
    () => Object.fromEntries(membres.map((m) => [m.user_id, m.nom_affiche || 'Membre ' + m.user_id.slice(0, 6)])),
    [membres]
  );
  const pointsVisibles = useMemo(
    () => (filtreType === 'tous' ? points : points.filter((p) => p.type_id === filtreType)),
    [points, filtreType]
  );
  const aValiderCount = points.filter((p) => p.statut === 'a_valider').length;

  // Nouvelle position (clic, glissement, GPS) : gouvernorat local puis quartier via Nominatim.
  const poser = useCallback(async (lat, lng, source = 'pin_manuel', precision = null) => {
    if (!dansTunisie(lat, lng)) {
      setInfo({ type: 'err', text: 'Cette position est en dehors de la Tunisie.' });
      return;
    }
    setInfo(null);
    const base = { lat, lng, gouvernorat: gouvernoratAt(geo, lat, lng), quartier: '', adresse: '', source, precision };
    setPosition(base);
    setTab((t) => (t === 'nouveau' || t === 'simuler' ? t : 'nouveau'));
    const a = await adresseAt(lat, lng);
    setPosition((cur) => (cur && cur.lat === lat && cur.lng === lng ? { ...cur, quartier: a.quartier, adresse: a.adresse } : cur));
  }, [geo]);

  const surClic = (latlng) => poser(latlng.lat, latlng.lng, 'pin_manuel');

  const utiliserGps = () => {
    if (!navigator.geolocation) { setInfo({ type: 'err', text: 'La géolocalisation n’est pas disponible sur cet appareil.' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        poser(latitude, longitude, 'gps', Math.round(accuracy));
        setView({ center: [latitude, longitude], zoom: 16 });
      },
      () => setInfo({ type: 'err', text: 'Position refusée ou indisponible. Cliquez sur la carte à la place.' }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const modifier = (p) => {
    setEditing(p);
    setPosition({ lat: p.latitude, lng: p.longitude, gouvernorat: p.gouvernorat || '', quartier: p.delegation || '', adresse: p.adresse || '', source: p.source_position, precision: p.precision_m });
    setTab('nouveau');
    setView({ center: [p.latitude, p.longitude], zoom: 15 });
  };

  const focaliser = (p) => setView({ center: [p.latitude, p.longitude], zoom: 16 });

  const supprimer = async (p) => {
    if (!window.confirm(`Supprimer « ${p.nom} » ?`)) return;
    const { data, error } = await supabase.from('points').delete().eq('id', p.id).select('id');
    if (error) setInfo({ type: 'err', text: traduireErreur(error) });
    else if (!data || !data.length) setInfo({ type: 'err', text: 'Suppression refusée.' });
    charger();
  };

  const apresEnregistrement = (statut) => {
    setPosition(null);
    setEditing(null);
    setInfo({ type: 'ok', text: statut === 'valide' ? 'Point enregistré et validé.' : statut === 'a_valider' ? 'Point envoyé pour validation.' : 'Brouillon enregistré.' });
    charger();
  };

  const deconnexion = async () => {
    await supabase.auth.signOut();
    setMembership(undefined); setMemberships([]); setSociete(null); setPoints([]); setTypes([]); setChamps([]); setMembres([]);
  };

  // --- États d'écran ---
  if (!supabaseConfigured) {
    return <main style={{ padding: '24px', fontFamily: 'system-ui' }}><Message>Supabase n’est pas configuré (variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY).</Message></main>;
  }
  if (session === undefined) return <main style={{ padding: '24px', fontFamily: 'system-ui', color: '#64748b' }}>Chargement…</main>;
  if (!session) return <LoginScreen />;
  if (membership === undefined) return <main style={{ padding: '24px', fontFamily: 'system-ui', color: '#64748b' }}>Chargement de votre société…</main>;
  if (!membership) {
    return <SocieteSetup email={session.user.email} onCreated={chargerMembership} onSignOut={deconnexion} />;
  }

  const onglets = [
    ['nouveau', editing ? '✏️ Modifier' : '➕ Nouveau'],
    ['simuler', '🎯 Simuler'],
    ['points', '📋 Points'],
    ['demographie', '👥 Démographie'],
    ...(manager ? [['valider', `✅ À valider${aValiderCount ? ` (${aValiderCount})` : ''}`], ['ventes', '📈 Ventes']] : []),
    ...(role === 'admin' ? [['types', '🏷️ Types'], ['equipe', '🧑‍🤝‍🧑 Équipe']] : []),
  ];

  return (
    <div className="pro-layout" style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
      <style>{`@media (max-width: 800px){.pro-layout{flex-direction:column-reverse}.pro-side{width:100%!important;height:55vh!important}.pro-map{height:45vh!important;flex:none!important}}`}</style>

      <aside className="pro-side" style={{ width: '400px', flex: 'none', height: '100%', display: 'flex', flexDirection: 'column', background: 'white', borderRight: '1px solid #e2e8f0' }}>
        <header style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ minWidth: 0 }}>
            {memberships.length > 1 ? (
              <select value={membership.societe_id} onChange={(e) => changerSociete(e.target.value)} style={{ fontWeight: 'bold', fontSize: '14px', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', maxWidth: '220px' }}>
                {memberships.map((m) => <option key={m.societe_id} value={m.societe_id}>{m.societes ? m.societes.nom : m.societe_id}</option>)}
              </select>
            ) : (
              <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{societe ? societe.nom : 'Société'}</div>
            )}
            <div style={{ fontSize: '11px', color: '#64748b' }}>{ROLES[role]} · {session.user.email}</div>
          </div>
          <button type="button" onClick={deconnexion} style={ghostBtn}>Quitter</button>
        </header>

        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>
          {onglets.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ ...ghostBtn, background: tab === k ? '#dbeafe' : 'white', borderColor: tab === k ? '#2563eb' : '#cbd5e1', color: tab === k ? '#1d4ed8' : '#334155' }}>{label}</button>
          ))}
        </nav>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {info && <Message type={info.type}>{info.text}</Message>}

          {tab === 'nouveau' && (typesActifs.length === 0 ? (
            <Message>Aucun type de point actif. {role === 'admin' ? 'Créez-en un dans l’onglet « Types ».' : 'Demandez à votre administrateur d’en créer un.'}</Message>
          ) : (
            <PointForm
              types={typesActifs}
              champs={champs}
              position={position}
              editing={editing}
              role={role}
              societeId={membership.societe_id}
              onUseGps={utiliserGps}
              onSaved={apresEnregistrement}
              onCancelEdit={() => { setEditing(null); setPosition(null); }}
            />
          ))}

          {tab === 'simuler' && (
            <SimulationPanel
              position={position}
              rayonKm={rayonKm}
              onRayon={setRayonKm}
              points={points}
              typesById={typesById}
              champs={champs}
              demographie={demographie}
              surfaces={surfaces}
              ventes={ventes}
              onAjouter={() => { setEditing(null); setTab('nouveau'); }}
            />
          )}

          {tab === 'demographie' && (
            <DemographiePanel demographie={demographie} gouvernorat={gouvDemo} onGouvernorat={choisirGouvDemo} />
          )}

          {tab === 'points' && (
            <PointsList points={points} typesById={typesById} auteurs={auteurs} userId={userId} role={role} onFocus={focaliser} onEdit={modifier} onDelete={supprimer} />
          )}

          {tab === 'valider' && manager && (
            <ValidationPanel points={points} typesById={typesById} champsByType={champsByType} auteurs={auteurs} onFocus={focaliser} onChanged={charger} />
          )}

          {tab === 'ventes' && manager && (
            <VentesImport societeId={membership.societe_id} points={points} onChanged={charger} />
          )}

          {tab === 'types' && role === 'admin' && (
            <TypesAdmin societeId={membership.societe_id} types={types} champs={champs} onChanged={charger} />
          )}

          {tab === 'equipe' && role === 'admin' && (
            <TeamPanel societeId={membership.societe_id} membres={membres} userId={userId} onChanged={() => { charger(); chargerMembership(); }} />
          )}
        </div>
      </aside>

      <section className="pro-map" style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <div style={{ position: 'absolute', top: '10px', left: '50px', zIndex: 1000, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '12px', fontWeight: 'bold' }}>
            <option value="tous">Tous les types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
          <button type="button" onClick={() => setView({ reset: true })} style={ghostBtn}>🇹🇳 Vue Tunisie</button>
        </div>
        <ProMap
          points={pointsVisibles}
          typesById={typesById}
          champsByType={champsByType}
          auteurs={auteurs}
          currentUserId={userId}
          role={role}
          onEditPoint={modifier}
          onSelectLocation={surClic}
          simulatedPoint={position}
          onDragSimulated={(ll) => poser(ll.lat, ll.lng, 'pin_manuel')}
          view={view}
          ventes={ventes}
          selectedGouv={tab === 'demographie' ? gouvDemo : null}
          zoneKm={tab === 'simuler' && position ? rayonKm : null}
        />
      </section>
    </div>
  );
}
