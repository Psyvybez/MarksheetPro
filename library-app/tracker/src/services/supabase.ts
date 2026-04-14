import { createClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL = 'https://pvwcdesafxxkosdrfjwa.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2d2NkZXNhZnh4a29zZHJmandhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0NzY3NDIsImV4cCI6MjA3NDA1Mjc0Mn0.qaSGzdLMCbYNO1KQPCZJrCrk0AEtesKvt2kHXJ_IVH8';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
