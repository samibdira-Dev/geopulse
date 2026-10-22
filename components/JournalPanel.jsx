'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLES, STATUTS } from '../lib/points';
import { C, chip, ghostBtn, Message, SectionTitle } from './ui';

// Journal des modifications (administrateurs et managers) : qui a créé, modifié ou supprimé quoi, et quand.
const PAGE = 100;
const OBJETS = { point: 'Points', type: 'Types', champ: 'Champs', membre: 'Équipe', ventes: 'Ventes' };
const VERBES = {
  creation: { point: 'a créé le point', type: 'a créé le type', champ: 'a créé le champ', membre: 'a ajouté le membre' },
  modification: { point: 'a modifié le point', type: 'a modifié le type', champ: 'a modifié le champ', membre: 'a modifié le membre' },
  suppression: { point: 'a supprimé le point', type: 'a supprimé le type', champ: 'a supprimé le champ', membre: 'a retiré le membre', ventes: 'a supprimé les ventes de' },
  import: { ventes: 'a importé les ventes de' },
  invitation: { membre: 'a invité' },
  code: { membre: 'a donné un nouveau code à' },
};
const COULEURS = { creation: '#15803d', invitation: '#15803d', import: '#4f46e5', modification: '#b45309', code: '#b45309', suppression: '#b91c1c' };
const LIBELLES_CHAMPS = {
  nom: 'Nom', statut: 'Statut', type_id: 'Type', latitude: 'Latitude', longitude: 'Longitude', gouvernorat: 'Gouvernorat',
  delegation: 'Délégation', code_externe: 'Code client', role: 'Rôle', nom_affiche: 'Nom affiché', couleur: 'Couleur',
  categorie: 'Catégorie', actif: 'Actif', ordre: 'Ordre', libelle: 'Libellé', obligatoire: 'Obligatoire', options: 'Options',
  exploitation: 'Paramètres d’exploitation',
};
const IGNORES = ['cree_le', 'cree_par', 'modifie_le', 'societe_id', 'source_position'];

const nombre = (v) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

export default function JournalPanel({ societeId, auteurs, typesById, champs }) {
  const [lignes, setLignes] = useState([]);
  const [fin, setFin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [objet, setObjet] = useState('tous');
  const [auteur, setAuteur] = useState('tous');

  const libelleChamp = useMemo(() => Object.fromEntries((champs || []).map((c) => [c.cle, c.libelle])), [champs]);

  const charger = useCallback(async (depuis) => {
    setBusy(true);
    let q = supabase.from('journal').select('*').eq('societe_id', String(societeId)).order('cree_le', { ascending: false }).order('id', { ascending: false });
    if (objet !== 'tous') q = q.eq('objet', objet);
    if (auteur !== 'tous') q = q.eq('auteur', auteur);
    const { data, error } = await q.range(depuis, depuis + PAGE - 1);
    setBusy(false);
    if (error) {
      setErreur(/journal/i.test(error.message) && /exist|schema cache/i.test(error.message)
        ? 'Journal pas encore activé : exécutez le script equipe-journal.sql dans Supabase.'
        : error.message);
      return;
    }
    setErreur(null);
    setLignes((cur) => (depuis ? [...cur, ...data] : data));
    setFin(data.length < PAGE);
  }, [societeId, objet, auteur]);
  useEffect(() => { charger(0); }, [charger]);

  const nomAuteur = (l) => (l.auteur && auteurs[l.auteur]) || l.auteur_email || (l.auteur ? 'Ancien membre' : 'Script SQL / système');
  const valeur = (cle, v) => {
    if (v === null || v === undefined || v === '') return 'vide';
    if (cle === 'statut') return (STATUTS[v] || {}).label || v;
    if (cle === 'role') return ROLES[v] || v;
    if (cle === 'type_id') return (typesById[v] || {}).nom || 'type supprimé';
    if (typeof v === 'boolean') return v ? 'oui' : 'non';
    if (typeof v === 'object') return 'modifié';
    return String(v);
  };
  // Détail d'une modification : « Statut : À valider → Validé », champs du formulaire compris.
  const details = (l) => {
    if (l.objet === 'ventes') {
      const c = l.changements || {};
      return [`${nombre(c.lignes)} lignes, ${nombre(c.points)} points, ${nombre(c.total)} TND`];
    }
    if (l.action === 'invitation') {
      const c = l.changements || {};
      return [`${c.email} · ${ROLES[c.role] || c.role}${c.compte_existant ? ' · compte existant' : ''}`];
    }
    if (l.action !== 'modification' || !l.changements) return [];
    const out = [];
    Object.entries(l.changements).forEach(([cle, { avant, apres }]) => {
      if (IGNORES.includes(cle)) return;
      if (cle === 'donnees') {
        const a = avant || {}; const b = apres || {};
        [...new Set([...Object.keys(a), ...Object.keys(b)])].forEach((k) => {
          if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${libelleChamp[k] || k} : ${valeur(k, a[k])} → ${valeur(k, b[k])}`);
        });
      } else if (cle === 'latitude' || cle === 'longitude') {
        if (!out.includes('Position déplacée')) out.push('Position déplacée');
      } else {
        out.push(`${LIBELLES_CHAMPS[cle] || cle} : ${valeur(cle, avant)} → ${valeur(cle, apres)}`);
      }
    });
    return out;
  };

  const listeAuteurs = Object.entries(auteurs);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionTitle icon="history" title="Journal des modifications">
        Chaque création, modification et suppression, avec son auteur et sa date. Personne ne peut modifier ce journal.
      </SectionTitle>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[['tous', 'Tout'], ...Object.entries(OBJETS)].map(([k, v]) => (
          <button key={k} type="button" onClick={() => setObjet(k)} style={chip(objet === k)}>{v}</button>
        ))}
      </div>
      <select value={auteur} onChange={(e) => setAuteur(e.target.value)} style={{ padding: '8px', borderRadius: '9px', border: '1px solid ' + C.lineStrong, fontSize: '12.5px', fontFamily: 'inherit' }}>
        <option value="tous">Tous les membres</option>
        {listeAuteurs.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
      </select>

      {erreur && <Message type="err">{erreur}</Message>}
      {!erreur && !busy && !lignes.length && <div style={{ fontSize: '13px', color: C.muted }}>Aucune modification enregistrée pour l’instant.</div>}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lignes.map((l) => {
          const d = new Date(l.cree_le);
          const verbe = (VERBES[l.action] || {})[l.objet] || `${l.action} ${l.objet}`;
          const det = details(l);
          return (
            <div key={l.id} style={{ display: 'flex', gap: '10px', padding: '9px 2px', borderBottom: '1px solid ' + C.line }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: COULEURS[l.action] || C.faint, marginTop: '6px', flex: 'none' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '12.5px', color: C.body, lineHeight: 1.45 }}>
                  <b style={{ color: C.text }}>{nomAuteur(l)}</b> {verbe} {l.libelle ? <b style={{ color: C.text }}>« {l.libelle} »</b> : null}
                </div>
                {det.map((x) => <div key={x} style={{ fontSize: '11.5px', color: C.muted, lineHeight: 1.5 }}>{x}</div>)}
                <div className="num" style={{ fontSize: '11px', color: C.faint, marginTop: '2px' }}>
                  {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} à {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!fin && lignes.length > 0 && (
        <button type="button" disabled={busy} onClick={() => charger(lignes.length)} style={ghostBtn}>{busy ? 'Chargement…' : 'Afficher plus'}</button>
      )}
    </div>
  );
}
