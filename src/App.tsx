import { useEffect, useCallback, useState } from 'react';
import { useStore, flushCloudSaves } from './store';
import { ZoomControls } from './components/ZoomControls';
import { decodeSharedFlow } from './utils';
import { saveFlowRemote, loadFlowsRemote, loadSharedFlow } from './storage';
import { Toolbar } from './components/Toolbar';
import { FlowTabs } from './components/FlowTabs';
import { Viewport } from './components/Viewport';
import { TextEditPanel } from './components/TextEditPanel';
import { EventsMap } from './components/EventsMap';
import { HotkeysPanel } from './components/HotkeysPanel';
import { AuthModal } from './components/AuthModal';
import { ClaimModal } from './components/ClaimModal';
import { ShareModal } from './components/ShareModal';
import { EdgePicker, EdgeLabelEdit, EdgeAnalytics, PICKER_INIT } from './components/EdgePicker';
import type { PickerState, PickerMode } from './components/EdgePicker';
import type { TreeNode, CrossEdge, Flow } from './types';
import { supabase } from './lib/supabase';

export function App() {
  const {
    flows, setFlows, setActiveId,
    activeLayer, setActiveLayer,
    hotkeysOpen, setHotkeysOpen,
    undo, redo,
    user, setUser, setAuthLoading, authModalOpen,
    sharedToken, sharedPermission,
    setSharedToken, setSharedPermission,
    shareModalOpen, setShareModalOpen,
  } = useStore();

  const [claimFlows, setClaimFlows] = useState<Flow[] | null>(null);

  // ── Auth init: restore session + subscribe to changes ────────────────────
  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      const prevUser = useStore.getState().user;
      setUser(newUser);

      if (newUser && !prevUser) {
        // Just signed in — check for local flows worth claiming (skip in shared mode)
        if (useStore.getState().sharedToken) return;
        const local = useStore.getState().flows;
        const isDefaultEmpty = local.length === 1 && local[0].id === 'default'
          && !local[0].tree.c?.length;
        if (!isDefaultEmpty) {
          setClaimFlows(local);
        } else {
          loadFlowsRemote().then(remote => {
            if (remote && remote.length > 0) setFlows(remote);
          });
        }
      }

      if (!newUser && prevUser) {
        // Signed out — reset to empty local state
        setFlows([{ id: 'default', name: 'Fit4Me', tree: { id: 'root', label: 'Flow', c: [] } }]);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cloud-first load on mount (authenticated users only) ─────────────────
  useEffect(() => {
    if (!user || sharedToken) return; // skip if in shared mode
    loadFlowsRemote().then(remote => {
      if (remote && remote.length > 0) setFlows(remote);
    });

    const handleUnload = () => flushCloudSaves(flows);
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle shared flow: ?s=TOKEN query param ─────────────────────────────
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('s');
    if (token) {
      loadSharedFlow(token).then(shared => {
        if (!shared) return;
        const { permission, ...flow } = shared;
        setFlows([flow]);
        setActiveId(flow.id);
        setSharedToken(token);
        setSharedPermission(permission);
        // Strip ?s= from URL without navigation
        const url = new URL(window.location.href);
        url.searchParams.delete('s');
        window.history.replaceState({}, '', url.toString());
      });
      return; // skip legacy hash handling if ?s= is present
    }
    // ── Legacy: #share=BASE64 URL hash ───────────────────────────────────────
    const legacyShared = decodeSharedFlow();
    if (legacyShared && !flows.find(f => f.id === legacyShared.id)) {
      const updated = [...flows, legacyShared];
      setFlows(updated);
      setActiveId(legacyShared.id);
      if (user) saveFlowRemote(legacyShared);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const viewOnly = sharedPermission === 'view';
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!viewOnly) {
        if (ctrl && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
        if (ctrl && e.key === 'e') { e.preventDefault(); setActiveLayer(activeLayer === 'outline' ? 'nodes' : 'outline'); }
      }
      if (e.shiftKey && e.key === '?' && activeLayer !== 'outline') { setHotkeysOpen(!hotkeysOpen); }
      if (!sharedToken && ctrl && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < flows.length) { e.preventDefault(); setActiveId(flows[idx].id); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo, activeLayer, setActiveLayer, hotkeysOpen, setHotkeysOpen, flows, setActiveId, sharedToken, sharedPermission]);

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

  const handleClaimDone = useCallback((cloudFlows: Flow[] | null) => {
    setClaimFlows(null);
    if (cloudFlows && cloudFlows.length > 0) setFlows(cloudFlows);
  }, [setFlows]);

  return (
    <div id="app" data-shared={sharedPermission ?? undefined}>
      {!sharedToken && <FlowTabs />}
      <Toolbar />
      {activeLayer !== 'events' && (
        <Viewport
          onShowEdgePicker={handleShowEdgePicker}
          onShowCrossEdgePicker={handleShowCrossEdgePicker}
          pickerState={pickerState}
          onSetPickerMode={setPickerMode}
        />
      )}
      {activeLayer === 'outline' && !sharedToken && <TextEditPanel />}
      {activeLayer === 'events'  && !sharedToken && <EventsMap />}
      {hotkeysOpen && <HotkeysPanel onClose={() => setHotkeysOpen(false)} />}
      <ZoomControls />
      <EdgePicker
        pickerState={pickerState}
        onClose={closePicker}
        onSetMode={setPickerMode}
      />
      <EdgeLabelEdit pickerState={pickerState} onClose={closePicker} />
      <EdgeAnalytics pickerState={pickerState} onClose={closePicker} />
      {authModalOpen && <AuthModal />}
      {claimFlows && <ClaimModal localFlows={claimFlows} onDone={handleClaimDone} />}
      {shareModalOpen && <ShareModal onClose={() => setShareModalOpen(false)} />}
    </div>
  );
}
