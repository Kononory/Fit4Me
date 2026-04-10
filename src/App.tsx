import { useEffect, useCallback, useState } from 'react';
import { useStore, flushCloudSaves } from './store';
import { ZoomControls } from './components/ZoomControls';
import { decodeSharedFlow } from './utils';
import { saveFlowRemote, loadFlowsRemote } from './storage';
import { Toolbar } from './components/Toolbar';
import { LayerTabs } from './components/LayerTabs';
import { FlowTabs } from './components/FlowTabs';
import { Viewport } from './components/Viewport';
import { TextEditPanel } from './components/TextEditPanel';
import { EventsMap } from './components/EventsMap';
import { HotkeysPanel } from './components/HotkeysPanel';
import { EdgePicker, EdgeLabelEdit, EdgeAnalytics, PICKER_INIT } from './components/EdgePicker';
import type { PickerState, PickerMode } from './components/EdgePicker';
import { RetentionWidget } from './components/RetentionWidget';
import { TooltipProvider } from './components/ui/tooltip';
import type { TreeNode, CrossEdge } from './types';

export function App() {
  const {
    flows, setFlows, setActiveId,
    activeLayer, setActiveLayer,
    hotkeysOpen, setHotkeysOpen,
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
      if (ctrl && e.key === 'e') { e.preventDefault(); setActiveLayer(activeLayer === 'outline' ? 'nodes' : 'outline'); }
      if (e.shiftKey && e.key === '?' && activeLayer !== 'outline') { setHotkeysOpen(!hotkeysOpen); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo, activeLayer, setActiveLayer, hotkeysOpen, setHotkeysOpen]);

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
      <TooltipProvider delay={300}>
        <FlowTabs />
        <Toolbar />
        <LayerTabs />
        {activeLayer !== 'events' && (
          <Viewport
            onShowEdgePicker={handleShowEdgePicker}
            onShowCrossEdgePicker={handleShowCrossEdgePicker}
            pickerState={pickerState}
            onSetPickerMode={setPickerMode}
          />
        )}
        {activeLayer === 'outline' && <TextEditPanel />}
        {activeLayer === 'events'  && <EventsMap />}
        {hotkeysOpen && <HotkeysPanel onClose={() => setHotkeysOpen(false)} />}
        <ZoomControls />
        {/* Floating ? button — bottom-right, left of retention marker */}
        <button
          title="Keyboard shortcuts (Shift+?)"
          onClick={() => setHotkeysOpen(!hotkeysOpen)}
          className={`fixed z-[60] right-[52px] bottom-5 w-[26px] h-[26px] flex items-center justify-center rounded-sm border-[1.5px] border-foreground font-bold text-[13px] font-mono cursor-pointer transition-colors ${hotkeysOpen ? 'bg-foreground text-background' : 'bg-background text-foreground hover:bg-foreground hover:text-background'}`}
        >?</button>
        <EdgePicker
          pickerState={pickerState}
          onClose={closePicker}
          onSetMode={setPickerMode}
        />
        <EdgeLabelEdit pickerState={pickerState} onClose={closePicker} />
        <EdgeAnalytics pickerState={pickerState} onClose={closePicker} />
        <RetentionWidget />
      </TooltipProvider>
    </div>
  );
}
