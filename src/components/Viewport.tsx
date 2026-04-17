import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { TreeNode, CrossEdge } from '../types';
import { doLayout, flattenTree, collectEdges, detectOverlaps, PAD, RH } from '../layout';
import { useStore } from '../store';
import { Canvas } from './Canvas';
import { GridBackground } from './GridBackground';
import type { PickerState, PickerMode } from './EdgePicker';

interface Props {
  onShowEdgePicker: (toNode: TreeNode, lx: number, ly: number, sx: number, sy: number) => void;
  onShowCrossEdgePicker: (ce: CrossEdge, lx: number, ly: number, sx: number, sy: number) => void;
  pickerState: PickerState;
  onSetPickerMode: (mode: PickerMode, extra?: Partial<PickerState>) => void;
}

/** Apply free-position overrides (px/py) after layout — n.x gets overridden by n.px */
function applyFreePositions(nodes: TreeNode[]) {
  for (const n of nodes) {
    if (n.px !== undefined) n.x = n.px;
  }
}

export function Viewport({ onShowEdgePicker, onShowCrossEdgePicker, pickerState, onSetPickerMode }: Props) {
  const { getActive, activeId, animateEdgesNext, triggerEdgeAnim, zoom, setZoom, flows, setOverlapCount, leftSidebarCollapsed } = useStore();
  const vpRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number } | null>(null);

  // Recompute layout whenever flows or active id changes (zoom excluded to avoid redundant work)
  const tree = useMemo(() => {
    const active = getActive();
    doLayout(active.tree, 0, 0);
    applyFreePositions(flattenTree(active.tree));
    const nodes = flattenTree(active.tree);
    const edges = collectEdges(active.tree);
    const overlaps = detectOverlaps(edges, active.crossEdges ?? [], nodes);
    setOverlapCount(overlaps.length);
    return active.tree;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, flows, getActive]);

  // Trigger draw animation on initial mount and flow switch
  useEffect(() => { triggerEdgeAnim(); }, [activeId, triggerEdgeAnim]);

  // Scroll to root node on flow switch
  useEffect(() => {
    const vp = vpRef.current; if (!vp) return;
    const active = getActive();
    const rootRow = active.tree.row ?? 0;
    const target = PAD + rootRow * RH + RH / 2 - vp.clientHeight / 2;
    vp.scrollTop = Math.max(0, target);
  }, [activeId, getActive]);

  // ── Pinch zoom (trackpad wheel + touch) ────────────────────────────────────
  useEffect(() => {
    const vp = vpRef.current; if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom + e.deltaY * -0.005);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoom, setZoom]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchRef.current = { dist: d };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const ratio = d / pinchRef.current.dist;
      setZoom(zoom * ratio);
      pinchRef.current = { dist: d };
    }
  }, [zoom, setZoom]);

  const handleTouchEnd = useCallback(() => { pinchRef.current = null; }, []);

  const allNodes = flattenTree(tree);
  const allEdges = collectEdges(tree);
  const crossEdges = getActive().crossEdges ?? [];

  const handleShowEdgePicker = useCallback((toNode: TreeNode, lx: number, ly: number) => {
    const r = vpRef.current?.getBoundingClientRect();
    const sx = (r?.left ?? 0) + lx * zoom - (vpRef.current?.scrollLeft ?? 0);
    const sy = (r?.top  ?? 0) + ly * zoom - (vpRef.current?.scrollTop  ?? 0);
    onShowEdgePicker(toNode, lx, ly, sx, sy);
  }, [onShowEdgePicker, zoom]);

  const handleShowCrossEdgePicker = useCallback((ce: CrossEdge, lx: number, ly: number) => {
    const r = vpRef.current?.getBoundingClientRect();
    const sx = (r?.left ?? 0) + lx * zoom;
    const sy = (r?.top  ?? 0) + ly * zoom;
    onShowCrossEdgePicker(ce, lx, ly, sx, sy);
  }, [onShowCrossEdgePicker, zoom]);

  return (
    <>
      <GridBackground vpRef={vpRef} />
      <div
        id="vp"
        ref={vpRef}
        style={{
          marginLeft: leftSidebarCollapsed ? 40 : 148,
          width: `calc(100% - ${leftSidebarCollapsed ? 40 : 148}px)`,
          transition: 'margin-left 0.18s ease, width 0.18s ease',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Canvas
          allNodes={allNodes}
          allEdges={allEdges}
          crossEdges={crossEdges}
          doAnim={animateEdgesNext}
          zoom={zoom}
          onShowEdgePicker={handleShowEdgePicker}
          onShowCrossEdgePicker={handleShowCrossEdgePicker}
          pickerState={pickerState}
          onSetPickerMode={onSetPickerMode}
        />
      </div>
    </>
  );
}
