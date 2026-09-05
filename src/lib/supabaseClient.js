import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly at boot rather than surfacing as a confusing network error
  // the first time a field technician tries to submit a form.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

export const INCIDENT_PROOFS_BUCKET = 'ft-incident-proofs';

/**
 * Uploads a captured photo (File/Blob) to the public ft-incident-proofs
 * bucket and returns its public URL. Path is namespaced by day + a random
 * suffix so field uploads never collide.
 */
export async function uploadIncidentPhoto(file, prefix = 'log') {
  const ext = file.type?.split('/')?.[1] || 'jpg';
  const path = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(INCIDENT_PROOFS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg'
  });

  if (error) throw error;

  const { data } = supabase.storage.from(INCIDENT_PROOFS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
