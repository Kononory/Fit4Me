import type { Flow } from './types';
import { cloneTree } from './tree';

/** Encode a flow to a base64 URL-safe string for sharing. */
export function encodeFlow(flow: Flow): string {
  const json = JSON.stringify({ name: flow.name, tree: cloneTree(flow.tree) });
  return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))));
}

/** Decode a shared flow from the URL hash. Returns null if not present or invalid. */
export function decodeSharedFlow(): Flow | null {
  const hash = location.hash;
  if (!hash.startsWith('#share=')) return null;
  try {
    const raw  = atob(hash.slice(7));
    const json = decodeURIComponent(raw.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const data = JSON.parse(json) as { name: string; tree: import('./types').TreeNode };
    location.hash = '';
    return { id: `flow-${Date.now()}`, name: data.name ?? 'Shared Flow', tree: data.tree };
  } catch { return null; }
}
