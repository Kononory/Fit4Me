import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

const TREE_KEY = 'fit4me:tree';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const raw = await kv.get<string>(TREE_KEY);
    if (!raw) {
      return res.status(404).json({ error: 'No saved tree found' });
    }

    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[load]', err);
    return res.status(500).json({ error: 'Failed to load' });
  }
}
