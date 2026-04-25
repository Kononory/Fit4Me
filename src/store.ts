import { create } from 'zustand';
import type { Flow, TreeNode, DragState } from './types';
import type { User } from './lib/supabase';
import { cloneTree } from './tree';
import { DEFAULT_TREE } from './data';
import { saveFlowsLocal, loadFlowsLocal, saveActiveLocal, loadActiveLocal, saveFlowRemote } from './storage';

// ── Debounced cloud save ───────────────────────────────────────────────────────
const cloudSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleCloudSave(flow: Flow) {
  // Skip cloud save for anonymous users
  if (!useStore.getState().user) return;
  const existing = cloudSaveTimers.get(flow.id);
  if (existing) clearTimeout(existing);
  useStore.getState().setCloudSavePending(true);
  cloudSaveTimers.set(flow.id, setTimeout(() => {
    saveFlowRemote(flow).finally(() => {
      if (cloudSaveTimers.size === 0) useStore.getState().setCloudSavePending(false);
    });
    cloudSaveTimers.delete(flow.id);
    if (cloudSaveTimers.size === 0) useStore.getState().setCloudSavePending(false);
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
  cloudSavePending: boolean;
  setCloudSavePending: (v: boolean) => void;
  hotkeysOpen: boolean;
  setHotkeysOpen: (v: boolean) => void;
  figmaTokenOpen: boolean;
  setFigmaTokenOpen: (v: boolean) => void;
  figmaImportOpen: boolean;
  setFigmaImportOpen: (v: boolean) => void;
  localeCheckOpen: boolean;
  setLocaleCheckOpen: (v: boolean) => void;
  userFlowNodeId: string | null;
  setUserFlowNodeId: (id: string | null) => void;
  carouselNodeId: string | null;
  setCarouselNodeId: (id: string | null) => void;
  leftSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: (v: boolean) => void;
  rightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: (v: boolean) => void;
  overlapCount: number;
  setOverlapCount: (n: number) => void;

  // ── Auth ───────────────────────────────────────────────────────────
  user: User | null;
  authLoading: boolean;
  authModalOpen: boolean;
  setUser: (u: User | null) => void;
  setAuthLoading: (v: boolean) => void;
  setAuthModalOpen: (v: boolean) => void;
}

const LS_LEFT_COLLAPSED  = 'fit4me.leftSidebarCollapsed';
const LS_RIGHT_COLLAPSED = 'fit4me.rightSidebarCollapsed';

function readLS(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeLS(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ }
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
    setActiveLayer: (activeLayer) => set(s => ({
      activeLayer,
      carouselNodeId: activeLayer === 'nodes' ? s.carouselNodeId : null,
    })),
    animateEdgesNext: false,
    triggerEdgeAnim: () => set({ animateEdgesNext: true }),
    clearEdgeAnim: () => set({ animateEdgesNext: false }),
    zoom: 1,
    setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.25, zoom)) }),
    evmZoom: 1,
    setEvmZoom: (evmZoom) => set({ evmZoom: Math.min(3, Math.max(0.25, evmZoom)) }),
    freeMode: false,
    setFreeMode: (freeMode) => set({ freeMode }),
    cloudSavePending: false,
    setCloudSavePending: (cloudSavePending) => set({ cloudSavePending }),
    hotkeysOpen: false,
    setHotkeysOpen: (hotkeysOpen) => set({ hotkeysOpen }),
    figmaTokenOpen: false,
    setFigmaTokenOpen: (figmaTokenOpen) => set({ figmaTokenOpen }),
    figmaImportOpen: false,
    setFigmaImportOpen: (figmaImportOpen) => set({ figmaImportOpen }),
    localeCheckOpen: false,
    setLocaleCheckOpen: (localeCheckOpen) => set({ localeCheckOpen }),
    userFlowNodeId: null,
    setUserFlowNodeId: (userFlowNodeId) => set({ userFlowNodeId }),
    carouselNodeId: null,
    setCarouselNodeId: (carouselNodeId) => set({ carouselNodeId }),
    leftSidebarCollapsed: readLS(LS_LEFT_COLLAPSED),
    setLeftSidebarCollapsed: (v) => { writeLS(LS_LEFT_COLLAPSED, v); set({ leftSidebarCollapsed: v }); },
    rightSidebarCollapsed: readLS(LS_RIGHT_COLLAPSED),
    setRightSidebarCollapsed: (v) => { writeLS(LS_RIGHT_COLLAPSED, v); set({ rightSidebarCollapsed: v }); },
    overlapCount: 0,
    setOverlapCount: (overlapCount) => set({ overlapCount }),

    // ── Auth ─────────────────────────────────────────────────────────
    user: null,
    authLoading: true,
    authModalOpen: false,
    setUser: (user) => set({ user }),
    setAuthLoading: (authLoading) => set({ authLoading }),
    setAuthModalOpen: (authModalOpen) => set({ authModalOpen }),
  };
});
