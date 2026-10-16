// Calls a Supabase Edge Function as the signed-in user and returns the readable error message when it fails.
import { supabase } from './cloud';

export async function callFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) { let msg = error.message; try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* generic message */ } throw new Error(msg); }
  const d = data as { error?: string }; if (d?.error) throw new Error(d.error);
  return data as T;
}
