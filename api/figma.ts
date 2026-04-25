import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { fileKey, nodeId } = req.query as Record<string, string>;
  const figmaToken = req.headers['x-figma-token'] as string | undefined
    ?? process.env['Fit4Me_FIGMA_TOKEN_API_KEY'] ?? '';
  if (!fileKey || !nodeId || !figmaToken)
    return res.status(400).json({ error: 'Missing params: fileKey, nodeId, or Figma token' });

  const apiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`;

  let r: Response;
  try {
    r = await fetch(apiUrl, { headers: { 'X-Figma-Token': figmaToken } });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }

  const data = await r.json() as { err?: string; images?: Record<string, string | null> };
  if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma API error' });

  const imgUrl = data.images?.[nodeId];
  if (!imgUrl) return res.status(404).json({ error: 'Node not found or not exportable' });

  return res.status(200).json({ url: imgUrl });
}
