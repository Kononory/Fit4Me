import { useEffect, useCallback, useState } from 'react';
import { useStore, flushCloudSaves } from './store';
import { decodeSharedFlow } from './utils';
import { saveFlowRemote, loadFlowsRemote } from './storage';
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

  // ── Cloud-first load on mount ─────────────────────────────────────────────
  useEffect(() => {
    loadFlowsRemote().then(remote => {
      if (remote && remote.length > 0) setFlows(remote);
    });

    // Flush any pending debounced saves before tab closes
    const handleUnload = () => flushCloudSaves(flows);
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
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
