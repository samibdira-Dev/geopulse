'use client';
import { useEffect } from 'react';

// Enregistre le service worker : il rend GeoPulse installable comme une application.
export default function EnregistrerSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
