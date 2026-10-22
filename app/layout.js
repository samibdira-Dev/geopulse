import './globals.css'

export const metadata = {
  title: 'GeoPulse - Géomarketing Tunisie',
  description: 'Solution de géomarketing et d’optimisation de réseaux de points de vente en Tunisie',
}

// Téléphone : la page occupe tout l'écran, y compris sous l'encoche (marges gérées en CSS).
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

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
      </body>
    </html>
  )
}
