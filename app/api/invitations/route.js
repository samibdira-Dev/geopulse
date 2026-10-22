import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { traiterInvitation } from '../../../lib/invitations';

export const dynamic = 'force-dynamic';

// Onglet Équipe : inviter un membre ou lui donner un nouveau code. La clé de service ne quitte jamais le serveur.
export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ erreur: 'Invitations non activées : ajoutez la clé SUPABASE_SERVICE_ROLE_KEY dans les réglages Vercel.' }, { status: 503 });
  }
  const jeton = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let corps = {};
  try { corps = await req.json(); } catch (e) { /* corps vide */ }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, service, options);
  const commeAppelant = createClient(url, anon, { ...options, global: { headers: { Authorization: `Bearer ${jeton}` } } });
  try {
    const r = await traiterInvitation({ admin, commeAppelant, jeton, corps });
    return NextResponse.json(r.corps, { status: r.statut });
  } catch (e) {
    return NextResponse.json({ erreur: 'Erreur du serveur : ' + (e.message || e) }, { status: 500 });
  }
}
