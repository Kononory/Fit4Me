import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Shared helpers ────────────────────────────────────────────────────────────

interface FigmaNode {
  id: string; name: string; type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  characters?: string;
  style?: { fontSize?: number; lineHeightPx?: number };
  children?: FigmaNode[];
}
interface FigmaFile {
  document: FigmaNode;
  err?: string;
}
interface Element {
  id: string; name: string; type: string;
  x: number; y: number; w: number; h: number;
  chars?: string; fontSize?: number; lineHeightPx?: number;
}

function flattenNodes(node: FigmaNode, frameBox: { x: number; y: number }, isRoot: boolean, out: Element[], depth: number) {
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
  if (depth < 5) for (const child of node.children ?? []) flattenNodes(child, frameBox, false, out, depth + 1);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query as Record<string, string>;
  const figmaToken = req.headers['x-figma-token'] as string | undefined
    ?? process.env['Fit4Me_FIGMA_TOKEN_API_KEY'] ?? '';

  if (!figmaToken) return res.status(400).json({ error: 'Missing Figma token' });

  // ── type=preview — single frame thumbnail ─────────────────────────────────
  if (q.type === 'preview') {
    if (!q.fileKey || !q.nodeId) return res.status(400).json({ error: 'Missing fileKey or nodeId' });
    const url = `https://api.figma.com/v1/images/${q.fileKey}?ids=${encodeURIComponent(q.nodeId)}&format=png&scale=2`;
    let r: Response;
    try { r = await fetch(url, { headers: { 'X-Figma-Token': figmaToken } }); }
    catch (e) { return res.status(502).json({ error: String(e) }); }
    const data = await r.json() as { err?: string; images?: Record<string, string | null> };
    if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma API error' });
    const imgUrl = data.images?.[q.nodeId];
    if (!imgUrl) return res.status(404).json({ error: 'Node not found or not exportable' });
    return res.status(200).json({ url: imgUrl });
  }

  // ── type=batch — batch thumbnails ─────────────────────────────────────────
  if (q.type === 'batch') {
    if (!q.fileKey || !q.nodeIds) return res.status(400).json({ error: 'Missing fileKey or nodeIds' });
    const url = `https://api.figma.com/v1/images/${q.fileKey}?ids=${encodeURIComponent(q.nodeIds)}&format=png&scale=2`;
    let r: Response;
    try { r = await fetch(url, { headers: { 'X-Figma-Token': figmaToken } }); }
    catch (e) { return res.status(502).json({ error: String(e) }); }
    const data = await r.json() as { err?: string; images?: Record<string, string | null> };
    if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma API error' });
    const urls: Record<string, string> = {};
    for (const [id, imgUrl] of Object.entries(data.images ?? {})) { if (imgUrl) urls[id] = imgUrl; }
    return res.status(200).json({ urls });
  }

  // ── type=nodes — frame element tree for hit-testing ───────────────────────
  if (q.type === 'nodes') {
    if (!q.fileKey || !q.nodeId) return res.status(400).json({ error: 'Missing fileKey or nodeId' });
    const url = `https://api.figma.com/v1/files/${q.fileKey}/nodes?ids=${encodeURIComponent(q.nodeId)}&depth=5`;
    let r: Response;
    try { r = await fetch(url, { headers: { 'X-Figma-Token': figmaToken } }); }
    catch (e) { return res.status(502).json({ error: String(e) }); }
    const data = await r.json() as { err?: string; nodes?: Record<string, { document: FigmaNode }> };
    if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma error' });
    const doc = data.nodes?.[q.nodeId]?.document;
    if (!doc?.absoluteBoundingBox) return res.status(404).json({ error: 'Node not found' });
    const frameBox = doc.absoluteBoundingBox;
    const elements: Element[] = [];
    flattenNodes(doc, frameBox, true, elements, 0);
    return res.status(200).json({ frameW: frameBox.width, frameH: frameBox.height, elements });
  }

  // ── type=page — file page structure ──────────────────────────────────────
  if (q.type === 'page') {
    if (!q.fileKey) return res.status(400).json({ error: 'Missing fileKey' });
    const url = `https://api.figma.com/v1/files/${q.fileKey}?depth=3`;
    let r: Response;
    try { r = await fetch(url, { headers: { 'X-Figma-Token': figmaToken } }); }
    catch (e) { return res.status(502).json({ error: String(e) }); }
    const data = await r.json() as FigmaFile;
    if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma API error' });
    const FRAME_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET'];
    const pages = (data.document.children ?? [])
      .filter(p => p.type === 'CANVAS')
      .map(page => ({
        id: page.id, name: page.name,
        frames: (page.children ?? []).filter(c => FRAME_TYPES.includes(c.type)).map(c => ({ id: c.id, name: c.name })),
        sections: (page.children ?? [])
          .filter(c => c.type === 'SECTION')
          .map((sec, i) => ({
            id: sec.id, name: sec.name, order: i,
            frames: (sec.children ?? []).filter(c => FRAME_TYPES.includes(c.type)).map(c => ({ id: c.id, name: c.name })),
          }))
          .filter(s => s.frames.length > 0),
      }));
    return res.status(200).json({ pages });
  }

  return res.status(400).json({ error: 'Missing or invalid type param (preview|batch|nodes|page)' });
}
