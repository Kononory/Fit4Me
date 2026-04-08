import { useState, useRef, useCallback, useEffect } from 'react';
import type { TreeNode, CrossEdge } from '../types';
import { canvasSize, flattenTree } from '../layout';
import { useStore } from '../store';
import { NodeEl } from './NodeEl';
import { EdgeLayer } from './EdgeLayer';
import { DragOverlay } from './DragOverlay';
import { FigmaPreview } from './FigmaPreview';
import { FigmaTokenModal } from './FigmaTokenModal';
import { useDrag } from '../hooks/useDrag';
import { removeNode, addSiblingNode, swapNodes, swapNodeMetadata, findNode } from '../tree';
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
  const { sel, selNodeId, selTick, setSel, setSelNodeId, drag, getActive, updateActiveTree, clearEdgeAnim, pushUndo, triggerEdgeAnim, figmaTokenOpen } = useStore();
  const cnvRef    = useRef<HTMLDivElement>(null);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());
  const [figmaPreviewNode, setFigmaPreviewNode] = useState<TreeNode | null>(null);

  // Toggle a node + all its descendants in multi-select
  const toggleSubtree = useCallback((node: TreeNode) => {
    const ids = flattenTree(node).map(n => n.id);
    setMultiSelIds(prev => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
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

  // ── Swap actions (2-node multi-select) ──────────────────────────────────────
  const handleSwap = useCallback((mode: 'meta' | 'subtree') => {
    if (multiSelIds.size !== 2) return;
    const [aId, bId] = [...multiSelIds];
    const flow = getActive();
    pushUndo();
    if (mode === 'meta') {
      swapNodeMetadata(flow.tree, aId, bId);
    } else {
      const a = findNode(flow.tree, aId);
      const b = findNode(flow.tree, bId);
      if (a && b) swapNodes(flow.tree, a, b);
    }
    triggerEdgeAnim();
    updateActiveTree(flow.tree);
    clearMultiSel();
  }, [multiSelIds, getActive, pushUndo, triggerEdgeAnim, updateActiveTree, clearMultiSel]);

  const handleFigmaLink = useCallback((n: TreeNode, ref: string | null) => {
    pushUndo();
    if (ref === null) delete n.figmaRef;
    else n.figmaRef = ref;
    updateActiveTree(getActive().tree);
  }, [pushUndo, getActive, updateActiveTree]);

  const nodeState = useCallback((n: TreeNode) => {
    if (n.id === selNodeId)      return 'act' as const;
    if (!sel)                    return 'def' as const;
    if (!n.b)                    return 'par' as const;
    return n.b === sel ? 'def' as const : 'dim' as const;
  }, [sel, selNodeId]);

  return (
    <>
    <div
      id="cnv"
      ref={cnvRef}
      style={{ width: cw, height: ch, position: 'relative', zoom: zoom }}
      onClick={() => {
        if (editNodeId || drag.on) return;
        setSel(null); setSelNodeId(null); clearMultiSel();
        setFigmaPreviewNode(null);
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
          onToggleMulti={() => toggleSubtree(n)}
          onAddSibling={handleAddSibling}
          editNodeId={editNodeId}
          onEditDone={() => setEditNodeId(null)}
          onFigmaPreview={setFigmaPreviewNode}
          onFigmaLink={handleFigmaLink}
        />
      ))}

      <DragOverlay width={cw} height={ch} />

      {/* Swap action bar — visible when exactly 2 nodes are multi-selected */}
      {multiSelIds.size === 2 && (
        <div id="swap-bar" onClick={e => e.stopPropagation()}>
          <span id="swap-bar-label">2 selected</span>
          <button className="swap-btn" onClick={() => handleSwap('meta')} title="Swap only node labels — children stay in place">
            Swap nodes
          </button>
          <button className="swap-btn" onClick={() => handleSwap('subtree')} title="Swap entire subtrees including children">
            Swap subtrees
          </button>
          <button className="swap-btn swap-btn-cancel" onClick={clearMultiSel}>✕</button>
        </div>
      )}
    </div>

    {figmaPreviewNode && (
      <FigmaPreview
        figmaRef={figmaPreviewNode.figmaRef!}
        nodeLabel={figmaPreviewNode.label}
        onClose={() => setFigmaPreviewNode(null)}
      />
    )}
    {figmaTokenOpen && <FigmaTokenModal />}
    </>
  );
}
