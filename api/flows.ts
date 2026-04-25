import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, cors } from './_auth';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

// GET /api/flows — list flow metadata (no tree payload)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data, error } = await supabase
    .from('flowchart_trees')
    .select('id, name, saved_at')
    .eq('user_id', auth.userId)
    .order('saved_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Internal error' });

  return res.status(200).json(
    (data ?? []).map(r => ({ id: r.id, name: r.name ?? 'Untitled', savedAt: r.saved_at }))
  );
}
