import { useEffect, useRef, useCallback, useState } from 'react';
import type { TreeNode, CrossEdge } from '../types';
import { doLayout, flattenTree, collectEdges, PAD, RH } from '../layout';
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

export function Viewport({ onShowEdgePicker, onShowCrossEdgePicker, pickerState, onSetPickerMode }: Props) {
  const { getActive, activeId, animateEdgesNext } = useStore();
  const vpRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState(() => {
    const active = getActive();
    doLayout(active.tree, 0, 0);
    return active.tree;
  });

  // Recompute layout whenever active flow changes
  useEffect(() => {
    const active = getActive();
    doLayout(active.tree, 0, 0);
    setTree({ ...active.tree }); // shallow copy to trigger re-render
  }, [activeId, getActive]);

  // Also recompute when tree mutations happen (store flows change)
  const flows = useStore(s => s.flows);
  useEffect(() => {
    const active = getActive();
    doLayout(active.tree, 0, 0);
    setTree({ ...active.tree });
  }, [flows, getActive]);

  // Scroll to root node on flow switch
  useEffect(() => {
    const vp = vpRef.current; if (!vp) return;
    const active = getActive();
    const rootRow = active.tree.row ?? 0;
    const target = PAD + rootRow * RH + RH / 2 - vp.clientHeight / 2;
    vp.scrollTop = Math.max(0, target);
  }, [activeId, getActive]);

  const allNodes = flattenTree(tree);
  const allEdges = collectEdges(tree);
  const crossEdges = getActive().crossEdges ?? [];

  const handleShowEdgePicker = useCallback((toNode: TreeNode, lx: number, ly: number) => {
    const r = vpRef.current?.getBoundingClientRect();
    const sx = (r?.left ?? 0) + lx - (vpRef.current?.scrollLeft ?? 0);
    const sy = (r?.top  ?? 0) + ly - (vpRef.current?.scrollTop  ?? 0);
    onShowEdgePicker(toNode, lx, ly, sx, sy);
  }, [onShowEdgePicker]);

  const handleShowCrossEdgePicker = useCallback((ce: CrossEdge, lx: number, ly: number) => {
    const r = vpRef.current?.getBoundingClientRect();
    const sx = (r?.left ?? 0) + lx;
    const sy = (r?.top  ?? 0) + ly;
    onShowCrossEdgePicker(ce, lx, ly, sx, sy);
  }, [onShowCrossEdgePicker]);

  return (
    <>
      <GridBackground vpRef={vpRef} />
      <div id="vp" ref={vpRef}>
        <div id="hint" style={{ opacity: 0 }}>
          tap to select · drag to swap · double-tap to rename
        </div>
        <Canvas
          allNodes={allNodes}
          allEdges={allEdges}
          crossEdges={crossEdges}
          doAnim={animateEdgesNext}
          onShowEdgePicker={handleShowEdgePicker}
          onShowCrossEdgePicker={handleShowCrossEdgePicker}
          pickerState={pickerState}
          onSetPickerMode={onSetPickerMode}
        />
      </div>
    </>
  );
}
