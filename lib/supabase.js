import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

// Client unique pour toute l'application (la session de connexion est conservée par le navigateur).
export const supabase = supabaseConfigured ? createClient(url, key) : null;
