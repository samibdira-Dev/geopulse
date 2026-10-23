import './globals.css'
import EnregistrerSW from '../components/EnregistrerSW'

export const metadata = {
  title: 'GeoPulse – Géomarketing Tunisie',
  description: 'Solution de géomarketing et d’optimisation de réseaux de points de vente en Tunisie',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/favicon-64.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'GeoPulse', statusBarStyle: 'black-translucent' },
}

// Téléphone : la page occupe tout l'écran, y compris sous l'encoche (marges gérées en CSS).
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b1020' }

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <EnregistrerSW />
      </body>
    </html>
  )
}
