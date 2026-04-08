const PAT_KEY = 'figma_pat';
const TTL = 25 * 60 * 1000; // 25 min — Figma signed URLs expire ~30 min
const cache = new Map<string, { url: string; ts: number }>();
const nodeCache = new Map<string, { data: FrameData; ts: number }>();

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

  const params = new URLSearchParams({ fileKey, nodeId, token });
  const res = await fetch(`/api/figma?${params}`);
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

  const params = new URLSearchParams({ fileKey, nodeId, token });
  const res = await fetch(`/api/figma-nodes?${params}`);
  const body = await res.json() as FrameData & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

  nodeCache.set(cacheKey, { data: body, ts: Date.now() });
  return body;
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
