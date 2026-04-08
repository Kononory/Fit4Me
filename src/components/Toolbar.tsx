import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { saveFlowRemote } from '../storage';
import { cloneTree } from '../tree';
import { DEFAULT_TREE } from '../data';

export function Toolbar({ onTextEdit }: { onTextEdit: () => void }) {
  const { flows, activeId, setFlows, undo, redo, canUndo, canRedo, textEditOpen, getActive, freeMode, setFreeMode, zoom, setZoom, hotkeysOpen, setHotkeysOpen } = useStore();
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

  const undoOk = canUndo();
  const redoOk = canRedo();

  return (
    <div id="toolbar">
      {status && (
        <span id="tb-status" style={{ color: status.ok ? '#6B9B5E' : '#AEADA8' }}>
          {status.msg}
        </span>
      )}
      <button id="tb-undo" title="Undo (⌘Z)" disabled={!undoOk} onClick={undo}>⟲</button>
      <button id="tb-redo" title="Redo (⌘Y)" disabled={!redoOk} onClick={redo}>⟳</button>
      <button id="tb-text" title="Edit as text (⌘E)" className={textEditOpen ? 'tb-active' : ''} onClick={onTextEdit}>≡</button>
      <button
        id="tb-free"
        title="Free positioning mode — drag nodes anywhere, snap to grid"
        className={freeMode ? 'tb-active' : ''}
        onClick={() => setFreeMode(!freeMode)}
      >⊕</button>
      <button id="tb-zoom-out" title="Zoom out" onClick={() => setZoom(zoom - 0.1)}>−</button>
      <span id="tb-zoom-label">{Math.round(zoom * 100)}%</span>
      <button id="tb-zoom-in" title="Zoom in" onClick={() => setZoom(zoom + 0.1)}>+</button>
      <button id="tb-save" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
      <button id="tb-reset" onClick={handleReset}>Reset</button>
      <button id="tb-hotkeys" title="Keyboard shortcuts (?)" className={hotkeysOpen ? 'tb-active' : ''} onClick={() => setHotkeysOpen(!hotkeysOpen)}>?</button>
    </div>
  );
}
