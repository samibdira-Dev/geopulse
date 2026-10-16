import './globals.css'

export const metadata = {
  title: 'GeoPulse - SOPAT Géomarketing',
  description: 'Solution de géomarketing et d optimisation de réseau pour SOPAT',
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