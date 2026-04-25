import type { ScreenRef } from '../types';

const PAT_KEY = 'figma_pat';
const TTL = 25 * 60 * 1000; // 25 min — Figma signed URLs expire ~30 min
const cache = new Map<string, { url: string; ts: number }>();
const nodeCache = new Map<string, { data: FrameData; ts: number }>();

/** Figma frame naming pattern: "Group Name / 01 – Screen Name" */
export const SCREEN_PAT = /^(.+?)\s*\/\s*(\d+)\s*[–\-]\s*(.+)$/;

export interface RawFrame { id: string; name: string; }
export interface SectionResult { id: string; name: string; order: number; frames: RawFrame[]; }
export interface PageResult { id: string; name: string; frames: RawFrame[]; sections?: SectionResult[]; }

/** Saved import config — stored in localStorage per flow, keyed by flow ID */
export interface FigmaImportConfig {
  url: string;        // original URL pasted (for display + pre-fill)
  fileKey: string;
  pageId: string;
  pageName: string;
  groupActions: Record<string, string>; // groupName → ImportAction
}

const IMPORT_CFG_KEY = (flowId: string) => `figma_import_cfg_${flowId}`;

export function getFigmaImportConfig(flowId: string): FigmaImportConfig | null {
  try {
    const raw = localStorage.getItem(IMPORT_CFG_KEY(flowId));
    return raw ? JSON.parse(raw) as FigmaImportConfig : null;
  } catch { return null; }
}

export function setFigmaImportConfig(flowId: string, cfg: FigmaImportConfig): void {
  localStorage.setItem(IMPORT_CFG_KEY(flowId), JSON.stringify(cfg));
}

export interface FigmaElement {
  id: string; name: string; type: string;
  x: number; y: number; w: number; h: number;
}
export interface FrameData {
  frameW: number; frameH: number;
  elements: FigmaElement[];
}

export const getPAT = (): string => localStorage.getItem(PAT_KEY) ?? '';
export const setPAT = (t: string): void => {
  if (t.trim()) localStorage.setItem(PAT_KEY, t.trim());
  else localStorage.removeItem(PAT_KEY);
};

/** Encode fileKey + nodeId into a single storage string */
export const encodeRef = (fileKey: string, nodeId: string): string =>
  `${fileKey}||${nodeId}`;

/** Decode storage string back to parts */
export const decodeRef = (ref: string): { fileKey: string; nodeId: string } | null => {
  const i = ref.indexOf('||');
  if (i < 0) return null;
  return { fileKey: ref.slice(0, i), nodeId: ref.slice(i + 2) };
};

/**
 * Parse a full Figma URL or a raw `fileKey||nodeId` string.
 * Returns null if unrecognised.
 */
