import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url = process.env['Fit4Me_SUPABASE_URL'];
  const key = process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !key) {
    return res.status(500).json({
      ok: false,
      error: 'Missing env vars',
      hasUrl: !!url,
      hasKey: !!key,
    });
  }

  try {
    const supabase = createClient(url, key);
    const { error } = await supabase
      .from('flowchart_trees')
      .select('id')
      .limit(1);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message, hint: error.hint });
    }
    return res.status(200).json({ ok: true, message: 'Supabase connected' });
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
