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

  // ── GET /api/share?flowId=ID — list shares for a flow ──────────────────────
  if (req.method === 'GET') {
    const { flowId } = req.query as { flowId?: string };
    if (!flowId) return res.status(400).json({ error: 'Missing flowId' });

    const { data, error } = await supabase
      .from('flow_shares')
      .select('id, token, permission, created_at, access_count, last_accessed_at')
      .eq('flow_id', flowId)
      .eq('created_by', auth.userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[share/list]', error.message);
      return res.status(500).json({ error: 'Internal error' });
    }
    return res.status(200).json(data ?? []);
  }

  // ── POST /api/share — create a share token ─────────────────────────────────
  if (req.method === 'POST') {
    const { flowId, permission } = req.body as { flowId?: string; permission?: string };
    if (!flowId || !permission || !['view', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'flowId and permission (view|edit) required' });
    }

    // Verify caller owns the flow
    const { data: flow } = await supabase
      .from('flowchart_trees')
      .select('id')
      .eq('id', flowId)
      .eq('user_id', auth.userId)
      .single();

    if (!flow) return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await supabase
      .from('flow_shares')
      .insert({ flow_id: flowId, permission, created_by: auth.userId })
      .select('token, permission')
      .single();

    if (error) {
      console.error('[share/create]', error.message);
      return res.status(500).json({ error: 'Internal error' });
    }
    return res.status(200).json({ token: data.token, permission: data.permission });
  }

  // ── DELETE /api/share?token=TOKEN — revoke a share ─────────────────────────
  if (req.method === 'DELETE') {
    const { token } = req.query as { token?: string };
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const { error } = await supabase
      .from('flow_shares')
      .delete()
      .eq('token', token)
      .eq('created_by', auth.userId);

    if (error) {
      console.error('[share/delete]', error.message);
      return res.status(500).json({ error: 'Internal error' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
