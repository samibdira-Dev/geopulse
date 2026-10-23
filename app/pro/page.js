'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { chargerTout, isManagerRole, ROLES, traduireErreur } from '../../lib/points';
import { adresseAt, dansTunisie, gouvernoratAt } from '../../lib/geo';
import LoginScreen from '../../components/LoginScreen';
import SocieteSetup, { SocieteEnAttente } from '../../components/SocieteSetup';
import PointForm from '../../components/PointForm';
import PointsList from '../../components/PointsList';
import ValidationPanel from '../../components/ValidationPanel';
import JournalPanel from '../../components/JournalPanel';
import TeamPanel from '../../components/TeamPanel';
import TypesAdmin from '../../components/TypesAdmin';
import VentesImport from '../../components/VentesImport';
import SimulationPanel from '../../components/SimulationPanel';
import DemographiePanel from '../../components/DemographiePanel';
import { surfacesGouvernorats } from '../../lib/simulation';
import { chargerDelegations, fusionnerDemographie } from '../../lib/recensement';
import { CLASSES_PAR_DEFAUT, COULEURS_GENERATEURS, chargerGenerateurs } from '../../lib/generateurs';
import { GOUV_COORDS } from '../../lib/gouvernorats';
import { C, Message, surtitre } from '../../components/ui';
import Icon, { Logo } from '../../components/icons';

