import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, cors } from './_auth';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

// DELETE /api/delete?flowId=xxx
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const flowId = req.query['flowId'] as string | undefined;
  if (!flowId) return res.status(400).json({ error: 'Missing flowId' });

  const { error } = await supabase
    .from('flowchart_trees')
    .delete()
    .eq('id', flowId)
    .eq('user_id', auth.userId); // can only delete own flows

  if (error) return res.status(500).json({ error: 'Internal error' });
  return res.status(200).json({ ok: true });
}
