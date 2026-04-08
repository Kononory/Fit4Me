import { useState, useRef, useCallback, useEffect } from 'react';
import type { TreeNode, CrossEdge } from '../types';
import { canvasSize } from '../layout';
import { useStore } from '../store';
import { NodeEl } from './NodeEl';
import { EdgeLayer } from './EdgeLayer';
import { DragOverlay } from './DragOverlay';
import { useDrag } from '../hooks/useDrag';
import { removeNode, addSiblingNode } from '../tree';
import type { PickerState, PickerMode } from './EdgePicker';

interface Props {
  allNodes: TreeNode[];
  allEdges: [TreeNode, TreeNode][];
  crossEdges: CrossEdge[];
  doAnim: boolean;
  zoom: number;
  onShowEdgePicker: (toNode: TreeNode, lx: number, ly: number) => void;
  onShowCrossEdgePicker: (ce: CrossEdge, lx: number, ly: number) => void;
  pickerState: PickerState;
  onSetPickerMode: (mode: PickerMode, extra?: Partial<PickerState>) => void;
}

export function Canvas({
  allNodes, allEdges, crossEdges, doAnim, zoom,
  onShowEdgePicker, onShowCrossEdgePicker,
}: Props) {
  const { sel, selNodeId, selTick, setSel, setSelNodeId, drag, getActive, updateActiveTree, clearEdgeAnim, pushUndo, triggerEdgeAnim } = useStore();
  const cnvRef    = useRef<HTMLDivElement>(null);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());

  const toggleMultiSel = useCallback((id: string) => {
    setMultiSelIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const clearMultiSel = useCallback(() => setMultiSelIds(new Set()), []);
  const getMultiSel   = useCallback(() => multiSelIds, [multiSelIds]);

  // ── Canvas size ─────────────────────────────────────────────────────────────
  const { cw, ch } = canvasSize(allNodes);

  // ── Drag ────────────────────────────────────────────────────────────────────
  const handleCommit = useCallback(() => {
    updateActiveTree(getActive().tree);
  }, [getActive, updateActiveTree]);

  const handleAddAndEdit = useCallback((newNode: TreeNode) => {
    requestAnimationFrame(() => setEditNodeId(newNode.id));
  }, []);

  const { dragBegin, dragMove, dragEnd } = useDrag(cnvRef, () => allNodes, handleCommit, handleAddAndEdit, getMultiSel, zoom);

  useEffect(() => {
    const onMove      = (e: MouseEvent)  => dragMove(e.clientX, e.clientY);
    const onUp        = ()               => dragEnd();
    const onTouchMove = (e: TouchEvent)  => { const t = e.touches[0]; dragMove(t.clientX, t.clientY); if (drag.on) e.preventDefault(); };
    const onTouchEnd  = ()               => dragEnd();
    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseup',    onUp);
    document.addEventListener('touchmove',  onTouchMove, { passive: false });
    document.addEventListener('touchend',   onTouchEnd);
    return () => {
      document.removeEventListener('mousemove',  onMove);
      document.removeEventListener('mouseup',    onUp);
      document.removeEventListener('touchmove',  onTouchMove);
      document.removeEventListener('touchend',   onTouchEnd);
    };
  }, [dragMove, dragEnd, drag.on]);

  useEffect(() => {
    if (!doAnim) return;
    const maxMs = allEdges.length * 25 + 400;
    const id = window.setTimeout(() => clearEdgeAnim(), maxMs);
    return () => clearTimeout(id);
  }, [doAnim, allEdges.length, clearEdgeAnim]);

  // ── Delete key handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const sid = useStore.getState().selNodeId;
      if (!sid) return;
      const flow = getActive();
      const node = allNodes.find(n => n.id === sid);
      if (!node || node.type === 'root' || node.type === 'nav') return;
      const childCount = (node.c ?? []).length;
      const msg = childCount > 0
        ? `Delete "${node.label}" and its ${childCount} child block(s)?`
        : `Delete "${node.label}"?`;
      if (!confirm(msg)) return;
      e.preventDefault();
      pushUndo();
      removeNode(flow.tree, sid);
      setSel(null); setSelNodeId(null);
      triggerEdgeAnim();
      updateActiveTree(flow.tree);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [allNodes, getActive, pushUndo, setSel, setSelNodeId, triggerEdgeAnim, updateActiveTree]);

  // ── Add sibling ─────────────────────────────────────────────────────────────
  const handleAddSibling = useCallback((n: TreeNode) => {
    if (n.type === 'root' || n.type === 'nav') return;
    const flow = getActive();
    pushUndo();
    const newNode = addSiblingNode(flow.tree, n.id);
    triggerEdgeAnim();
    updateActiveTree(flow.tree);
    if (newNode) requestAnimationFrame(() => setEditNodeId(newNode.id));
  }, [getActive, pushUndo, triggerEdgeAnim, updateActiveTree]);

  const nodeState = useCallback((n: TreeNode) => {
    if (n.id === selNodeId)      return 'act' as const;
    if (!sel)                    return 'def' as const;
    if (!n.b)                    return 'par' as const;
    return n.b === sel ? 'def' as const : 'dim' as const;
  }, [sel, selNodeId]);

  return (
    <div
      id="cnv"
      ref={cnvRef}
      style={{ width: cw, height: ch, position: 'relative', zoom: zoom }}
      onClick={() => {
        if (editNodeId || drag.on) return;
        setSel(null); setSelNodeId(null); clearMultiSel();
      }}
    >
      <EdgeLayer
        allNodes={allNodes}
        allEdges={allEdges}
        crossEdges={crossEdges}
        width={cw}
        height={ch}
        doAnim={doAnim}
        sel={sel}
        selNodeId={selNodeId}
        selTick={selTick}
        cnvRef={cnvRef}
        onShowEdgePicker={onShowEdgePicker}
        onShowCrossEdgePicker={onShowCrossEdgePicker}
      />

      {allNodes.map((n) => (
        <NodeEl
          key={n.id}
          node={n}
          state={nodeState(n)}
          multiSel={multiSelIds.has(n.id)}
          onDragBegin={dragBegin}
          onSelect={n => setEditNodeId(n.id)}
          onToggleMulti={() => toggleMultiSel(n.id)}
          onAddSibling={handleAddSibling}
          editNodeId={editNodeId}
          onEditDone={() => setEditNodeId(null)}
        />
      ))}

      <DragOverlay width={cw} height={ch} />
    </div>
  );
}
