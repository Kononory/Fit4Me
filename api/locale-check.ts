import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import type { LocaleStatus, LocaleResult, TextNodeResult, LocaleCheckResponse } from '../src/lib/locale-types';

// Average character width as fraction of font size, by locale script
const CHAR_RATIO: Record<string, number> = {
  ar: 0.45, he: 0.45, fa: 0.45, ur: 0.45,  // Arabic script
  zh: 1.0,  ja: 1.0,  ko: 1.0,             // CJK full-width
};
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

function charRatio(locale: string): number {
  return CHAR_RATIO[locale.toLowerCase()] ?? 0.55;
}

function linesNeeded(text: string, charsPerLine: number): number {
  return Math.max(1, text.split('\n').reduce((sum, para) =>
    sum + (para.length === 0 ? 1 : Math.ceil(para.length / charsPerLine)), 0));
}

function rectsOverlap(ax: number, ay: number, aw: number, ah: number,
                      bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

interface FigmaNode {
  id: string; name: string; type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  characters?: string;
  style?: { fontSize?: number; lineHeightPx?: number; textAutoResize?: string };
  children?: FigmaNode[];
}

interface TextEl {
  id: string; name: string;
  x: number; y: number; w: number; h: number;
  chars: string; fontSize: number; lineHeightPx: number;
}

interface AnyEl { x: number; y: number; w: number; h: number; name: string; }

function collectElements(
  node: FigmaNode,
  frameBox: { x: number; y: number },
  textEls: TextEl[],
  allEls: AnyEl[],
  isRoot: boolean,
  depth: number,
) {
  const bb = node.absoluteBoundingBox;
  if (!isRoot && bb) {
    const x = bb.x - frameBox.x;
    const y = bb.y - frameBox.y;
    if (node.type === 'TEXT' && node.characters) {
      const s = node.style ?? {};
      const fontSize = s.fontSize ?? 14;
      textEls.push({
        id: node.id, name: node.name, chars: node.characters,
        x, y, w: bb.width, h: bb.height,
        fontSize, lineHeightPx: s.lineHeightPx ?? fontSize * 1.4,
      });
    } else {
      allEls.push({ x, y, w: bb.width, h: bb.height, name: node.name });
    }
  }
  if (depth < 6) {
    for (const c of node.children ?? []) collectElements(c, frameBox, textEls, allEls, false, depth + 1);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileKey, nodeId, token, locales } = req.body ?? {};
  if (!fileKey || !nodeId || !token || !Array.isArray(locales) || locales.length === 0)
    return res.status(400).json({ error: 'Missing params' });

  // 1. Fetch Figma node tree with text properties
  const figmaUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=6`;
  let r: Response;
  try {
    r = await fetch(figmaUrl, { headers: { 'X-Figma-Token': token } });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }

  const data = await r.json() as { err?: string; nodes?: Record<string, { document: FigmaNode }> };
  if (!r.ok) return res.status(r.status).json({ error: data.err ?? 'Figma error' });

  const doc = data.nodes?.[nodeId]?.document;
  if (!doc?.absoluteBoundingBox) return res.status(404).json({ error: 'Node not found' });

  const frameBox = doc.absoluteBoundingBox;
  const textEls: TextEl[] = [];
  const allEls: AnyEl[] = [];
  collectElements(doc, frameBox, textEls, allEls, true, 0);

  if (textEls.length === 0)
    return res.status(200).json({ frameW: frameBox.width, frameH: frameBox.height, results: [] });

  // 2. Translate all strings to all locales in one Anthropic call
  const apiKey = process.env['Fit4Me_ANTHROPIC_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });
  const strings: Record<string, string> = {};
  for (const t of textEls) strings[t.id] = t.chars;

  const prompt = `Translate these UI strings into the following locales: ${locales.join(', ')}.
Return ONLY a valid JSON object, no markdown, no explanation.
Format: { "LOCALE_CODE": { "NODE_ID": "translated text" } }
Use the exact locale codes provided as keys.
Strings to translate: ${JSON.stringify(strings)}`;

  let translations: Record<string, Record<string, string>> = {};
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = (msg.content[0] as { text: string }).text.trim();
    // Strip markdown fences if model wraps response
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    translations = JSON.parse(cleaned);
  } catch (e) {
    return res.status(500).json({ error: `Translation failed: ${String(e)}` });
  }

  // 3. Analyze each text element × locale
  const results: TextNodeResult[] = textEls.map(t => {
    const localeResults: Record<string, LocaleResult> = {};

    for (const locale of locales) {
      const translated = translations[locale]?.[t.id] ?? t.chars;
      const isRtl = RTL_LOCALES.has(locale.toLowerCase());
      const charsPerLine = Math.max(1, Math.floor(t.w / (t.fontSize * charRatio(locale))));
      const lines = linesNeeded(translated, charsPerLine);
      const expandedH = lines * t.lineHeightPx;

      if (expandedH <= t.h) {
        localeResults[locale] = { translated, status: 'fit', isRtl };
        continue;
      }

      // Frame boundary check
      if (t.y + expandedH > frameBox.height) {
        localeResults[locale] = { translated, status: 'frame_overflow', expandedH, isRtl };
        continue;
      }

      // Sibling collision check
      const collisions = allEls.filter(el =>
        rectsOverlap(t.x, t.y, t.w, expandedH, el.x, el.y, el.w, el.h)
      );
      if (collisions.length > 0) {
        localeResults[locale] = {
          translated, status: 'collision', expandedH,
          collidesWith: collisions.map(e => e.name), isRtl,
        };
        continue;
      }

      localeResults[locale] = { translated, status: 'overflow', expandedH, isRtl };
    }

    return { id: t.id, name: t.name, original: t.chars, x: t.x, y: t.y, w: t.w, h: t.h, locales: localeResults };
  });

  return res.status(200).json({ frameW: frameBox.width, frameH: frameBox.height, results } satisfies LocaleCheckResponse);
}
