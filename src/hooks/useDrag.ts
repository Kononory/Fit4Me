import { useRef, useCallback } from 'react';
import type { TreeNode } from '../types';
import { NW, NH, centerY, topY } from '../layout';
import { swapNodes, addChildNode, reparentNode } from '../tree';
import { useStore } from '../store';

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

const canDrag    = (n: TreeNode) => n.type !== 'root' && n.type !== 'nav';
const canConnect = (n: TreeNode) => n.type !== 'nav';
const canBeChild = (n: TreeNode) => n.type !== 'root' && n.type !== 'nav';

export function useDrag(
  cnvRef: React.RefObject<HTMLDivElement | null>,
  getAllNodes: () => TreeNode[],
  onCommit: () => void,
  onAddAndEdit: (newNode: TreeNode) => void,
  getMultiSel: () => Set<string> = () => new Set(),
  zoom = 1,
) {
  const store = useStore();
  const drRef = useRef({
    node: null as TreeNode | null,
    target: null as TreeNode | null,
    ghost: null as HTMLDivElement | null,
    sx: 0, sy: 0,
    on: false,
    mode: 'swap' as 'swap' | 'connect',
    forceRef: false,
    lastMx: 0, lastMy: 0,
    // Start canvas position of dragged node (for delta calculation)
    startNodeX: 0, startNodeY: 0,
  });

  // ── Ghost + class helpers ─────────────────────────────────────────────────
  const applyDragClasses = useCallback(() => {
    const cnv = cnvRef.current; if (!cnv) return;
    const multiIds = getMultiSel();
    const dr = drRef.current;
    const isGroupDrag = store.freeMode && multiIds.size > 0 && dr.node && multiIds.has(dr.node.id);
    cnv.querySelectorAll<HTMLElement>('.nd').forEach(el => {
      const nid = el.dataset['nid'];
      if (nid === dr.node?.id) {
        el.classList.add('nd-source');
      } else if (isGroupDrag && nid && multiIds.has(nid)) {
        // Keep other selected nodes highlighted during group drag — don't dim them
        el.classList.add('nd-group-drag');
      } else {
        el.classList.add('nd-dim');
      }
    });
  }, [cnvRef, getMultiSel, store]);

  const applyConnectClasses = useCallback(() => {
    const cnv = cnvRef.current; if (!cnv) return;
    cnv.querySelectorAll<HTMLElement>('.nd').forEach(el => {
      if (el.dataset['nid'] === drRef.current.node?.id) el.classList.add('nd-source');
    });
  }, [cnvRef]);

  const clearDragClasses = useCallback(() => {
    const cnv = cnvRef.current; if (!cnv) return;
    cnv.querySelectorAll('.nd-source, .nd-dim, .nd-target, .nd-group-drag').forEach(e =>
      e.classList.remove('nd-source', 'nd-dim', 'nd-target', 'nd-group-drag'),
    );
  }, [cnvRef]);

  const setTarget = useCallback((next: TreeNode | null) => {
    const dr = drRef.current;
    const cnv = cnvRef.current;
    if (dr.target === next) return;

    if (dr.target && cnv) {
      const old = cnv.querySelector<HTMLElement>(`[data-nid="${dr.target.id}"]`);
      old?.classList.remove('nd-target');
      if (dr.mode === 'swap') old?.classList.add('nd-dim');
    }
    dr.target = next;
    if (dr.target && cnv) {
      const el = cnv.querySelector<HTMLElement>(`[data-nid="${dr.target.id}"]`);
      el?.classList.remove('nd-dim');
      el?.classList.add('nd-target');
    }
    if (dr.mode === 'swap' && dr.ghost) {
      const sub = dr.ghost.querySelector<HTMLElement>('.g-sub')!;
      if (dr.target) { sub.textContent = '↕ ' + dr.target.label; dr.ghost.classList.add('has-target'); }
      else dr.ghost.classList.remove('has-target');
    }
    store.setDrag({ cx: store.drag.cx, cy: store.drag.cy });
  }, [cnvRef, store]);

  // ── Public API ────────────────────────────────────────────────────────────
  const dragBegin = useCallback((n: TreeNode, el: HTMLElement, clientX: number, clientY: number, mode: 'swap' | 'connect' = 'swap', forceRef = false) => {
    if (mode === 'swap' && !canDrag(n)) return;
    if (mode === 'connect' && !canConnect(n)) return;
    const dr = drRef.current;
    dr.node = n; dr.sx = clientX; dr.sy = clientY; dr.on = false; dr.mode = mode; dr.target = null; dr.forceRef = forceRef;
    dr.startNodeX = n.px ?? n.x ?? 0;
    dr.startNodeY = n.py ?? centerY(n);
    store.setDrag({ node: n, el, on: false, mode, sx: clientX, sy: clientY, cx: 0, cy: 0, target: null, ghost: null });
  }, [store]);

  const dragMove = useCallback((clientX: number, clientY: number) => {
    const dr = drRef.current;
    if (!dr.node) return;
    const cnv = cnvRef.current;

    if (!dr.on && Math.hypot(clientX - dr.sx, clientY - dr.sy) > 8) {
      dr.on = true;
      if (dr.mode === 'swap') {
        const svgl = document.getElementById('svgl');
        svgl?.classList.add('dimmed');
        applyDragClasses();
        const multiIds = getMultiSel();
        const isGroupDrag = store.freeMode && multiIds.size > 0 && multiIds.has(dr.node.id);
        const ghost = document.createElement('div');
        ghost.id = 'ghost';
        const lbl = isGroupDrag ? `${multiIds.size} nodes` : dr.node.label;
        ghost.innerHTML = `<span class="g-lbl">${lbl}</span><span class="g-sub"></span>`;
        ghost.style.width = NW + 'px';
        document.body.appendChild(ghost);
        dr.ghost = ghost;
      } else {
        applyConnectClasses();
      }
      document.body.style.cursor = 'crosshair';
    }
    if (!dr.on) return;
    if (!cnv) return;

    const rect = cnv.getBoundingClientRect();
    const mx = (clientX - rect.left) / zoom;
    const my = (clientY - rect.top) / zoom;
    dr.lastMx = mx; dr.lastMy = my;

    if (dr.mode === 'swap') {
      if (dr.ghost) {
        dr.ghost.style.left = (clientX - NW / 2) + 'px';
        dr.ghost.style.top  = (clientY - NH / 2) + 'px';
      }
      // In free mode with group drag, skip swap-target detection
      if (store.freeMode && getMultiSel().size > 0 && getMultiSel().has(dr.node.id)) {
        store.setDrag({ cx: mx, cy: my, on: true, target: null });
        return;
      }
      let hit: TreeNode | null = null;
      for (const n of getAllNodes()) {
        if (n === dr.node || !canDrag(n)) continue;
        if (mx >= n.x! && mx <= n.x! + NW && my >= topY(n) && my <= topY(n) + NH) { hit = n; break; }
      }
      setTarget(hit);
    } else {
      let hit: TreeNode | null = null;
      for (const n of getAllNodes()) {
        if (n === dr.node || !canBeChild(n)) continue;
        if (mx >= n.x! && mx <= n.x! + NW && my >= topY(n) && my <= topY(n) + NH) { hit = n; break; }
      }
      setTarget(hit);
    }
    store.setDrag({ cx: mx, cy: my, on: true, target: dr.target });
  }, [cnvRef, getAllNodes, applyDragClasses, applyConnectClasses, setTarget, store, zoom, getMultiSel]);

  const dragEnd = useCallback(() => {
    const dr = drRef.current;
    if (!dr.node) return;
    const wasOn = dr.on;
    const mode  = dr.mode;
    const src   = dr.node;
    const tgt   = dr.target;

    dr.ghost?.remove();
    document.getElementById('svgl')?.classList.remove('dimmed');
    clearDragClasses();
    document.body.style.cursor = '';
    dr.node = null; dr.target = null; dr.ghost = null; dr.on = false;
    store.clearDrag();

    const { getActive, pushUndo, triggerEdgeAnim, freeMode } = store;
    const flow = getActive();

    if (mode === 'swap') {
      if (wasOn && tgt && tgt !== src) {
        pushUndo();
        swapNodes(flow.tree, src, tgt);
        triggerEdgeAnim();
        onCommit();
      } else if (wasOn && !tgt && freeMode) {
        // Free positioning — snap to grid, move all selected nodes by same delta
        const newX = snap(dr.lastMx - NW / 2);
        const newY = snap(dr.lastMy);
        const dx = newX - dr.startNodeX;
        const dy = newY - dr.startNodeY;
        pushUndo();
        const multiIds = getMultiSel();
        if (multiIds.size > 0 && multiIds.has(src.id)) {
          // Group move: apply delta to all selected nodes
          for (const id of multiIds) {
            const node = getAllNodes().find(n => n.id === id);
            if (node && canDrag(node)) {
              node.px = snap((node.px ?? node.x ?? 0) + dx);
              node.py = snap((node.py ?? centerY(node)) + dy);
            }
          }
        } else {
          src.px = newX;
          src.py = newY;
        }
        onCommit();
      }
    } else {
      if (!wasOn) {
        pushUndo();
        const newNode = addChildNode(src);
        triggerEdgeAnim();
        onCommit();
        onAddAndEdit(newNode);
      } else if (tgt) {
        pushUndo();
        if (!flow.crossEdges) flow.crossEdges = [];
        const multiIds = getMultiSel();
        if (multiIds.size > 0) {
          for (const id of multiIds) {
            if (id !== tgt.id) flow.crossEdges.push({ id: `ce-${Date.now()}-${id}`, fromId: id, toId: tgt.id, type: 'ref' });
          }
        } else if (dr.forceRef) {
          flow.crossEdges.push({ id: `ce-${Date.now()}`, fromId: src.id, toId: tgt.id, type: 'ref' });
        } else {
          const crossBranch = src.b && tgt.b && src.b !== tgt.b;
          if (crossBranch) {
            flow.crossEdges.push({ id: `ce-${Date.now()}`, fromId: src.id, toId: tgt.id, type: 'ref' });
          } else {
            const ok = reparentNode(flow.tree, tgt.id, src.id);
            if (!ok) flow.crossEdges.push({ id: `ce-${Date.now()}`, fromId: src.id, toId: tgt.id, type: 'back' });
          }
        }
        triggerEdgeAnim();
        onCommit();
      } else {
        pushUndo();
        const newNode = addChildNode(src);
        triggerEdgeAnim();
        onCommit();
        onAddAndEdit(newNode);
      }
    }
  }, [store, clearDragClasses, onCommit, onAddAndEdit, getMultiSel, getAllNodes]);

  return { dragBegin, dragMove, dragEnd, drRef };
}

export { canConnect, centerY };
