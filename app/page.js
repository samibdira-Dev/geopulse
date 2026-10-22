import { redirect } from 'next/navigation';

// La version avec connexion (/pro) est désormais la page d'accueil.
export default function Home() {
  redirect('/pro');
}
