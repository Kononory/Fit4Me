import type { TreeNode, SavePayload } from './types';
import { cloneTree } from './tree';

const LOCAL_KEY = 'fit4me_tree_v1';

/** Save tree to localStorage (immediate, always works). */
export function saveLocal(tree: TreeNode): void {
  const payload: SavePayload = { tree: cloneTree(tree), savedAt: new Date().toISOString() };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
}

/** Load tree from localStorage. Returns null if nothing saved. */
export function loadLocal(): TreeNode | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const payload: SavePayload = JSON.parse(raw);
    return payload.tree ?? null;
  } catch {
    return null;
  }
}

/** Save tree to the backend API. Returns true on success. */
export async function saveRemote(tree: TreeNode): Promise<boolean> {
  try {
    const payload: SavePayload = { tree: cloneTree(tree), savedAt: new Date().toISOString() };
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Load tree from the backend API. Returns null on failure. */
export async function loadRemote(): Promise<TreeNode | null> {
  try {
    const res = await fetch('/api/load');
    if (!res.ok) return null;
    const payload: SavePayload = await res.json();
    return payload.tree ?? null;
  } catch {
    return null;
  }
}
