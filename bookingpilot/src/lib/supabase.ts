import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client — only created when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 * Without them BookingPilot runs in demo mode on the in-browser store (src/store/store.ts).
 * Never put the service-role key in a VITE_ variable: it would be shipped to every browser.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, key!) : null;
