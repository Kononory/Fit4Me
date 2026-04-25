import type { Flow, FlowMeta } from './types';
import { cloneTree } from './tree';
import { getAuthHeaders } from './lib/supabase';

// ── Legacy migration: figmaRef → screens[0] ───────────────────────────────────
// Nodes stored before the screens unification have figmaRef: string.
// Convert them on load so the rest of the app only needs to handle screens[].
function migrateNode(node: any): void {
  if (node.figmaRef) {
    if (!node.screens?.length) {
      node.screens = [{ ref: node.figmaRef, name: '', order: 1 }];
    }
    delete node.figmaRef;
  }
  for (const c of node.c ?? []) migrateNode(c);
  if (node.innerFlow) migrateNode(node.innerFlow);
}

function migrateFlows(flows: Flow[]): Flow[] {
  for (const flow of flows) migrateNode(flow.tree as any);
  return flows;
}

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
    return migrateFlows(JSON.parse(raw) as Flow[]);
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
    const auth = await getAuthHeaders();
    if (!('Authorization' in auth)) return null; // anonymous — skip
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        flowId:         flow.id,
        name:           flow.name,
        tree:           cloneTree(flow.tree),
        crossEdges:     flow.crossEdges     ?? [],
        retentionData:  flow.retentionData  ?? [],
        eventEdges:     flow.eventEdges     ?? [],
        eventPositions: flow.eventPositions ?? {},
        savedAt:        new Date().toISOString(),
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
    const auth = await getAuthHeaders();
    if (!('Authorization' in auth)) return null; // anonymous — skip
    const res = await fetch('/api/load', { headers: auth });
    if (!res.ok) return null;
    return migrateFlows(await res.json() as Flow[]);
  } catch { return null; }
}

// ── Remote: delete a flow ─────────────────────────────────────────────────────

export async function deleteFlowRemote(id: string): Promise<void> {
  try {
    const auth = await getAuthHeaders();
    if (!('Authorization' in auth)) return; // anonymous — skip
    await fetch(`/api/delete?flowId=${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth });
  } catch { /* silent */ }
}

// ── Remote: list flow metadata (lightweight) ──────────────────────────────────

export async function listFlowsRemote(): Promise<FlowMeta[] | null> {
  try {
    const auth = await getAuthHeaders();
    if (!('Authorization' in auth)) return null; // anonymous — skip
    const res = await fetch('/api/flows', { headers: auth });
    if (!res.ok) return null;
    return await res.json() as FlowMeta[];
  } catch { return null; }
}

// ── Remote: claim local flows into authenticated account ──────────────────────

export async function claimFlowsRemote(flows: Flow[]): Promise<boolean> {
  try {
    const auth = await getAuthHeaders();
    if (!('Authorization' in auth)) return false;
    const res = await fetch('/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ flows: flows.map(f => ({
        flowId:         f.id,
        name:           f.name,
        tree:           cloneTree(f.tree),
        crossEdges:     f.crossEdges     ?? [],
        retentionData:  f.retentionData  ?? [],
        eventEdges:     f.eventEdges     ?? [],
        eventPositions: f.eventPositions ?? {},
      })) }),
    });
    return res.ok;
  } catch { return false; }
}
