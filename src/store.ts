import { create } from 'zustand';
import type { Flow, TreeNode, DragState } from './types';
import { cloneTree } from './tree';
import { DEFAULT_TREE } from './data';
import { saveFlowsLocal, loadFlowsLocal, saveActiveLocal, loadActiveLocal, saveFlowRemote } from './storage';

// ── Debounced cloud save ───────────────────────────────────────────────────────
const cloudSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleCloudSave(flow: Flow) {
  const existing = cloudSaveTimers.get(flow.id);
  if (existing) clearTimeout(existing);
  cloudSaveTimers.set(flow.id, setTimeout(() => {
    saveFlowRemote(flow);
    cloudSaveTimers.delete(flow.id);
  }, 2000));
}

export function flushCloudSaves(flows: Flow[]) {
  for (const [id, timer] of cloudSaveTimers) {
    clearTimeout(timer);
    cloudSaveTimers.delete(id);
    const flow = flows.find(f => f.id === id);
    if (flow) saveFlowRemote(flow);
  }
}

const DEFAULT_FLOW: Flow = {
  id: 'default',
  name: 'Fit4Me',
  tree: cloneTree(DEFAULT_TREE),
};

function initFlows(): { flows: Flow[]; activeId: string } {
  const local = loadFlowsLocal();
  if (local && local.length > 0) {
    const activeId = loadActiveLocal() ?? local[0].id;
    return { flows: local, activeId };
  }
  return { flows: [DEFAULT_FLOW], activeId: DEFAULT_FLOW.id };
}

const DRAG_INIT: DragState = {
  node: null, el: null, ghost: null, target: null,
  sx: 0, sy: 0, cx: 0, cy: 0, on: false, mode: 'swap',
};

interface AppStore {
  // ── Flows ──────────────────────────────────────────────────────────
  flows: Flow[];
  activeId: string;
  getActive: () => Flow;
  setFlows: (flows: Flow[]) => void;
  setActiveId: (id: string) => void;
  updateActiveTree: (tree: TreeNode) => void;

  // ── Selection ──────────────────────────────────────────────────────
  sel: string | null;
  selNodeId: string | null;
  selTick: number;
  setSel: (sel: string | null) => void;
  setSelNodeId: (id: string | null) => void;

  // ── Undo / Redo ────────────────────────────────────────────────────
  undoStacks: Map<string, string[]>;
  redoStacks: Map<string, string[]>;
  pushUndo: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ── Drag ───────────────────────────────────────────────────────────
  drag: DragState;
  setDrag: (patch: Partial<DragState>) => void;
  clearDrag: () => void;

  // ── UI flags ───────────────────────────────────────────────────────
  activeLayer: 'nodes' | 'outline' | 'events';
  setActiveLayer: (layer: 'nodes' | 'outline' | 'events') => void;
  animateEdgesNext: boolean;
  triggerEdgeAnim: () => void;
  clearEdgeAnim: () => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  evmZoom: number;
  setEvmZoom: (zoom: number) => void;
  freeMode: boolean;
  setFreeMode: (v: boolean) => void;
  hotkeysOpen: boolean;
  setHotkeysOpen: (v: boolean) => void;
  figmaTokenOpen: boolean;
  setFigmaTokenOpen: (v: boolean) => void;
  figmaImportOpen: boolean;
  setFigmaImportOpen: (v: boolean) => void;
  userFlowNodeId: string | null;
  setUserFlowNodeId: (id: string | null) => void;
  overlapCount: number;
  setOverlapCount: (n: number) => void;
}

