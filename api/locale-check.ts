import type { VercelRequest, VercelResponse } from '@vercel/node';
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
  const figmaToken = process.env['Fit4Me_FIGMA_TOKEN_API_KEY'] ?? token ?? '';
  if (!fileKey || !nodeId || !figmaToken || !Array.isArray(locales) || locales.length === 0)
    return res.status(400).json({ error: 'Missing params' });

  // 1. Fetch Figma node tree with text properties
  const figmaUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=6`;
  let r: Response;
  try {
    r = await fetch(figmaUrl, { headers: { 'X-Figma-Token': figmaToken } });
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

  // 2. Translate all strings to all locales — DeepL primary, Gemini fallback on quota/rate-limit
  const deeplKey = process.env['Fit4Me_DEEPL_API_KEY'] ?? process.env['DEEPL_API_KEY'];
  const geminiKey = process.env['Fit4Me_GEMINI_API_KEY'];
  if (!deeplKey && !geminiKey) return res.status(500).json({ error: 'No translation API key configured' });

  // DeepL target language code mapping (free API uses specific codes for some languages)
  const DEEPL_CODE: Record<string, string> = {
    ZH: 'ZH-HANS', PT: 'PT-BR', EN: 'EN-US',
  };
  // Languages not supported by DeepL — will keep original text
  const DEEPL_UNSUPPORTED = new Set(['HE']);

  const nodeIds = textEls.map(t => t.id);
  const texts   = textEls.map(t => t.chars);

  async function translateWithGemini(locale: string): Promise<Record<string, string>> {
    const prompt = `Translate each UI string to ${locale}. Return only a JSON array of translated strings in the same order. No explanation.\n\n${JSON.stringify(texts)}`;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${locale}: HTTP ${r.status}`);
    const body = await r.json() as { candidates: { content: { parts: { text: string }[] } }[] };
    const translated: string[] = JSON.parse(body.candidates[0].content.parts[0].text);
    return Object.fromEntries(nodeIds.map((id, i) => [id, translated[i] ?? texts[i]]));
  }

  async function translateLocale(locale: string): Promise<Record<string, string>> {
    const upper = locale.toUpperCase();

    // HE: DeepL doesn't support it — use Gemini if available, else keep original
    if (DEEPL_UNSUPPORTED.has(upper)) {
      if (geminiKey) return translateWithGemini(locale);
      return Object.fromEntries(nodeIds.map((id, i) => [id, texts[i]]));
    }

    // No DeepL key at all — go straight to Gemini
    if (!deeplKey) return translateWithGemini(locale);

    const targetLang = DEEPL_CODE[upper] ?? upper;
    const params = new URLSearchParams({ target_lang: targetLang });
    for (const t of texts) params.append('text', t);

    const r = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${deeplKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    // Quota exceeded (456) or rate limit (429) — fall back to Gemini
    if ((r.status === 456 || r.status === 429) && geminiKey) return translateWithGemini(locale);

    if (!r.ok) throw new Error(`DeepL ${locale}: HTTP ${r.status}`);
    const body = await r.json() as { translations: { text: string }[] };
    return Object.fromEntries(nodeIds.map((id, i) => [id, body.translations[i]?.text ?? texts[i]]));
  }

  let translations: Record<string, Record<string, string>> = {};
  try {
    const results = await Promise.all(locales.map(l => translateLocale(l).then(r => [l, r] as const)));
    translations = Object.fromEntries(results);
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
