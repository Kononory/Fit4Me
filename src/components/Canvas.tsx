/**
 * Canvas — positions all tree nodes and SVG edge layers inside a scrollable div.
 *
 * AnimatedBeam integration (MagicUI "Multiple Outputs" pattern):
 *   - cnvRef        = containerRef (the canvas div, position:relative)
 *   - nodeRefMap    = Map<nodeId, RefObject<HTMLDivElement>> — one ref per rendered node
 *   - For each edge [from → to] where `from` is in the selected node's subtree,
 *     an <AnimatedBeam> is rendered from the `from` node div to the `to` node div.
 *
 * This is exactly how MagicUI intends the component to be used.
 * AnimatedBeam renders its own absolute-positioned <svg> overlay on the canvas,
 * computing the path via getBoundingClientRect() on the node divs.
 *
 * startXOffset / endXOffset align the beam endpoints with the actual edge path:
 *   - beam starts at the RIGHT edge of the from-node  (+NW/2 from center)
 *   - beam ends   at the LEFT  edge of the to-node    (-NW/2 from center)
 */
import { useState, useRef, useCallback, useEffect, createRef, type RefObject } from 'react';
import type { TreeNode, CrossEdge } from '../types';
import { canvasSize, NW } from '../layout';
import { useStore } from '../store';
import { NodeEl } from './NodeEl';
import { EdgeLayer } from './EdgeLayer';
import { DragOverlay } from './DragOverlay';
import { AnimatedBeam } from './magicui/animated-beam';
import { useDrag } from '../hooks/useDrag';
import type { PickerState, PickerMode } from './EdgePicker';

// Beam cycle: 1.5 s travel, then silent until 15 s have elapsed
const BEAM_DURATION     = 1.5;
const BEAM_REPEAT_DELAY = 15 - BEAM_DURATION; // 13.5 s silence

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
  const cnvRef    = useRef<HTMLDivElement>(null);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);

  // ── Node refs (for AnimatedBeam) ────────────────────────────────────────────
  // Stable RefObjects keyed by node ID. Created once per ID, never re-created,
  // so AnimatedBeam's ResizeObserver effect runs only when nodes are added/removed.
  const nodeRefMap = useRef(new Map<string, RefObject<HTMLDivElement | null>>());

  const getNodeRef = useCallback((id: string): RefObject<HTMLDivElement | null> => {
    if (!nodeRefMap.current.has(id)) {
      nodeRefMap.current.set(id, createRef<HTMLDivElement>());
    }
    return nodeRefMap.current.get(id)!;
  }, []);

  // Prune refs for nodes that no longer exist
  useEffect(() => {
    const ids = new Set(allNodes.map(n => n.id));
    for (const id of nodeRefMap.current.keys()) {
      if (!ids.has(id)) nodeRefMap.current.delete(id);
    }
  }, [allNodes]);

  // ── Beam source set (selected node + its entire subtree) ────────────────────
  const beamSourceIds = new Set<string>();
  if (selNodeId) {
    const collect = (n: TreeNode) => {
      beamSourceIds.add(n.id);
      for (const c of n.c ?? []) collect(c);
    };
    const selNode = allNodes.find(n => n.id === selNodeId);
    if (selNode) collect(selNode);
  }

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

  useEffect(() => { if (doAnim) clearEdgeAnim(); }, [doAnim, clearEdgeAnim]);

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
        cnvRef={cnvRef}
        onShowEdgePicker={onShowEdgePicker}
        onShowCrossEdgePicker={onShowCrossEdgePicker}
      />

      {/* Node divs — each gets a stable ref for AnimatedBeam */}
      {allNodes.map((n) => (
        <NodeEl
          key={n.id}
          ref={getNodeRef(n.id)}
          node={n}
          state={nodeState(n)}
          onDragBegin={dragBegin}
          onSelect={n => setEditNodeId(n.id)}
          editNodeId={editNodeId}
          onEditDone={() => setEditNodeId(null)}
        />
      ))}

      {/*
        AnimatedBeam instances — MagicUI "Multiple Outputs" pattern.
        One beam per downstream edge from the selected node.
        Each beam is an absolutely-positioned <svg> overlay on the canvas div.

        Props tuned for our tree layout:
          startXOffset = +NW/2  → beam starts at right edge of from-node
          endXOffset   = -NW/2  → beam ends   at left  edge of to-node
          pathOpacity  = 0      → hides the ghost base path (EdgeLayer already draws it)
          duration     = 1.5 s, repeatDelay = 13.5 s → 15 s total cycle
      */}
      {allEdges.map(([f, t], ei) => {
        if (!beamSourceIds.has(f.id)) return null;
        const fromRef = getNodeRef(f.id);
        const toRef   = getNodeRef(t.id);
        return (
          <AnimatedBeam
            key={`beam-${f.id}-${t.id}`}
            containerRef={cnvRef}
            fromRef={fromRef}
            toRef={toRef}
            startXOffset={NW / 2}
            endXOffset={-NW / 2}
            pathOpacity={0}
            pathWidth={2.5}
            gradientStartColor="#ffaa40"
            gradientStopColor="#9c40ff"
            duration={BEAM_DURATION}
            repeatDelay={BEAM_REPEAT_DELAY}
            delay={ei * 0.18}
          />
        );
      })}

      {/* Drag feedback overlay */}
      <DragOverlay width={cw} height={ch} />
    </div>
  );
}
