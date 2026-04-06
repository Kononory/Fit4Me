import { useEffect, useCallback, useState } from 'react';
import { useStore } from './store';
import { decodeSharedFlow } from './utils';
import { saveFlowRemote, loadFlowsRemote, saveFlowsLocal } from './storage';
import { Toolbar } from './components/Toolbar';
import { FlowTabs } from './components/FlowTabs';
import { Viewport } from './components/Viewport';
import { TextEditPanel } from './components/TextEditPanel';
import { EdgePicker, EdgeLabelEdit, EdgeAnalytics, PICKER_INIT } from './components/EdgePicker';
import type { PickerState, PickerMode } from './components/EdgePicker';
import { RetentionWidget } from './components/RetentionWidget';
import type { TreeNode, CrossEdge } from './types';

export function App() {
  const {
    flows, setFlows, setActiveId,
    textEditOpen, setTextEditOpen,
    undo, redo,
  } = useStore();

  // ── Load remote flows on startup, merge with local ───────────────────────
  useEffect(() => {
    loadFlowsRemote().then(remote => {
      if (!remote || remote.length === 0) return;
      const { flows } = useStore.getState();
      let changed = false;
      const merged = [...flows];
      for (const rf of remote) {
        const li = merged.findIndex(f => f.id === rf.id);
        if (li === -1) {
          merged.push(rf); changed = true;
        } else if (rf.savedAt && (!merged[li].savedAt || rf.savedAt > merged[li].savedAt)) {
          merged[li] = rf; changed = true;
        }
      }
      if (changed) {
        useStore.setState({ flows: merged });
        saveFlowsLocal(merged);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle shared flow from URL hash ─────────────────────────────────────
  useEffect(() => {
    const shared = decodeSharedFlow();
    if (shared && !flows.find(f => f.id === shared.id)) {
      const updated = [...flows, shared];
      setFlows(updated);
      setActiveId(shared.id);
      saveFlowRemote(shared);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
      if (ctrl && e.key === 'e' && !textEditOpen) { e.preventDefault(); setTextEditOpen(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo, textEditOpen, setTextEditOpen]);

  // ── Edge picker state ─────────────────────────────────────────────────────
  const [pickerState, setPickerState] = useState<PickerState>(PICKER_INIT);

  const closePicker = useCallback(() => setPickerState(PICKER_INIT), []);

  const setPickerMode = useCallback((mode: PickerMode, extra?: Partial<PickerState>) => {
    setPickerState(prev => ({ ...prev, mode, ...(extra ?? {}) }));
  }, []);

  const handleShowEdgePicker = useCallback((toNode: TreeNode, _lx: number, _ly: number, sx: number, sy: number) => {
    setPickerState({ mode: 'main', toNode, ce: null, lx: _lx, ly: _ly, sx, sy });
  }, []);

  const handleShowCrossEdgePicker = useCallback((ce: CrossEdge, _lx: number, _ly: number, sx: number, sy: number) => {
    setPickerState({ mode: 'cross' as PickerMode, toNode: null, ce, lx: _lx, ly: _ly, sx, sy });
  }, []);

  return (
    <div id="app">
      <FlowTabs />
      <Toolbar onTextEdit={() => setTextEditOpen(!textEditOpen)} />
      <Viewport
        onShowEdgePicker={handleShowEdgePicker}
        onShowCrossEdgePicker={handleShowCrossEdgePicker}
        pickerState={pickerState}
        onSetPickerMode={setPickerMode}
      />
      {textEditOpen && <TextEditPanel />}
      <EdgePicker
        pickerState={pickerState}
        onClose={closePicker}
        onSetMode={setPickerMode}
      />
      <EdgeLabelEdit pickerState={pickerState} onClose={closePicker} />
      <EdgeAnalytics pickerState={pickerState} onClose={closePicker} />
      <RetentionWidget />
    </div>
  );
}
