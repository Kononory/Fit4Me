import { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, RotateCw, Move, KeyRound, Download, RefreshCw, Languages, Keyboard, LogIn, LogOut, Eye, Edit3, MoreHorizontal } from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { cloneTree, addChildNode } from '../tree';
import { DEFAULT_TREE } from '../data';
import { autoArrange, doLayout, flattenTree } from '../layout';
import {
  getPAT, getFigmaImportConfig, fetchPageStructure,
  parseFrameGroups, fetchBatchThumbnails, decodeRef,
} from '../lib/figma';

export function Toolbar() {
  const {
    flows, activeId, setFlows, undo, redo, canUndo, canRedo,
    getActive, updateActiveTree, pushUndo, triggerEdgeAnim,
    freeMode, setFreeMode,
    setFigmaTokenOpen, setFigmaImportOpen, setLocaleCheckOpen,
    overlapCount, activeLayer, cloudSavePending,
    hotkeysOpen, setHotkeysOpen,
    user, setAuthModalOpen,
    sharedToken, sharedPermission,
  } = useStore();

  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreMenuOpen]);

  const hasSyncConfig = !!getFigmaImportConfig(activeId);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  const handleReset = useCallback(() => {
    if (!confirm('Reset to default tree? Unsaved changes will be lost.')) return;
    const updated = flows.map(f =>
      f.id === activeId ? { ...f, tree: cloneTree(DEFAULT_TREE) } : f,
    );
    setFlows(updated);
  }, [flows, activeId, setFlows]);

  const handleAutoArrange = useCallback(() => {
    const flow = getActive();
    const freeCount = flattenTree(flow.tree).filter(n => n.px !== undefined || n.py !== undefined).length;
    if (freeCount > 3 && !confirm(`Auto-arrange will reset ${freeCount} free-positioned nodes. Continue?`)) return;
    pushUndo();
    autoArrange(flow.tree);
    doLayout(flow.tree, 0, 0);
    triggerEdgeAnim();
    updateActiveTree(flow.tree);
  }, [getActive, pushUndo, triggerEdgeAnim, updateActiveTree]);

  const handleResync = useCallback(async () => {
    const flow = getActive();
    const cfg = getFigmaImportConfig(flow.id);
    if (!cfg) { setFigmaImportOpen(true); return; }
    if (!getPAT()) { setFigmaTokenOpen(true); return; }
    setSyncing(true);
    setStatus(null);
    try {
      const pages = await fetchPageStructure(cfg.fileKey);
      const page = pages.find(p => p.id === cfg.pageId) ?? pages[0];
      if (!page) throw new Error('Saved page not found in Figma file');

      const allNodes = flattenTree(flow.tree);
      const groups = parseFrameGroups(page.frames, cfg.fileKey);

      pushUndo();
      let updated = 0, created = 0;

      for (const [groupName, screens] of groups) {
        const action = cfg.groupActions[groupName] ?? 'create';
        if (action === 'skip') continue;
        const matched = allNodes.find(n => n.label.trim().toLowerCase() === groupName.toLowerCase());
        if (action === 'create') {
          if (matched) { matched.screens = screens; updated++; }
          else { const n = addChildNode(flow.tree); n.label = groupName; n.screens = screens; created++; }
        } else if (matched) {
          if (action === 'overwrite') {
            matched.screens = screens;
          } else {
            const existing = matched.screens ?? [];
            const existingRefs = new Set(existing.map(s => s.ref));
            matched.screens = [...existing, ...screens.filter(s => !existingRefs.has(s.ref))].sort((a, b) => a.order - b.order);
          }
          updated++;
        }
        try {
          const nodeIds = screens.map(s => decodeRef(s.ref)?.nodeId).filter((id): id is string => !!id);
          await fetchBatchThumbnails(cfg.fileKey, nodeIds);
        } catch (_) { /* thumbnails optional */ }
      }

      updateActiveTree(flow.tree);
      const parts = [updated > 0 && `${updated} updated`, created > 0 && `${created} created`].filter(Boolean);
      setStatus({ msg: `Re-synced ✓ ${parts.join(', ') || '(no changes)'}`, ok: true });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg === 'no_pat') setFigmaTokenOpen(true);
      else setStatus({ msg: `Sync failed · ${msg}`, ok: false });
    } finally {
      setSyncing(false);
    }
  }, [getActive, pushUndo, updateActiveTree, setFigmaImportOpen, setFigmaTokenOpen]);

  const close = () => setMoreMenuOpen(false);
  const undoOk = canUndo();
  const redoOk = canRedo();

  return (
    <div id="toolbar">
      {status && (
        <span id="tb-status" style={{ color: status.ok ? '#6B9B5E' : '#AEADA8' }}>
          {status.msg}
        </span>
      )}

      <button id="tb-undo" title="Undo (⌘Z)" disabled={!undoOk} onClick={undo}><RotateCcw size={14} /></button>
      <button id="tb-redo" title="Redo (⌘Y)" disabled={!redoOk} onClick={redo}><RotateCw size={14} /></button>

      {sharedToken && (
        <span id="tb-shared-badge">
          {sharedPermission === 'edit' ? <Edit3 size={11} /> : <Eye size={11} />}
          {sharedPermission === 'edit' ? 'Shared · editing' : 'Shared · view only'}
        </span>
      )}

      <div id="tb-more-wrap" ref={moreMenuRef}>
        <button
          id="tb-more"
          title="More options"
          className={moreMenuOpen ? 'tb-active' : ''}
          onClick={() => setMoreMenuOpen(v => !v)}
        >
          {cloudSavePending && <span id="tb-more-dot" />}
          <MoreHorizontal size={14} />
        </button>

        {moreMenuOpen && (
          <div id="tb-more-menu">
            {!sharedToken && activeLayer === 'nodes' && (
              <>
                <button className="tb-menu-item" onClick={() => { setFreeMode(!freeMode); close(); }}>
                  <Move size={12} /> Free mode {freeMode ? '✓' : ''}
                </button>
                <button className="tb-menu-item" onClick={() => { setFigmaTokenOpen(true); close(); }}>
                  <KeyRound size={12} /> Figma token
                </button>
                <button className="tb-menu-item" onClick={() => { setFigmaImportOpen(true); close(); }}>
                  <Download size={12} /> Figma import
                </button>
                {hasSyncConfig && (
                  <button className="tb-menu-item" disabled={syncing} onClick={() => { handleResync(); close(); }}>
                    <RefreshCw size={12} className={syncing ? 'fig-spin' : ''} /> Figma resync
                  </button>
                )}
                <button className="tb-menu-item" onClick={() => { setLocaleCheckOpen(true); close(); }}>
                  <Languages size={12} /> Locale check
                </button>
                {overlapCount > 0 && (
                  <button className="tb-menu-item tb-menu-warn" onClick={() => { handleAutoArrange(); close(); }}>
                    ⚠ Fix {overlapCount} crossing{overlapCount > 1 ? 's' : ''}
                  </button>
                )}
                <div className="tb-menu-sep" />
              </>
            )}

            {!sharedToken && (
              <button className="tb-menu-item" onClick={() => { handleReset(); close(); }}>
                Reset flow
              </button>
            )}

            <button className="tb-menu-item" onClick={() => { setHotkeysOpen(!hotkeysOpen); close(); }}>
              <Keyboard size={12} /> Hotkeys
            </button>

            {supabase && (
              <>
                <div className="tb-menu-sep" />
                {user ? (
                  <button className="tb-menu-item tb-menu-signout" onClick={() => { supabase!.auth.signOut(); close(); }}>
                    <LogOut size={12} /> Sign out · {user.email?.split('@')[0]}
                  </button>
                ) : (
                  <button className="tb-menu-item" onClick={() => { setAuthModalOpen(true); close(); }}>
                    <LogIn size={12} /> Sign in
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
