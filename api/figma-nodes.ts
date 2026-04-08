import type { VercelRequest, VercelResponse } from '@vercel/node';

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  children?: FigmaNode[];
}

interface Element {
  id: string; name: string; type: string;
  x: number; y: number; w: number; h: number;
}

function flatten(
  node: FigmaNode,
  frameBox: { x: number; y: number },
  isRoot: boolean,
  out: Element[],
  depth: number,
) {
  if (!isRoot && node.absoluteBoundingBox) {
    out.push({
      id: node.id, name: node.name, type: node.type,
      x: node.absoluteBoundingBox.x - frameBox.x,
      y: node.absoluteBoundingBox.y - frameBox.y,
      w: node.absoluteBoundingBox.width,
      h: node.absoluteBoundingBox.height,
    });
  }
  if (depth < 5) {
    for (const child of node.children ?? []) {
      flatten(child, frameBox, false, out, depth + 1);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { fileKey, nodeId, token } = req.query as Record<string, string>;
  if (!fileKey || !nodeId || !token)
    return res.status(400).json({ error: 'Missing params' });

  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=5`;
  let r: Response;
  try {
    r = await fetch(url, { headers: { 'X-Figma-Token': token } });
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