export const useStore = create<AppStore>((set, get) => {
  const { flows, activeId } = initFlows();

  return {
    // ── Flows ────────────────────────────────────────────────────────
    flows,
    activeId,
    getActive: () => {
      const { flows, activeId } = get();
      return flows.find(f => f.id === activeId) ?? flows[0];
    },
    setFlows: (flows) => {
      set({ flows });
      saveFlowsLocal(flows);
      flows.forEach(scheduleCloudSave);
    },
    setActiveId: (activeId) => {
      set({ activeId });
      saveActiveLocal(activeId);
    },
    updateActiveTree: (tree) => {
      const { flows, activeId } = get();
      const updated = flows.map(f => f.id === activeId ? { ...f, tree } : f);
      set({ flows: updated });
      saveFlowsLocal(updated);
      const changed = updated.find(f => f.id === activeId);
      if (changed) scheduleCloudSave(changed);
    },

    // ── Selection ────────────────────────────────────────────────────
    sel: null,
    selNodeId: null,
    selTick: 0,
    setSel: (sel) => set({ sel }),
    setSelNodeId: (selNodeId) => set(s => ({ selNodeId, selTick: selNodeId ? s.selTick + 1 : s.selTick })),

    // ── Undo / Redo ──────────────────────────────────────────────────
    undoStacks: new Map(),
    redoStacks: new Map(),
    pushUndo: () => {
      const { flows, activeId, undoStacks, redoStacks } = get();
      const active = flows.find(f => f.id === activeId) ?? flows[0];
      const stack = undoStacks.get(activeId) ?? [];
      stack.push(JSON.stringify(cloneTree(active.tree)));
      if (stack.length > 60) stack.shift();
      undoStacks.set(activeId, stack);
      redoStacks.set(activeId, []);
      set({ undoStacks: new Map(undoStacks), redoStacks: new Map(redoStacks) });
    },
    undo: () => {
      const { flows, activeId, undoStacks, redoStacks } = get();
      const stack = undoStacks.get(activeId);
      if (!stack?.length) return;
      const active = flows.find(f => f.id === activeId) ?? flows[0];
      const redoStack = redoStacks.get(activeId) ?? [];
      redoStack.push(JSON.stringify(cloneTree(active.tree)));
      redoStacks.set(activeId, redoStack);
      const json = stack.pop()!;
      undoStacks.set(activeId, stack);
      const tree = JSON.parse(json) as TreeNode;
      const updated = flows.map(f => f.id === activeId ? { ...f, tree } : f);
      set({ flows: updated, undoStacks: new Map(undoStacks), redoStacks: new Map(redoStacks) });
      saveFlowsLocal(updated);
      const changed = updated.find(f => f.id === activeId);
      if (changed) scheduleCloudSave(changed);
    },
    redo: () => {
      const { flows, activeId, undoStacks, redoStacks } = get();
      const stack = redoStacks.get(activeId);
      if (!stack?.length) return;
      const active = flows.find(f => f.id === activeId) ?? flows[0];
      const undoStack = undoStacks.get(activeId) ?? [];
      undoStack.push(JSON.stringify(cloneTree(active.tree)));
      undoStacks.set(activeId, undoStack);
      const json = stack.pop()!;
      redoStacks.set(activeId, stack);
      const tree = JSON.parse(json) as TreeNode;
      const updated = flows.map(f => f.id === activeId ? { ...f, tree } : f);
      set({ flows: updated, undoStacks: new Map(undoStacks), redoStacks: new Map(redoStacks) });
      saveFlowsLocal(updated);
      const changed = updated.find(f => f.id === activeId);
      if (changed) scheduleCloudSave(changed);
    },
    canUndo: () => (get().undoStacks.get(get().activeId)?.length ?? 0) > 0,
    canRedo: () => (get().redoStacks.get(get().activeId)?.length ?? 0) > 0,

    // ── Drag ─────────────────────────────────────────────────────────
    drag: { ...DRAG_INIT },
    setDrag: (patch) => set(s => ({ drag: { ...s.drag, ...patch } })),
    clearDrag: () => set({ drag: { ...DRAG_INIT } }),

    // ── UI flags ─────────────────────────────────────────────────────
    activeLayer: 'nodes',
    setActiveLayer: (activeLayer) => set({ activeLayer }),
    animateEdgesNext: false,
    triggerEdgeAnim: () => set({ animateEdgesNext: true }),
    clearEdgeAnim: () => set({ animateEdgesNext: false }),
    zoom: 1,
    setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.25, zoom)) }),
    evmZoom: 1,
    setEvmZoom: (evmZoom) => set({ evmZoom: Math.min(3, Math.max(0.25, evmZoom)) }),
    freeMode: false,
    setFreeMode: (freeMode) => set({ freeMode }),
    hotkeysOpen: false,
    setHotkeysOpen: (hotkeysOpen) => set({ hotkeysOpen }),
    figmaTokenOpen: false,
    setFigmaTokenOpen: (figmaTokenOpen) => set({ figmaTokenOpen }),
    figmaImportOpen: false,
    setFigmaImportOpen: (figmaImportOpen) => set({ figmaImportOpen }),
    userFlowNodeId: null,
    setUserFlowNodeId: (userFlowNodeId) => set({ userFlowNodeId }),
    overlapCount: 0,
    setOverlapCount: (overlapCount) => set({ overlapCount }),
  };
});
