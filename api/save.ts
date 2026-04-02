import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
);

const ROW_ID = 'default';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body;
  if (!payload?.tree) {
    return res.status(400).json({ error: 'Missing tree in body' });
  }

  const { error } = await supabase
    .from('flowchart_trees')
    .upsert({ id: ROW_ID, tree: payload.tree, saved_at: payload.savedAt });

  if (error) {
    console.error('[save]', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true, savedAt: payload.savedAt });
}