const ProMap = dynamic(() => import('../../components/ProMap'), {
  ssr: false,
  loading: () => <div style={{ padding: '20px', color: '#64748b', fontSize: '13px' }}>Chargement de la carte…</div>,
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
  const [filtreTypes, setFiltreTypes] = useState([]); // types affichés sur la carte ; vide = tous
  const [isochrone, setIsochrone] = useState(null); // zones à 5, 10, 15 min autour de l'emplacement simulé (image)
  const [classesGen, setClassesGen] = useState([]); // classes de générateurs de trafic affichées ; vide = couche masquée
  const [generateurs, setGenerateurs] = useState(null);
  // Générateurs de trafic : chargés une fois la société ouverte (indice de passage des points, couche de la carte).
  useEffect(() => {
    if (membership && !generateurs) chargerGenerateurs().then(setGenerateurs).catch(() => {});
  }, [membership, generateurs]);
  const [info, setInfo] = useState(null);
  const [demographieTable, setDemographie] = useState([]);
  // Recensement 2024 par délégation (contours + chiffres), complété du revenu saisi dans la table.
  const [delegations, setDelegations] = useState(null);
  const demographie = useMemo(() => fusionnerDemographie(delegations, demographieTable), [delegations, demographieTable]);
  const [rayonKm, setRayonKm] = useState(1);
  const [gouvDemo, setGouvDemo] = useState('Tous');
  const [carteDemo, setCarteDemo] = useState('densite');
  const requete = useRef(0);
  // Téléphone : carte plein écran, onglets en bas, panneau fermé, à moitié ou en plein écran.
  const [mobile, setMobile] = useState(false);
  const [feuille, setFeuille] = useState('ferme');
  const [legendeOuverte, setLegendeOuverte] = useState(false);
  const debutGlisse = useRef(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 800px)');
    const maj = () => setMobile(mq.matches);
    maj();
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);
  const ouvrirFeuille = () => setFeuille((f) => (f === 'ferme' ? 'demi' : f));

  const userId = session ? session.user.id : null;
  const role = membership ? membership.role : 'commercial';
  const manager = isManagerRole(role);

  // Session de connexion
  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return undefined; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    // Supabase renvoie une session à chaque retour sur l'onglet et à chaque renouvellement du jeton : on garde
    // la même tant que l'utilisateur ne change pas, sinon toute l'application se recharge.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession((cur) => (
      cur && s && cur.user.id === s.user.id ? cur : s || null
    )));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Limites des gouvernorats (détection locale du gouvernorat d'un point)
  useEffect(() => {
    fetch('/tn-gouvernorats.geojson').then((r) => r.json()).then(setGeo).catch(() => {});
  }, []);
  const surfaces = useMemo(() => surfacesGouvernorats(geo), [geo]);

  // Données démographiques INS (communes à toutes les sociétés)
  useEffect(() => {
    if (!userId) return;
    supabase.from('decoupage_administratif').select('*').then(({ data }) => setDemographie(data || []));
    chargerDelegations().then(setDelegations).catch(() => {});
  }, [userId]);

  const choisirGouvDemo = (g) => {
    setGouvDemo(g);
    setView(g !== 'Tous' && GOUV_COORDS[g] ? { center: GOUV_COORDS[g], zoom: 10 } : { reset: true });
  };

  // Société de l'utilisateur
  const chargerMembership = useCallback(async () => {
    if (!userId) { setMembership(null); return; }
    const lire = (colonnes) => supabase.from('membres').select('societe_id, role, nom_affiche, societes(' + colonnes + ')').eq('user_id', userId);
    let { data, error } = await lire('id, nom, secteur, statut');
    // Base sans le script plateforme.sql : pas encore de statut, toutes les sociétés sont ouvertes.
    if (error && /statut/.test(error.message || '')) ({ data, error } = await lire('id, nom, secteur'));
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
    setMembership((cur) => (cur && cur.societe_id === m.societe_id && cur.role === m.role ? cur : m));
    setSociete(m.societes);
  }, [memberships, choix]);

  const changerSociete = (id) => {
    setChoix(id);
    setPoints([]); setTypes([]); setChamps([]); setMembres([]);
    setPosition(null); setEditing(null); setFiltreTypes([]); setTab('nouveau');
    try { window.localStorage.setItem('geopulse_societe', id); } catch (e) { /* ignoré */ }
  };

  // Administrateur de la plateforme GeoPulse : accès à la console.
  const [plateformeAdmin, setPlateformeAdmin] = useState(false);
  useEffect(() => {
    if (!userId) { setPlateformeAdmin(false); return; }
    supabase.rpc('est_plateforme_admin').then(({ data }) => setPlateformeAdmin(data === true));
  }, [userId]);

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
      chargerTout(() => supabase.from('points').select('*').eq('societe_id', sid).order('cree_le', { ascending: false }).order('id')),
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
    const v = await chargerTout(() => supabase.rpc('ventes_resume', { p_societe: sid }).order('point_id'));
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
    () => (filtreTypes.length ? points.filter((p) => filtreTypes.includes(p.type_id)) : points),
    [points, filtreTypes]
  );
  const aValiderCount = points.filter((p) => p.statut === 'a_valider').length;
  const compteParType = useMemo(() => {
    const out = {};
    points.forEach((p) => { out[p.type_id] = (out[p.type_id] || 0) + 1; });
    return out;
  }, [points]);
  // Chiffres clés affichés au-dessus de la carte
  const stats = useMemo(() => {
    const cat = (p) => (typesById[p.type_id] || {}).categorie;
    return {
      reseau: points.filter((p) => ['point_de_vente', 'client'].includes(cat(p))).length,
      concurrents: points.filter((p) => cat(p) === 'concurrent').length,
      ca12: Object.values(ventes).reduce((s, v) => s + (Number(v.ca_12m) || 0), 0),
    };
  }, [points, typesById, ventes]);

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
    ouvrirFeuille();
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

  const modifier = useCallback((p) => {
    setEditing(p);
    setPosition({ lat: p.latitude, lng: p.longitude, gouvernorat: p.gouvernorat || '', quartier: p.delegation || '', adresse: p.adresse || '', source: p.source_position, precision: p.precision_m });
    setTab('nouveau');
    ouvrirFeuille();
    setView({ center: [p.latitude, p.longitude], zoom: 15 });
  }, []);

  // Sur téléphone, on ferme le panneau pour montrer le point sur la carte.
  const focaliser = (p) => { setFeuille('ferme'); setView({ center: [p.latitude, p.longitude], zoom: 16 }); };

  // Onglet touché : l'onglet ouvert referme le panneau (téléphone), un autre l'ouvre.
  const choisirOnglet = (k) => {
    if (k === tab && feuille !== 'ferme') setFeuille('ferme');
    else { setTab(k); ouvrirFeuille(); }
  };
  // Poignée du panneau : glisser vers le haut l'agrandit, vers le bas le réduit ; un appui alterne.
  const ORDRE_FEUILLE = ['ferme', 'demi', 'plein'];
  const finGlisse = (e) => {
    if (debutGlisse.current == null) return;
    const d = e.clientY - debutGlisse.current;
    debutGlisse.current = null;
    const i = ORDRE_FEUILLE.indexOf(feuille);
    if (d < -30) setFeuille(ORDRE_FEUILLE[Math.min(2, i + 1)]);
    else if (d > 30) setFeuille(ORDRE_FEUILLE[Math.max(0, i - 1)]);
    else setFeuille(feuille === 'demi' ? 'plein' : 'demi');
  };

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
  // --- États d'écran ---
  if (!supabaseConfigured) {
    return <main style={{ padding: '24px' }}><Message>Supabase n’est pas configuré (variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY).</Message></main>;
  }
  if (session === undefined) return <Chargement texte="Chargement…" />;
  if (!session) return <LoginScreen />;
  if (membership === undefined) return <Chargement texte="Chargement de votre société…" />;
  if (!membership) {
    return <SocieteSetup email={session.user.email} onCreated={chargerMembership} onSignOut={deconnexion} />;
  }
  if (societe && societe.statut && societe.statut !== 'active') {
    return (
      <SocieteEnAttente societe={societe} email={session.user.email} memberships={memberships} onChoisir={changerSociete}
        onRecharger={chargerMembership} onSignOut={deconnexion} />
    );
  }

  const onglets = [
    ['nouveau', editing ? 'edit' : 'plus', editing ? 'Modifier' : 'Nouveau'],
    ['simuler', 'target', 'Simuler'],
    ['points', 'list', 'Points'],
    ['demographie', 'users', 'Démo\u00ADgraphie'],
    ...(manager ? [['valider', 'checkCircle', 'Valider', aValiderCount], ['ventes', 'chart', 'Import']] : []),
    ...(role === 'admin' ? [['types', 'tag', 'Types'], ['equipe', 'team', 'Équipe']] : []),
    ...(manager ? [['journal', 'history', 'Journal']] : []),
  ];
  const email = session.user.email || '';
  const initiales = ((membership.nom_affiche || email).match(/[A-Za-zÀ-ÿ]/g) || ['?']).slice(0, 2).join('').toUpperCase();

  return (
    <div className={'pro-layout feuille-' + feuille} style={{ display: 'flex', height: '100vh', background: C.bg }}>
      <aside className="pro-side" style={{ flex: 'none', height: '100%', display: 'flex', boxShadow: '1px 0 0 ' + C.line, zIndex: 2 }}>
        {/* Rail de navigation */}
        <div className="pro-rail" style={{ width: '84px', background: C.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 10px', gap: '18px', boxSizing: 'border-box' }}>
          <div className="gp-rail-logo"><Logo size={40} /></div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
            {onglets.map(([k, icone, label, badge]) => (
              <button key={k} type="button" onClick={() => choisirOnglet(k)} title={label.replace('\u00AD', '')}
                className={'gp-rail-item' + (tab === k ? ' actif' : '')}
                style={{ position: 'relative', border: 'none', background: undefined, borderRadius: '12px', padding: '9px 2px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', minWidth: '62px' }}>
                <Icon name={icone} size={20} />
                <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '.01em', lineHeight: 1.1, textAlign: 'center' }}>{label}</span>
                {badge ? (
                  <span style={{ position: 'absolute', top: '4px', right: '9px', minWidth: '17px', height: '17px', padding: '0 4px', boxSizing: 'border-box', borderRadius: '9px', background: '#f59e0b', color: C.ink, fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="gp-rail-bas" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div title={email} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg,#334155,#1e293b)', color: '#e2e8f0', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,.12)' }}>{initiales}</div>
            {plateformeAdmin && (
              <a href="/console" title="Console GeoPulse" className="gp-rail-item" style={{ borderRadius: '10px', padding: '8px', display: 'flex' }}>
                <Icon name="shield" size={18} />
              </a>
            )}
            <button type="button" onClick={deconnexion} title="Se déconnecter" className="gp-rail-item" style={{ border: 'none', background: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}>
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>

        {/* Panneau de l'onglet */}
        <div className="pro-panel" style={{ width: '400px', display: 'flex', flexDirection: 'column', background: 'white', minHeight: 0 }}>
          {/* Téléphone : poignée du panneau, avec le nom de l'onglet */}
          <div className="gp-poignee" onPointerDown={(e) => { debutGlisse.current = e.clientY; }} onPointerUp={finGlisse}
            style={{ flex: 'none', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '8px 16px 10px', cursor: 'grab', touchAction: 'none', borderBottom: '1px solid ' + C.line }}>
            <span style={{ width: '40px', height: '5px', borderRadius: '3px', background: '#d5d9e3' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: '14px', fontWeight: 700, color: C.text }}>
              <span>{(onglets.find(([k]) => k === tab) || [, , ''])[2].replace('\u00AD', '')}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: C.brand }}>
                {feuille === 'ferme' ? (tab === 'nouveau' || tab === 'simuler' ? 'Touchez la carte ou glissez ↑' : 'Glissez ↑') : feuille === 'demi' ? 'Agrandir ↑' : 'Réduire ↓'}
              </span>
            </div>
          </div>
          <header style={{ padding: '16px 20px', borderBottom: '1px solid ' + C.line, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: C.bg, border: '1px solid ' + C.line, color: C.text, fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              {(societe && societe.nom ? societe.nom : 'S').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {memberships.length > 1 ? (
                <select value={membership.societe_id} onChange={(e) => changerSociete(e.target.value)} style={{ fontWeight: 700, fontSize: '15px', padding: '2px 4px', marginLeft: '-5px', borderRadius: '8px', border: '1px solid transparent', background: 'transparent', color: C.text, maxWidth: '240px', cursor: 'pointer' }}>
                  {memberships.map((m) => <option key={m.societe_id} value={m.societe_id}>{m.societes ? m.societes.nom : m.societe_id}</option>)}
                </select>
              ) : (
                <div style={{ fontWeight: 700, color: C.text, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{societe ? societe.nom : 'Société'}</div>
              )}
              <div style={{ fontSize: '11.5px', color: C.muted, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span style={{ background: C.brandSoft, color: C.brandDark, padding: '1px 7px', borderRadius: '999px', fontWeight: 600, fontSize: '10.5px' }}>{ROLES[role]}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
              </div>
            </div>
            {plateformeAdmin && (
              <a href="/console" title="Console GeoPulse" className="gp-mobile-seul" style={{ border: '1px solid ' + C.line, background: 'white', borderRadius: '10px', padding: '8px', color: C.brand, flex: 'none' }}>
                <Icon name="shield" size={17} />
              </a>
            )}
            <button type="button" onClick={deconnexion} title="Se déconnecter" className="gp-mobile-seul" style={{ border: '1px solid ' + C.line, background: 'white', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: C.muted, flex: 'none' }}>
              <Icon name="logout" size={17} />
            </button>
          </header>

          <div className="gp-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                onIsochrone={setIsochrone}
                delegations={delegations}
              />
            )}

            {tab === 'demographie' && (
              <DemographiePanel demographie={demographie} gouvernorat={gouvDemo} onGouvernorat={choisirGouvDemo} carte={carteDemo} onCarte={setCarteDemo} />
            )}

            {tab === 'points' && (
              <PointsList points={points} typesById={typesById} auteurs={auteurs} userId={userId} role={role} onFocus={focaliser} onEdit={modifier} onDelete={supprimer} />
            )}

            {tab === 'valider' && manager && (
              <ValidationPanel points={points} typesById={typesById} champsByType={champsByType} auteurs={auteurs} onFocus={focaliser} onChanged={charger} />
            )}

            {tab === 'ventes' && manager && (
              <VentesImport societeId={membership.societe_id} points={points} types={types} champs={champs} onChanged={charger} />
            )}

            {tab === 'types' && role === 'admin' && (
              <TypesAdmin societeId={membership.societe_id} types={types} champs={champs} points={points} onChanged={charger} />
            )}

            {tab === 'journal' && manager && (
              <JournalPanel societeId={membership.societe_id} auteurs={auteurs} typesById={typesById} champs={champs} />
            )}

            {tab === 'equipe' && role === 'admin' && (
              <TeamPanel societeId={membership.societe_id} societeNom={societe ? societe.nom : ''} membres={membres} userId={userId} onChanged={() => { charger(); chargerMembership(); }} />
            )}
          </div>
        </div>
      </aside>

      <section className="pro-map" style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {/* Barre d'outils de la carte */}
        <div className="gp-outils" style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', zIndex: 1000, display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'space-between', pointerEvents: 'none' }}>
          <div className="gp-glass gp-stats" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 14px', borderRadius: '14px', pointerEvents: 'auto' }}>
            <Stat valeur={stats.reseau} label="points du réseau" />
            <span style={{ width: 1, alignSelf: 'stretch', background: C.line }} />
            <Stat valeur={stats.concurrents} label="concurrents" />
            {stats.ca12 > 0 && (
              <>
                <span style={{ width: 1, alignSelf: 'stretch', background: C.line }} />
                <Stat valeur={formatCompact(stats.ca12)} label="TND CA 12 mois" accent />
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto', alignItems: 'flex-start' }}>
            <button type="button" onClick={() => setView({ reset: true })} className="gp-glass" style={{ border: 'none', borderRadius: '12px', padding: '9px 13px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Icon name="crosshair" size={15} /> <span className="gp-texte-large">Tunisie</span>
            </button>
            {types.length > 0 && (
              <button type="button" onClick={() => setLegendeOuverte(!legendeOuverte)} className="gp-glass gp-legende-btn" style={{ border: 'none', borderRadius: '12px', padding: '8px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: legendeOuverte ? C.brand : C.text, alignItems: 'center', gap: '6px' }}>
                <Icon name="layers" size={15} />{filtreTypes.length ? ` ${filtreTypes.length}` : ''}
              </button>
            )}
          </div>
        </div>

        {/* Légende : un clic ajoute ou retire un type de la carte ; « Tous les types » les réaffiche tous */}
        {types.length > 0 && (
          <div className={'gp-glass gp-legend' + (legendeOuverte ? ' ouverte' : '')} style={{ position: 'absolute', left: '16px', bottom: '24px', zIndex: 1000, borderRadius: '14px', padding: '10px', minWidth: '200px' }}>
            <div style={{ ...surtitre, padding: '2px 8px 6px', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="layers" size={13} /> Légende</div>
            {[{ id: 'tous', nom: 'Tous les types', couleur: null }, ...types].map((t) => {
              const actif = t.id === 'tous' ? !filtreTypes.length : filtreTypes.includes(t.id);
              const nb = t.id === 'tous' ? points.length : (compteParType[t.id] || 0);
              return (
                <button key={t.id} type="button" className="gp-legend-item" onClick={() => setFiltreTypes((cur) => (t.id === 'tous' ? [] : actif ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                  style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', border: 'none', background: actif ? C.brandSoft : 'transparent', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer', fontSize: '12.5px', color: actif ? C.brandDark : C.body, fontWeight: actif ? 600 : 500, textAlign: 'left' }}>
                  {t.couleur ? <span style={{ width: 11, height: 11, borderRadius: '50%', background: t.couleur, boxShadow: '0 0 0 2px white, 0 0 0 3px ' + t.couleur + '55' }} /> : <Icon name="layers" size={12} />}
                  <span style={{ flex: 1 }}>{t.nom}</span>
                  <span className="num" style={{ color: C.faint, fontSize: '11.5px' }}>{nb}</span>
                </button>
              );
            })}
            <div style={{ borderTop: '1px solid ' + C.line, margin: '6px 0 4px' }} />
            <button type="button" className="gp-legend-item" onClick={() => setClassesGen((cur) => (cur.length ? [] : CLASSES_PAR_DEFAUT))}
              style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', border: 'none', background: classesGen.length ? C.brandSoft : 'transparent', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer', fontSize: '12.5px', color: classesGen.length ? C.brandDark : C.body, fontWeight: 600, textAlign: 'left' }}>
              <Icon name="activity" size={13} />
              <span style={{ flex: 1 }}>Générateurs de trafic</span>
              <span style={{ width: 28, height: 16, borderRadius: 999, background: classesGen.length ? C.brand : '#cbd5e1', position: 'relative', flex: 'none', transition: 'background .15s' }}>
                <span style={{ position: 'absolute', top: 2, left: classesGen.length ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: 'white', transition: 'left .15s' }} />
              </span>
            </button>
            {classesGen.length > 0 && generateurs && generateurs.classes.map((c) => {
              const actif = classesGen.includes(c.cle);
              return (
                <button key={c.cle} type="button" className="gp-legend-item" onClick={() => setClassesGen((cur) => (actif ? (cur.length > 1 ? cur.filter((x) => x !== c.cle) : cur) : [...cur, c.cle]))}
                  style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', border: 'none', background: 'transparent', borderRadius: '8px', padding: '4px 8px 4px 12px', cursor: 'pointer', fontSize: '12px', color: actif ? C.body : C.faint, textAlign: 'left' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: actif ? COULEURS_GENERATEURS[c.cle] : '#cbd5e1', boxShadow: '0 0 0 1.5px white' }} />
                  <span style={{ flex: 1, textDecoration: actif ? 'none' : 'line-through' }}>{c.libelle}</span>
                </button>
              );
            })}
          </div>
        )}

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
          compact={mobile}
          generateurs={generateurs}
          classesGenerateurs={classesGen}
          selectedGouv={tab === 'demographie' ? gouvDemo : null}
          delegations={tab === 'demographie' ? delegations : null}
          carteDelegations={carteDemo}
          isochrone={tab === 'simuler' && position ? isochrone : null}
          zoneKm={tab === 'simuler' && position ? rayonKm : null}
        />
      </section>
    </div>
  );
}


function formatCompact(n) {
  if (n >= 1e6) return (Math.round(n / 1e5) / 10).toLocaleString('fr-FR') + ' M';
  if (n >= 1e3) return Math.round(n / 1e3).toLocaleString('fr-FR') + ' k';
  return Math.round(n).toLocaleString('fr-FR');
}

function Stat({ valeur, label, accent }) {
  return (
    <div style={{ lineHeight: 1.15 }}>
      <div className="num" style={{ fontSize: '17px', fontWeight: 700, color: accent ? C.brand : C.text, letterSpacing: '-.01em' }}>{valeur}</div>
      <div style={{ fontSize: '10.5px', color: C.muted, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function Chargement({ texte }) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: C.muted, fontSize: '13px' }}>
      <Logo size={48} />
      {texte}
    </main>
  );
}
