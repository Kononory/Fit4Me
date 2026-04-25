import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, sizeGuard, cors } from './_auth';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

// POST /api/claim — save anonymous local flows to authenticated user account
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sizeGuard(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { flows } = req.body ?? {};
  if (!Array.isArray(flows) || flows.length === 0)
    return res.status(400).json({ error: 'Missing flows' });

  const now = new Date().toISOString();
  const rows = (flows as Array<Record<string, unknown>>).map(f => ({
    id:       f['flowId'] as string,
    user_id:  auth.userId,
    name:     (f['name'] as string) ?? 'Untitled',
    tree: {
      tree:           f['tree'],
      crossEdges:     f['crossEdges']     ?? [],
      retentionData:  f['retentionData']  ?? [],
      eventEdges:     f['eventEdges']     ?? [],
      eventPositions: f['eventPositions'] ?? {},
    },
    saved_at: now,
  }));

  // upsert: if user previously had a flow with the same id, overwrite it
  const { error } = await supabase
    .from('flowchart_trees')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('[claim]', error.message);
    return res.status(500).json({ error: 'Internal error' });
  }

  return res.status(200).json({ ok: true, claimed: rows.length });
}
