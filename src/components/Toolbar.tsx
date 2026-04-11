import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, RotateCw, Move, KeyRound, Download } from 'lucide-react';
import { useStore } from '../store';
import { saveFlowRemote } from '../storage';
import { cloneTree } from '../tree';
import { DEFAULT_TREE } from '../data';
import { autoArrange, doLayout, flattenTree } from '../layout';

export function Toolbar() {
  const { flows, activeId, setFlows, undo, redo, canUndo, canRedo, getActive, updateActiveTree, pushUndo, triggerEdgeAnim, freeMode, setFreeMode, setFigmaTokenOpen, setFigmaImportOpen, overlapCount } = useStore();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(t);
  }, [status]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const active = getActive();
      await saveFlowRemote(active);
      setStatus({ msg: 'Saved to cloud ✓', ok: true });
    } catch (e) {
      setStatus({ msg: `Saved locally · ${String(e)}`, ok: false });
    } finally {
      setSaving(false);
    }
  }, [getActive]);

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
      <button
        id="tb-free"
        title="Free positioning — drag nodes anywhere, snap to grid"
        className={freeMode ? 'tb-active' : ''}
        onClick={() => setFreeMode(!freeMode)}
      ><Move size={14} /></button>
      <button id="tb-figma" title="Figma token settings" onClick={() => setFigmaTokenOpen(true)}><KeyRound size={14} /></button>
      <button id="tb-figma-import" title="Import screens from Figma page" onClick={() => setFigmaImportOpen(true)}><Download size={14} /></button>
      {overlapCount > 0 && (
        <button id="tb-overlap" title="Edge crossings detected — click to auto-arrange" onClick={handleAutoArrange}>
          ⚠ {overlapCount} crossing{overlapCount > 1 ? 's' : ''} · Fix
        </button>
      )}
      <button id="tb-save" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
      <button id="tb-reset" onClick={handleReset}>Reset</button>
    </div>
  );
}
