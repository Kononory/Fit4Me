import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function makeSupabase() {
  return createClient(
    process.env['Fit4Me_SUPABASE_URL'] ?? '',
    process.env['Fit4Me_SUPABASE_SERVICE_ROLE_KEY'] ?? '',
  );
}

/** Verify JWT from Authorization header. Returns userId or sends 401 and returns null. */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ userId: string } | null> {
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data: { user }, error } = await makeSupabase().auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
  return { userId: user.id };
}

/** Guard payload size — 5 MB max. Returns false and sends 413 if too large. */
export function sizeGuard(req: VercelRequest, res: VercelResponse): boolean {
  const len = req.headers['content-length'];
  if (len && parseInt(len) > 5_000_000) {
    res.status(413).json({ error: 'Payload too large' });
    return false;
  }
  return true;
}

/** Handle CORS preflight and set headers. Returns true if the request was an OPTIONS preflight. */
export function cors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = process.env['Fit4Me_APP_URL'] ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Figma-Token');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
