import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { fileKey, nodeIds, token } = req.query as Record<string, string>;
  if (!fileKey || !nodeIds || !token)
    return res.status(400).json({ error: 'Missing params: fileKey, nodeIds, token' });

  const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds)}&format=png&scale=2`;
  let r: Response;
  try {
    r = await fetch(url, { headers: { 'X-Figma-Token': token } });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }

  const data = await r.json() as { err?: string; images?: Record<string, string | null> };
  if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma API error' });

  const urls: Record<string, string> = {};
  for (const [id, imgUrl] of Object.entries(data.images ?? {})) {
    if (imgUrl) urls[id] = imgUrl;
  }
  return res.status(200).json({ urls });
}
