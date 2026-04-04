import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { saveFlowRemote } from '../storage';
import { cloneTree } from '../tree';
import { DEFAULT_TREE } from '../data';

export function Toolbar({ onTextEdit }: { onTextEdit: () => void }) {
  const { flows, activeId, setFlows, undo, redo, canUndo, canRedo, textEditOpen, getActive } = useStore();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

  // Auto-hide status after 6s
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
      <button id="tb-undo" title="Undo (Ctrl+Z)" disabled={!undoOk} onClick={undo}>⟲</button>
      <button id="tb-redo" title="Redo (Ctrl+Y)" disabled={!redoOk} onClick={redo}>⟳</button>
      <button id="tb-text" title="Edit as text (Ctrl+E)" className={textEditOpen ? 'tb-active' : ''} onClick={onTextEdit}>≡</button>
      <button id="tb-save" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
      <button id="tb-reset" onClick={handleReset}>Reset</button>
    </div>
  );
}