export function parseFigmaInput(raw: string): { fileKey: string; nodeId: string } | null {
  const s = raw.trim();
  // Full URL: node-id param uses hyphens (1-23) or percent-encoded colons (%3A)
  const m = s.match(
    /figma\.com\/(?:design|file)\/([A-Za-z0-9_-]+)[^?]*\?[^#]*node-id=([0-9]+[-]?[0-9]*|[0-9]+%3A[0-9]+)/i,
  );
  if (m) {
    const nodeId = decodeURIComponent(m[2]).replace('-', ':');
    return { fileKey: m[1], nodeId };
  }
  // Already encoded
  if (s.includes('||')) return decodeRef(s);
  return null;
}

/** Fetch Figma frame preview URL via our proxy, with TTL cache */
export async function fetchPreviewUrl(fileKey: string, nodeId: string): Promise<string> {
  const cacheKey = `${fileKey}:${nodeId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL) return hit.url;

  const token = getPAT();
  if (!token) throw new Error('no_pat');

  const params = new URLSearchParams({ fileKey, nodeId });
  const res = await fetch(`/api/figma?${params}`, { headers: { 'X-Figma-Token': token } });
  const body = await res.json() as { url?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

  cache.set(cacheKey, { url: body.url!, ts: Date.now() });
  return body.url!;
}

/** Fetch Figma frame element tree (for hit-testing on click). Cached 5 min. */
export async function fetchFrameElements(fileKey: string, nodeId: string): Promise<FrameData> {
  const cacheKey = `${fileKey}:${nodeId}`;
  const hit = nodeCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.data;

  const token = getPAT();
  if (!token) throw new Error('no_pat');

  const params = new URLSearchParams({ fileKey, nodeId });
  const res = await fetch(`/api/figma-nodes?${params}`, { headers: { 'X-Figma-Token': token } });
  const body = await res.json() as FrameData & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

  nodeCache.set(cacheKey, { data: body, ts: Date.now() });
  return body;
}

/**
 * Extract just the fileKey from a Figma design URL.
 * Accepts any figma.com/design/:fileKey/... URL, with or without node-id.
 */
export function parseFigmaFileKey(raw: string): string | null {
  const m = raw.trim().match(/figma\.com\/(?:design|file)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

/**
 * Group raw Figma frames by the "Group / 01 – Name" naming convention.
 * Frames that don't match the pattern are silently skipped.
 */
export function parseFrameGroups(frames: RawFrame[], fileKey: string): Map<string, ScreenRef[]> {
  const groups = new Map<string, ScreenRef[]>();
  for (const f of frames) {
    const m = f.name.match(SCREEN_PAT);
    if (!m) continue;
    const [, groupRaw, orderStr, screenRaw] = m;
    const key = groupRaw.trim();
    const order = parseInt(orderStr, 10);
    const list = groups.get(key) ?? [];
    list.push({
      ref: encodeRef(fileKey, f.id),
      name: `${orderStr.padStart(2, '0')} – ${screenRaw.trim()}`,
      order,
    });
    groups.set(key, list);
  }
  for (const list of groups.values()) list.sort((a, b) => a.order - b.order);
  return groups;
}

/**
 * Build groups from Figma sections. Each section becomes a node;
 * frames inside are its screens, ordered by their position in the section.
 */
export function parseSectionGroups(sections: SectionResult[], fileKey: string): Map<string, ScreenRef[]> {
  const groups = new Map<string, ScreenRef[]>();
  for (const sec of sections) {
    const screens = sec.frames.map((f, i) => ({
      ref: encodeRef(fileKey, f.id),
      name: f.name,
      order: i,
    }));
    groups.set(sec.name, screens);
  }
  return groups;
}

/** Fetch all pages + their top-level frames from a Figma file. */
export async function fetchPageStructure(fileKey: string): Promise<PageResult[]> {
  const token = getPAT();
  if (!token) throw new Error('no_pat');
  const params = new URLSearchParams({ fileKey });
  const res = await fetch(`/api/figma-page?${params}`, { headers: { 'X-Figma-Token': token } });
  const body = await res.json() as { pages?: PageResult[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.pages ?? [];
}

/**
 * Batch-fetch thumbnail URLs for multiple node IDs.
 * Populates the single-url cache so subsequent fetchPreviewUrl calls are instant.
 */
export async function fetchBatchThumbnails(fileKey: string, nodeIds: string[]): Promise<Map<string, string>> {
  if (!nodeIds.length) return new Map();
  const token = getPAT();
  if (!token) throw new Error('no_pat');
  const params = new URLSearchParams({ fileKey, nodeIds: nodeIds.join(',') });
  const res = await fetch(`/api/figma-batch?${params}`, { headers: { 'X-Figma-Token': token } });
  const body = await res.json() as { urls?: Record<string, string>; error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  const result = new Map<string, string>();
  const ts = Date.now();
  for (const [id, url] of Object.entries(body.urls ?? {})) {
    result.set(id, url);
    cache.set(`${fileKey}:${id}`, { url, ts });
  }
  return result;
}

/** Find the most specific Figma element at (px, py) in frame-local coords. */
export function hitTest(elements: FigmaElement[], px: number, py: number): FigmaElement | null {
  const hits = elements.filter(el =>
    px >= el.x && px <= el.x + el.w && py >= el.y && py <= el.y + el.h,
  );
  // Smallest area = most specific
  hits.sort((a, b) => a.w * a.h - b.w * b.h);
  return hits[0] ?? null;
}
