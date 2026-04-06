import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { data, error } = await supabase
    .from('flowchart_trees')
    .select('id, name, tree, saved_at')
    .order('saved_at', { ascending: true });

  if (error) {
    console.error('[load]', error.message);
    return res.status(500).json({ error: error.message });
  }

  const flows = (data ?? []).map(r => {
    // Detect compound format { tree, crossEdges, retentionData } vs legacy plain TreeNode
    const isCompound = r.tree && typeof r.tree === 'object' && 'tree' in r.tree;
    return {
      id:            r.id,
      name:          r.name ?? 'Untitled',
      tree:          isCompound ? r.tree.tree          : r.tree,
      crossEdges:    isCompound ? (r.tree.crossEdges   ?? []) : [],
      retentionData: isCompound ? (r.tree.retentionData ?? []) : [],
      savedAt:       r.saved_at,
    };
  });

  return res.status(200).json(flows);
}
