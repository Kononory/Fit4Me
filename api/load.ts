import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, cors } from './_auth';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data, error } = await supabase
    .from('flowchart_trees')
    .select('id, name, tree, saved_at')
    .eq('user_id', auth.userId)
    .order('saved_at', { ascending: true });

  if (error) {
    console.error('[load]', error.message);
    return res.status(500).json({ error: 'Internal error' });
  }

  const flows = (data ?? []).map(r => {
    const isCompound = r.tree && typeof r.tree === 'object' && 'tree' in r.tree;
    return {
      id:             r.id,
      name:           r.name ?? 'Untitled',
      tree:           isCompound ? r.tree.tree              : r.tree,
      crossEdges:     isCompound ? (r.tree.crossEdges     ?? []) : [],
      retentionData:  isCompound ? (r.tree.retentionData  ?? []) : [],
      eventEdges:     isCompound ? (r.tree.eventEdges     ?? []) : [],
      eventPositions: isCompound ? (r.tree.eventPositions ?? {}) : {},
      savedAt:        r.saved_at,
    };
  });

  return res.status(200).json(flows);
}
