import type { VercelRequest, VercelResponse } from '@vercel/node';

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  characters?: string;
  style?: {
    fontSize?: number;
    lineHeightPx?: number;
    fontFamily?: string;
    textAutoResize?: string;
  };
  children?: FigmaNode[];
}

interface Element {
  id: string; name: string; type: string;
  x: number; y: number; w: number; h: number;
  // Text-only fields
  chars?: string;
  fontSize?: number;
  lineHeightPx?: number;
}

function flatten(
  node: FigmaNode,
  frameBox: { x: number; y: number },
  isRoot: boolean,
  out: Element[],
  depth: number,
) {
  if (!isRoot && node.absoluteBoundingBox) {
    const el: Element = {
      id: node.id, name: node.name, type: node.type,
      x: node.absoluteBoundingBox.x - frameBox.x,
      y: node.absoluteBoundingBox.y - frameBox.y,
      w: node.absoluteBoundingBox.width,
      h: node.absoluteBoundingBox.height,
    };
    if (node.type === 'TEXT' && node.characters) {
      el.chars = node.characters;
      el.fontSize = node.style?.fontSize ?? 14;
      el.lineHeightPx = node.style?.lineHeightPx ?? (el.fontSize * 1.4);
    }
    out.push(el);
  }
  if (depth < 5) {
    for (const child of node.children ?? []) {
      flatten(child, frameBox, false, out, depth + 1);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { fileKey, nodeId, token } = req.query as Record<string, string>;
  const figmaToken = process.env['Fit4Me_FIGMA_TOKEN_API_KEY'] ?? token ?? '';
  if (!fileKey || !nodeId || !figmaToken)
    return res.status(400).json({ error: 'Missing params' });

  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=5`;
  let r: Response;
  try {
    r = await fetch(url, { headers: { 'X-Figma-Token': figmaToken } });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }

  const data = await r.json() as {
    err?: string;
    nodes?: Record<string, { document: FigmaNode }>;
  };
  if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma error' });

  const doc = data.nodes?.[nodeId]?.document;
  if (!doc?.absoluteBoundingBox)
    return res.status(404).json({ error: 'Node not found' });

  const frameBox = doc.absoluteBoundingBox;
  const elements: Element[] = [];
  flatten(doc, frameBox, true, elements, 0);

  return res.status(200).json({ frameW: frameBox.width, frameH: frameBox.height, elements });
}
