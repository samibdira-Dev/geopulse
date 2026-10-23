'use client';
import { useEffect, useState } from 'react';

// Installation de GeoPulse comme application, avec un bouton et des instructions adaptés à l'appareil du visiteur.

export const APPAREILS = {
  iphone: { nom: 'iPhone', bouton: 'Installer sur votre iPhone' },
  ipad: { nom: 'iPad', bouton: 'Installer sur votre iPad' },
  android: { nom: 'Android', bouton: 'Installer sur votre Android' },
  mac: { nom: 'Mac', bouton: 'Installer sur votre Mac' },
  ordinateur: { nom: 'Ordinateur', bouton: 'Installer sur votre ordinateur' },
};

export function detecterAppareil() {
  if (typeof navigator === 'undefined') return { appareil: 'ordinateur', navigateur: 'chrome', installee: false };
  const ua = navigator.userAgent;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const appareil = /iPhone|iPod/.test(ua) ? 'iphone' : ipad ? 'ipad' : /Android/.test(ua) ? 'android' : /Macintosh/.test(ua) ? 'mac' : 'ordinateur';
  const navigateur = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox|FxiOS/.test(ua) ? 'firefox' : /Edg/.test(ua) ? 'edge'
    : /CriOS|Chrome/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'autre';
  const installee = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  return { appareil, navigateur, installee };
}

// Étapes à suivre quand le navigateur ne propose pas l'installation directe.
export function etapes(appareil, navigateur) {
  if (appareil === 'iphone' || appareil === 'ipad') {
    return [
      ['partage', 'Touchez le bouton Partager', navigateur === 'safari' ? 'En bas de l’écran dans Safari (en haut sur iPad).' : 'Dans la barre du navigateur.'],
      ['ajout', 'Choisissez « Sur l’écran d’accueil »', 'Faites défiler la liste si besoin.'],
      ['ok', 'Touchez « Ajouter »', 'L’icône GeoPulse apparaît sur votre écran d’accueil.'],
    ];
  }
  if (appareil === 'android') {
    return [
      ['menu', 'Ouvrez le menu ⋮ du navigateur', navigateur === 'samsung' ? 'En bas à droite dans Samsung Internet.' : 'En haut à droite dans Chrome.'],
      ['ajout', 'Touchez « Installer l’application »', 'Ou « Ajouter à l’écran d’accueil ».'],
      ['ok', 'Confirmez', 'GeoPulse s’ouvre ensuite en plein écran, comme une application.'],
    ];
  }
  if (appareil === 'mac' && navigateur === 'safari') {
    return [
      ['menu', 'Ouvrez le menu « Fichier »', 'Dans la barre de menus de Safari.'],
      ['ajout', 'Choisissez « Ajouter au Dock »', 'Disponible avec macOS Sonoma ou plus récent.'],
      ['ok', 'Cliquez sur « Ajouter »', 'GeoPulse s’ouvre depuis le Dock dans sa propre fenêtre.'],
    ];
  }
  if (navigateur === 'firefox') {
    return [
      ['menu', 'Ouvrez cette page dans Chrome ou Edge', 'Firefox sur ordinateur ne sait pas installer les applications web.'],
      ['ajout', 'Cliquez sur l’icône d’installation', 'À droite de la barre d’adresse.'],
      ['ok', 'Cliquez sur « Installer »', 'GeoPulse s’ouvre dans sa propre fenêtre.'],
    ];
  }
  return [
    ['menu', 'Cliquez sur l’icône d’installation', 'À droite de la barre d’adresse, ou dans le menu ⋮ → « Installer GeoPulse ».'],
    ['ajout', 'Cliquez sur « Installer »', 'Une fenêtre de confirmation s’affiche.'],
    ['ok', 'C’est prêt', 'GeoPulse est dans vos applications et s’ouvre dans sa propre fenêtre.'],
  ];
}

// Garde l'invitation d'installation du navigateur (Chrome, Edge, Samsung Internet sur Android et ordinateur).
export function useInstallation() {
  const [infos, setInfos] = useState({ appareil: 'ordinateur', navigateur: 'chrome', installee: false, pret: false });
  const [invite, setInvite] = useState(null);
  useEffect(() => {
    setInfos({ ...detecterAppareil(), pret: true });
    const garder = (e) => { e.preventDefault(); setInvite(e); };
    const installe = () => { setInvite(null); setInfos((i) => ({ ...i, installee: true })); };
    window.addEventListener('beforeinstallprompt', garder);
    window.addEventListener('appinstalled', installe);
    return () => { window.removeEventListener('beforeinstallprompt', garder); window.removeEventListener('appinstalled', installe); };
  }, []);
  const installer = async () => {
    if (!invite) return false;
    invite.prompt();
    const { outcome } = await invite.userChoice;
    setInvite(null);
    if (outcome === 'accepted') setInfos((i) => ({ ...i, installee: true }));
    return true;
  };
  return { ...infos, direct: Boolean(invite), installer };
}

const ICONES_ETAPE = {
  partage: <><path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>,
  menu: <><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>,
  ajout: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  ok: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
};
export function IconeEtape({ nom, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES_ETAPE[nom]}
    </svg>
  );
}
