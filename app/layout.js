import './globals.css'

export const metadata = {
  title: 'GeoPulse - Géomarketing Tunisie',
  description: 'Solution de géomarketing et d’optimisation de réseaux de points de vente en Tunisie',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8fafc' }}>
        {children}
      </body>
    </html>
  )
}