import { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, RotateCw, Move, KeyRound, Download, RefreshCw, Languages, ChevronDown, Keyboard, LogIn, LogOut, Eye, Edit3 } from 'lucide-react';
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
  const { flows, activeId, setFlows, undo, redo, canUndo, canRedo, getActive, updateActiveTree, pushUndo, triggerEdgeAnim, freeMode, setFreeMode, setFigmaTokenOpen, setFigmaImportOpen, setLocaleCheckOpen, overlapCount, activeLayer, cloudSavePending, hotkeysOpen, setHotkeysOpen, user, setAuthModalOpen, sharedToken, sharedPermission } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [figmaMenuOpen, setFigmaMenuOpen] = useState(false);
  const figmaMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!figmaMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!figmaMenuRef.current?.contains(e.target as Node)) setFigmaMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [figmaMenuOpen]);

  // Show ↺ button only when a saved import config exists for the active flow
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
          if (matched) {
            matched.screens = screens; updated++;
          } else {
            const newNode = addChildNode(flow.tree);
            newNode.label = groupName;
            newNode.screens = screens;
            created++;
          }
        } else if (matched) {
          if (action === 'overwrite') {
            matched.screens = screens;
          } else {
            const existing = matched.screens ?? [];
            const existingRefs = new Set(existing.map(s => s.ref));
            const added = screens.filter(s => !existingRefs.has(s.ref));
            matched.screens = [...existing, ...added].sort((a, b) => a.order - b.order);
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
      {activeLayer === 'nodes' && (
        <button
          id="tb-free"
          title="Free positioning — drag nodes anywhere, snap to grid"
          className={freeMode ? 'tb-active' : ''}
          onClick={() => setFreeMode(!freeMode)}
        ><Move size={14} /></button>
      )}
      {activeLayer === 'nodes' && (
        <div id="tb-figma-wrap" ref={figmaMenuRef}>
          <button
            id="tb-figma-toggle"
            className={figmaMenuOpen ? 'tb-active' : ''}
            onClick={() => setFigmaMenuOpen(v => !v)}
          >
            Figma <ChevronDown size={10} />
          </button>
          {figmaMenuOpen && (
            <div id="tb-figma-menu">
              <button className="tb-figma-item" onClick={() => { setFigmaTokenOpen(true); setFigmaMenuOpen(false); }}>
                <KeyRound size={12} /> Token
              </button>
              <button className="tb-figma-item" onClick={() => { setFigmaImportOpen(true); setFigmaMenuOpen(false); }}>
                <Download size={12} /> Import
              </button>
              {hasSyncConfig && (
                <button className="tb-figma-item" disabled={syncing} onClick={() => { handleResync(); setFigmaMenuOpen(false); }}>
                  <RefreshCw size={12} className={syncing ? 'fig-spin' : ''} /> Resync
                </button>
              )}
              <button className="tb-figma-item" onClick={() => { setLocaleCheckOpen(true); setFigmaMenuOpen(false); }}>
                <Languages size={12} /> Locale
              </button>
            </div>
          )}
        </div>
      )}
      {activeLayer === 'nodes' && overlapCount > 0 && (
        <button id="tb-overlap" title="Edge crossings detected — click to auto-arrange" onClick={handleAutoArrange}>
          ⚠ {overlapCount} crossing{overlapCount > 1 ? 's' : ''} · Fix
        </button>
      )}
      {cloudSavePending && <span id="tb-autosave-dot" title="Auto-saving…" />}
      {sharedToken ? (
        <span id="tb-shared-badge" title="You are viewing a shared flow">
          {sharedPermission === 'edit' ? <Edit3 size={11} /> : <Eye size={11} />}
          {sharedPermission === 'edit' ? 'Shared · editing' : 'Shared · view only'}
        </span>
      ) : (
        <button id="tb-reset" onClick={handleReset}>Reset</button>
      )}
      {!sharedToken && supabase && (
        user ? (
          <button
            id="tb-user"
            title={`Signed in as ${user.email} — click to sign out`}
            onClick={() => supabase!.auth.signOut()}
          >
            <span id="tb-user-avatar">{user.email?.[0]?.toUpperCase() ?? '?'}</span>
            <LogOut size={11} />
          </button>
        ) : (
          <button id="tb-signin" onClick={() => setAuthModalOpen(true)}>
            <LogIn size={13} /> Sign in
          </button>
        )
      )}
      <button
        id="tb-hotkeys"
        title="Keyboard shortcuts (Shift+?)"
        className={hotkeysOpen ? 'tb-active' : ''}
        onClick={() => setHotkeysOpen(!hotkeysOpen)}
      ><Keyboard size={14} /></button>
    </div>
  );
}
