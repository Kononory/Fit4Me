import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

const TREE_KEY = 'fit4me:tree';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    if (!payload?.tree) {
      return res.status(400).json({ error: 'Missing tree in body' });
    }

    await kv.set(TREE_KEY, JSON.stringify(payload));
    return res.status(200).json({ ok: true, savedAt: payload.savedAt });
  } catch (err) {
    console.error('[save]', err);
    return res.status(500).json({ error: 'Failed to save' });
  }
}
