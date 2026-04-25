import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { cors, sizeGuard } from './_auth';

const supabase = createClient(
  process.env['Fit4Me_SUPABASE_URL'] ?? '',
  process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  const { token } = req.query as { token?: string };
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }

  // ── GET /api/shared?token=TOKEN — fetch a shared flow ─────────────────────
  if (req.method === 'GET') {
    const { data: share } = await supabase
      .from('flow_shares')
      .select('flow_id, permission, access_count')
      .eq('token', token)
      .single();

    if (!share) return res.status(404).json({ error: 'Share not found' });

    const { data: flow } = await supabase
      .from('flowchart_trees')
      .select('id, name, tree')
      .eq('id', share.flow_id)
      .single();

    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    // Best-effort access tracking (fire and forget)
    supabase.from('flow_shares').update({
      access_count: (share.access_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString(),
    }).eq('token', token).then(() => {/* ignore */});

    const isCompound = flow.tree && typeof flow.tree === 'object' && 'tree' in flow.tree;
    return res.status(200).json({
      id:             flow.id,
      name:           flow.name ?? 'Shared Flow',
      permission:     share.permission,
      tree:           isCompound ? (flow.tree as any).tree              : flow.tree,
      crossEdges:     isCompound ? ((flow.tree as any).crossEdges     ?? []) : [],
      retentionData:  isCompound ? ((flow.tree as any).retentionData  ?? []) : [],
      eventEdges:     isCompound ? ((flow.tree as any).eventEdges     ?? []) : [],
      eventPositions: isCompound ? ((flow.tree as any).eventPositions ?? {}) : {},
    });
  }

  // ── POST /api/shared?token=TOKEN — save edits (edit permission only) ───────
  if (req.method === 'POST') {
    if (!sizeGuard(req, res)) return;

    const { data: share } = await supabase
      .from('flow_shares')
      .select('flow_id, permission')
      .eq('token', token)
      .single();

    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.permission !== 'edit') return res.status(403).json({ error: 'View-only link' });

    const body = req.body as {
      tree?: object;
      crossEdges?: unknown[];
      retentionData?: unknown[];
      eventEdges?: unknown[];
      eventPositions?: object;
    };

    const { error } = await supabase
      .from('flowchart_trees')
      .update({
        tree: {
          tree:           body.tree           ?? {},
          crossEdges:     body.crossEdges     ?? [],
          retentionData:  body.retentionData  ?? [],
          eventEdges:     body.eventEdges     ?? [],
          eventPositions: body.eventPositions ?? {},
        },
        saved_at: new Date().toISOString(),
      })
      .eq('id', share.flow_id);

    if (error) {
      console.error('[shared/save]', error.message);
      return res.status(500).json({ error: 'Internal error' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
