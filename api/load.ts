import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
);

const ROW_ID = 'default';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { data, error } = await supabase
    .from('flowchart_trees')
    .select('tree, saved_at')
    .eq('id', ROW_ID)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'No saved tree found' });
  }

  return res.status(200).json({ tree: data.tree, savedAt: data.saved_at });
}
