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
  const { sel, selNodeId, setSel, setSelNodeId, drag, getActive, updateActiveTree, clearEdgeAnim } = useStore();
  const cnvRef = useRef<HTMLDivElement>(null);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);

  const { cw, ch } = canvasSize(allNodes);

  const handleCommit = useCallback(() => {
    const flow = getActive();
    updateActiveTree(flow.tree);
  }, [getActive, updateActiveTree]);

  const handleAddAndEdit = useCallback((newNode: TreeNode) => {
    requestAnimationFrame(() => setEditNodeId(newNode.id));
  }, []);

  const { dragBegin, dragMove, dragEnd } = useDrag(cnvRef, () => allNodes, handleCommit, handleAddAndEdit);

  // Notify useDrag about move/end on document
  useEffect(() => {
    const onMove = (e: MouseEvent) => dragMove(e.clientX, e.clientY);
    const onUp   = () => dragEnd();
    const onTouchMove = (e: TouchEvent) => { const t = e.touches[0]; dragMove(t.clientX, t.clientY); if (drag.on) e.preventDefault(); };
    const onTouchEnd  = () => dragEnd();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend',  onTouchEnd);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend',  onTouchEnd);
    };
  }, [dragMove, dragEnd, drag.on]);

  // Clear edge animation flag after render
  useEffect(() => { if (doAnim) clearEdgeAnim(); }, [doAnim, clearEdgeAnim]);

  const nodeState = useCallback((n: TreeNode) => {
    if (!sel) return 'def' as const;
    if (n.id === selNodeId) return 'act' as const;
    if (!n.b) return 'par' as const;
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
      <EdgeLayer
        allNodes={allNodes}
        allEdges={allEdges}
        crossEdges={crossEdges}
        width={cw}
        height={ch}
        doAnim={doAnim}
        sel={sel}
        selNodeId={selNodeId}
        cnvRef={cnvRef}
        onShowEdgePicker={onShowEdgePicker}
        onShowCrossEdgePicker={onShowCrossEdgePicker}
      />

      {allNodes.map(n => (
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

      <DragOverlay width={cw} height={ch} />
    </div>
  );
}
