import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true, wenn die App mit einem echten Supabase-Projekt verbunden ist */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Supabase-Client. Ist nur gesetzt, wenn die Env-Variablen konfiguriert sind;
 * sonst läuft die App im lokalen Demo-Modus (siehe lib/db.ts).
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
