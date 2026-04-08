import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { flowId, name, tree, crossEdges, retentionData, eventEdges, eventPositions, savedAt } = req.body ?? {};
  if (!flowId || !tree) return res.status(400).json({ error: 'Missing flowId or tree' });

  const payload = {
    tree,
    crossEdges:     crossEdges     ?? [],
    retentionData:  retentionData  ?? [],
    eventEdges:     eventEdges     ?? [],
    eventPositions: eventPositions ?? {},
  };

  const { error } = await supabase
    .from('flowchart_trees')
    .upsert({ id: flowId, name: name ?? 'Untitled', tree: payload, saved_at: savedAt ?? new Date().toISOString() });

  if (error) {
    console.error('[save] Supabase error:', error.message, error.details, error.hint);
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ ok: true });
}
