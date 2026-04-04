import { useRef, useEffect } from 'react';
import { useStore } from '../store';
import { parseOutline, treeToOutline } from '../parser';

export function TextEditPanel() {
  const { getActive, setTextEditOpen, pushUndo, updateActiveTree } = useStore();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const errRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.value = treeToOutline(getActive().tree);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(0, 0); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    const ta = taRef.current;
    const errEl = errRef.current;
    if (!ta) return;
    try {
      const tree = parseOutline(ta.value);
      pushUndo();
      updateActiveTree(tree);
      setTextEditOpen(false);
    } catch (e) {
      if (errEl) errEl.textContent = String(e);
    }
  };

  const close = () => setTextEditOpen(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); apply(); return; }

    // Shift+Enter → new sibling block at same indent
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      const s = ta.selectionStart, val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      const indent = (val.slice(lineStart).match(/^ */) ?? [''])[0];
      ta.value = val.slice(0, s) + '\n' + indent + val.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 1 + indent.length;
      return;
    }

    // Tab → indent by 2 spaces
    if (!e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      ta.value = val.slice(0, lineStart) + '  ' + val.slice(lineStart);
      ta.selectionStart = ta.selectionEnd = s + 2;
      return;
    }

    // Shift+Tab → outdent by up to 2 spaces
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      const spaces = (val.slice(lineStart).match(/^ {1,2}/) ?? [''])[0].length;
      if (spaces > 0) {
        ta.value = val.slice(0, lineStart) + val.slice(lineStart + spaces);
        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - spaces);
      }
      return;
    }

    e.stopPropagation();
  };

  return (
    <div id="text-edit-panel">
      <div id="text-edit-header">
        <span id="text-edit-title">
          Edit outline — <kbd>Shift+↵</kbd> new block · <kbd>Tab</kbd> indent · <kbd>Ctrl+↵</kbd> apply · <kbd>Esc</kbd> cancel
        </span>
        <span id="text-edit-err" ref={errRef} />
      </div>
      <textarea id="text-edit-ta" ref={taRef} spellCheck={false} onKeyDown={handleKeyDown} />
      <div id="text-edit-footer">
        <button className="te-btn te-btn-cancel" onClick={close}>Cancel</button>
        <button className="te-btn te-btn-apply" onClick={apply}>Apply</button>
      </div>
    </div>
  );
}
