import type { Flow, FlowMeta } from './types';
import { cloneTree } from './tree';

// ── Local storage ─────────────────────────────────────────────────────────────

const FLOWS_KEY  = 'fit4me_flows_v1';
const ACTIVE_KEY = 'fit4me_active_v1';

export function saveFlowsLocal(flows: Flow[]): void {
  localStorage.setItem(FLOWS_KEY, JSON.stringify(
    flows.map(f => ({ ...f, tree: cloneTree(f.tree) }))
  ));
}

export function loadFlowsLocal(): Flow[] | null {
  try {
    const raw = localStorage.getItem(FLOWS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Flow[];
  } catch { return null; }
}

export function saveActiveLocal(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function loadActiveLocal(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function clearLocal(): void {
  localStorage.removeItem(FLOWS_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  // backward-compat: remove old single-flow key
  localStorage.removeItem('fit4me_tree_v1');
}

// ── Remote: save one flow ─────────────────────────────────────────────────────

export async function saveFlowRemote(flow: Flow): Promise<string | null> {
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flowId:  flow.id,
        name:    flow.name,
        tree:    cloneTree(flow.tree),
        savedAt: new Date().toISOString(),
      }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({})) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch (e) { return String(e); }
}

// ── Remote: load all flows ────────────────────────────────────────────────────

export async function loadFlowsRemote(): Promise<Flow[] | null> {
  try {
    const res = await fetch('/api/load');
    if (!res.ok) return null;
    return await res.json() as Flow[];
  } catch { return null; }
}

// ── Remote: delete a flow ─────────────────────────────────────────────────────

export async function deleteFlowRemote(id: string): Promise<void> {
  try {
    await fetch(`/api/delete?flowId=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch { /* silent */ }
}

// ── Remote: list flow metadata (lightweight) ──────────────────────────────────

export async function listFlowsRemote(): Promise<FlowMeta[] | null> {
  try {
    const res = await fetch('/api/flows');
    if (!res.ok) return null;
    return await res.json() as FlowMeta[];
  } catch { return null; }
}
