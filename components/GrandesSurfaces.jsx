'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { traduireErreur } from '../lib/points';
import { chargerDelegations, delegationEn } from '../lib/recensement';
import { chargerGrandesSurfaces, nouvellesGrandesSurfaces, NOM_TYPE_GS } from '../lib/grandesSurfaces';
import { C, Message, btn, carte, surtitre } from './ui';
import Icon from './icons';

const LOT = 100;

// Réservé aux administrateurs : ajoute à la carte de la société, comme concurrents, les grandes surfaces des enseignes
// nationales détectées automatiquement (Carrefour, Monoprix, MG, Géant, Aziza).
export default function GrandesSurfaces({ societeId, types, points, onChanged }) {
  const [donnees, setDonnees] = useState(null);
  const [delegations, setDelegations] = useState(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState(null);
  const [choix, setChoix] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    chargerGrandesSurfaces().then((d) => { setDonnees(d); setChoix(Object.keys(d.enseignes)); }).catch((e) => setErreur(e.message));
    chargerDelegations().then(setDelegations).catch(() => {});
  }, []);

  const typeGs = types.find((t) => t.nom === NOM_TYPE_GS);
  const deja = typeGs ? points.filter((p) => p.type_id === typeGs.id).length : 0;
  const nouvelles = useMemo(
    () => (donnees && choix ? nouvellesGrandesSurfaces(donnees, points, choix) : []),
    [donnees, points, choix]
  );
  const parEnseigne = useMemo(() => {
    if (!donnees) return [];
    return Object.entries(donnees.enseignes)
      .map(([cle, libelle]) => ({ cle, libelle, n: donnees.points.filter((p) => p[0] === cle).length }))
      .sort((a, b) => b.n - a.n);
  }, [donnees]);

  if (erreur || !donnees) return null;

  const ajouter = async () => {
    setBusy(true);
    setMessage(null);
    let type = typeGs;
    if (!type) {
      const ordre = types.length ? Math.max(...types.map((t) => t.ordre || 0)) + 1 : 0;
      const { data, error } = await supabase.from('types_point')
        .insert([{ societe_id: societeId, nom: NOM_TYPE_GS, categorie: 'concurrent', couleur: '#64748b', ordre }]).select('*');
      if (error || !data || !data.length) {
        setBusy(false);
        setMessage({ type: 'err', text: error ? traduireErreur(error) : 'Création du type refusée.' });
        return;
      }
      type = data[0];
    }
    const lignes = nouvelles.map(([enseigne, format, lat, lng, nom]) => {
      const d = delegationEn(delegations, lat, lng);
      return {
        societe_id: societeId,
        type_id: type.id,
        nom: nom || donnees.enseignes[enseigne],
        latitude: lat,
        longitude: lng,
        gouvernorat: d ? d.gouvernorat : null,
        delegation: d ? d.delegation : null,
        source_position: 'import',
        donnees: { enseigne: donnees.enseignes[enseigne], format, origine: 'Détection automatique (Overture Maps)' },
        statut: 'valide',
      };
    });
    let faits = 0;
    for (let i = 0; i < lignes.length; i += LOT) {
      const { error } = await supabase.from('points').insert(lignes.slice(i, i + LOT));
      if (error) {
        setBusy(false);
        setMessage({ type: 'err', text: `${faits} grandes surfaces ajoutées, puis erreur : ${traduireErreur(error)}` });
        onChanged();
        return;
      }
      faits += Math.min(LOT, lignes.length - i);
    }
    setBusy(false);
    setMessage({ type: 'ok', text: `${faits} grandes surfaces ajoutées au type « ${NOM_TYPE_GS} ». Vous pouvez modifier ou supprimer chacune depuis la liste des points.` });
    onChanged();
  };

  const basculer = (cle) => setChoix((c) => (c.includes(cle) ? c.filter((x) => x !== cle) : [...c, cle]));

  return (
    <div style={{ ...carte, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ ...surtitre, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="globe" size={13} />Grandes surfaces détectées</div>
      <div style={{ fontSize: '12.5px', color: C.body, lineHeight: 1.5 }}>
        {donnees.points.length} magasins des enseignes nationales repérés en Tunisie. Ajoutez-les à votre carte comme concurrents :
        ils comptent alors dans la part de marché et la pression concurrentielle du simulateur.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {parEnseigne.map((e) => {
          const actif = choix.includes(e.cle);
          return (
            <button key={e.cle} type="button" onClick={() => basculer(e.cle)} aria-pressed={actif}
              style={{ border: '1px solid ' + (actif ? C.brand : C.line), background: actif ? C.brandSoft : 'white', color: actif ? C.brandDark : C.muted, borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {e.libelle} <span className="num">{e.n}</span>
            </button>
          );
        })}
      </div>
      {message && <Message type={message.type}>{message.text}</Message>}
      <button type="button" onClick={ajouter} disabled={busy || nouvelles.length === 0} style={btn(undefined, busy || nouvelles.length === 0)}>
        {busy ? 'Ajout en cours…' : nouvelles.length ? `Ajouter ${nouvelles.length} grandes surfaces à ma carte` : 'Toutes déjà sur votre carte'}
      </button>
      <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.45 }}>
        {deja ? `${deja} déjà ajoutées. ` : ''}Les magasins déjà présents sur votre carte (même enseigne à moins de 150 m) sont ignorés.
        Source : Overture Maps Foundation (lieux, octobre 2026). Couverture : bonne pour Carrefour, Monoprix et MG, partielle pour
        Aziza et les petites enseignes.
      </div>
    </div>
  );
}
