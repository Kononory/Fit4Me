import { create } from 'zustand';
import type { Flow, TreeNode, DragState } from './types';
import { cloneTree } from './tree';
import { DEFAULT_TREE } from './data';
import { saveFlowsLocal, loadFlowsLocal, saveActiveLocal, loadActiveLocal } from './storage';

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
  sel: string | null;       // selected branch id
  selNodeId: string | null; // selected node id
  selTick: number;          // increments on every selection — use as animation key
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
  textEditOpen: boolean;
  setTextEditOpen: (open: boolean) => void;
  animateEdgesNext: boolean;
  triggerEdgeAnim: () => void;
  clearEdgeAnim: () => void;
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
    },
    canUndo: () => (get().undoStacks.get(get().activeId)?.length ?? 0) > 0,
    canRedo: () => (get().redoStacks.get(get().activeId)?.length ?? 0) > 0,

    // ── Drag ─────────────────────────────────────────────────────────
    drag: { ...DRAG_INIT },
    setDrag: (patch) => set(s => ({ drag: { ...s.drag, ...patch } })),
    clearDrag: () => set({ drag: { ...DRAG_INIT } }),

    // ── UI flags ─────────────────────────────────────────────────────
    textEditOpen: false,
    setTextEditOpen: (textEditOpen) => set({ textEditOpen }),
    animateEdgesNext: false,
    triggerEdgeAnim: () => set({ animateEdgesNext: true }),
    clearEdgeAnim: () => set({ animateEdgesNext: false }),
  };
});
