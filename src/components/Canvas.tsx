import { useState, useRef, useCallback, useEffect } from 'react';
import type { TreeNode, CrossEdge } from '../types';
import { canvasSize } from '../layout';
import { useStore } from '../store';
import { NodeEl } from './NodeEl';
import { EdgeLayer } from './EdgeLayer';
import { DragOverlay } from './DragOverlay';
import { useDrag } from '../hooks/useDrag';
import type { PickerState, PickerMode } from './EdgePicker';

interface Props {
  allNodes: TreeNode[];
  allEdges: [TreeNode, TreeNode][];
  crossEdges: CrossEdge[];
  doAnim: boolean;
  onShowEdgePicker: (toNode: TreeNode, lx: number, ly: number) => void;
  onShowCrossEdgePicker: (ce: CrossEdge, lx: number, ly: number) => void;
  pickerState: PickerState;
  onSetPickerMode: (mode: PickerMode, extra?: Partial<PickerState>) => void;
}

export function Canvas({
  allNodes, allEdges, crossEdges, doAnim,
  onShowEdgePicker, onShowCrossEdgePicker,
}: Props) {
  const { sel, selNodeId, selTick, setSel, setSelNodeId, drag, getActive, updateActiveTree, clearEdgeAnim } = useStore();
  const cnvRef    = useRef<HTMLDivElement>(null);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);

  // ── Canvas size ─────────────────────────────────────────────────────────────
  const { cw, ch } = canvasSize(allNodes);

  // ── Drag ────────────────────────────────────────────────────────────────────
  const handleCommit = useCallback(() => {
    updateActiveTree(getActive().tree);
  }, [getActive, updateActiveTree]);

  const handleAddAndEdit = useCallback((newNode: TreeNode) => {
    requestAnimationFrame(() => setEditNodeId(newNode.id));
  }, []);

  const { dragBegin, dragMove, dragEnd } = useDrag(cnvRef, () => allNodes, handleCommit, handleAddAndEdit);

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
    // Wait for all staggered animations to finish before clearing the flag.
    // Each edge is delayed by ei * 0.025s; last one takes 0.35s to complete.
    const maxMs = allEdges.length * 25 + 400;
    const id = window.setTimeout(() => clearEdgeAnim(), maxMs);
    return () => clearTimeout(id);
  }, [doAnim, allEdges.length, clearEdgeAnim]);

  const nodeState = useCallback((n: TreeNode) => {
    if (!sel) return 'def' as const;
    if (n.id === selNodeId) return 'act' as const;
    if (!n.b)              return 'par' as const;
    return n.b === sel ? 'def' as const : 'dim' as const;
  }, [sel, selNodeId]);

  return (
    <div
      id="cnv"
      ref={cnvRef}
      style={{ width: cw, height: ch, position: 'relative' }}
      onClick={() => {
        if (editNodeId || drag.on) return;
        setSel(null); setSelNodeId(null);
      }}
    >
      {/* SVG edge layer (base paths, badges, cross-edges) */}
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
          onDragBegin={dragBegin}
          onSelect={n => setEditNodeId(n.id)}
          editNodeId={editNodeId}
          onEditDone={() => setEditNodeId(null)}
        />
      ))}

      {/* Drag feedback overlay */}
      <DragOverlay width={cw} height={ch} />
    </div>
  );
}
