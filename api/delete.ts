import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

// DELETE /api/delete?flowId=xxx
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const flowId = req.query['flowId'] as string | undefined;
  if (!flowId) return res.status(400).json({ error: 'Missing flowId' });

  const { error } = await supabase
    .from('flowchart_trees')
    .delete()
    .eq('id', flowId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
