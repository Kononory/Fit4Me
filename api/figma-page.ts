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
  const figmaToken = process.env['Fit4Me_FIGMA_TOKEN_API_KEY'] ?? token ?? '';
  if (!fileKey || !figmaToken)
    return res.status(400).json({ error: 'Missing params: fileKey, token' });

  const url = `https://api.figma.com/v1/files/${fileKey}?depth=3`;
  let r: Response;
  try {
    r = await fetch(url, { headers: { 'X-Figma-Token': figmaToken } });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }

  const data = await r.json() as FigmaFile;
  if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma API error' });

  const FRAME_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET'];

  const pages = (data.document.children ?? [])
    .filter(p => p.type === 'CANVAS')
    .map(page => ({
      id: page.id,
      name: page.name,
      frames: (page.children ?? [])
        .filter(c => FRAME_TYPES.includes(c.type))
        .map(c => ({ id: c.id, name: c.name })),
      sections: (page.children ?? [])
        .filter(c => c.type === 'SECTION')
        .map((sec, i) => ({
          id: sec.id,
          name: sec.name,
          order: i,
          frames: (sec.children ?? [])
            .filter(c => FRAME_TYPES.includes(c.type))
            .map(c => ({ id: c.id, name: c.name })),
        }))
        .filter(s => s.frames.length > 0),
    }));

  return res.status(200).json({ pages });
}
