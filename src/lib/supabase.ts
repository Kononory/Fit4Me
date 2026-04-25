import { createClient } from '@supabase/supabase-js';
import type { User, Session } from '@supabase/supabase-js';

const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const key = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

// null when env vars not configured (local dev without auth)
export const supabase = url && key ? createClient(url, key) : null;

export type { User, Session };

export async function getAuthHeaders(): Promise<HeadersInit> {
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}
