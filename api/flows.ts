import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

// GET  /api/flows       — list all flow metadata (no tree payload)
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { data, error } = await supabase
    .from('flowchart_trees')
    .select('id, name, saved_at')
    .order('saved_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(
    (data ?? []).map(r => ({ id: r.id, name: r.name ?? 'Untitled', savedAt: r.saved_at }))
  );
}
