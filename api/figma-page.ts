import type { VercelRequest, VercelResponse } from '@vercel/node';

interface FigmaChild {
  id: string;
  name: string;
  type: string;
  children?: FigmaChild[];
}

interface FigmaFile {
  document: FigmaChild;
  err?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { fileKey, token } = req.query as Record<string, string>;
  const figmaToken = process.env['fit4me_FIGMA_TOKEN_API_KEY'] ?? token ?? '';
  if (!fileKey || !figmaToken)
    return res.status(400).json({ error: 'Missing params: fileKey, token' });

  const url = `https://api.figma.com/v1/files/${fileKey}?depth=2`;
  let r: Response;
  try {
    r = await fetch(url, { headers: { 'X-Figma-Token': figmaToken } });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }

  const data = await r.json() as FigmaFile;
  if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma API error' });

  const pages = (data.document.children ?? [])
    .filter(p => p.type === 'CANVAS')
    .map(page => ({
      id: page.id,
      name: page.name,
      frames: (page.children ?? [])
        .filter(c => ['FRAME', 'COMPONENT', 'COMPONENT_SET'].includes(c.type))
        .map(c => ({ id: c.id, name: c.name })),
    }));

  return res.status(200).json({ pages });
}
