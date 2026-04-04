/** Mounts the save/load toolbar and returns update functions for save status. */
export function mountToolbar(opts: {
  onSave:     () => Promise<void>;
  onReset:    () => void;
  onUndo:     () => void;
  onRedo:     () => void;
  onTextEdit: () => void;
}): {
  setSaving:       (v: boolean) => void;
  setSaved:        (err: string | null) => void;
  setResetEnabled: (v: boolean) => void;
  setUndoEnabled:  (v: boolean) => void;
  setRedoEnabled:  (v: boolean) => void;
  setTextEditActive: (v: boolean) => void;
} {
  const bar = document.createElement('div');
  bar.id = 'toolbar';
  bar.innerHTML = `
    <span id="tb-status"></span>
    <button id="tb-undo" title="Undo (Ctrl+Z)">⟲</button>
    <button id="tb-redo" title="Redo (Ctrl+Y)">⟳</button>
    <button id="tb-text" title="Edit as text (Ctrl+E)">≡</button>
    <button id="tb-save">Save</button>
    <button id="tb-reset">Reset</button>
  `;
  document.body.appendChild(bar);

  const statusEl   = bar.querySelector<HTMLElement>('#tb-status')!;
  const saveBtn    = bar.querySelector<HTMLButtonElement>('#tb-save')!;
  const resetBtn   = bar.querySelector<HTMLButtonElement>('#tb-reset')!;
  const undoBtn    = bar.querySelector<HTMLButtonElement>('#tb-undo')!;
  const redoBtn    = bar.querySelector<HTMLButtonElement>('#tb-redo')!;
  const textBtn    = bar.querySelector<HTMLButtonElement>('#tb-text')!;
  let hideTimer    = 0;

  saveBtn.addEventListener('click',  () => opts.onSave());
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset to default tree? Unsaved changes will be lost.')) opts.onReset();
  });
  undoBtn.addEventListener('click',  () => opts.onUndo());
  redoBtn.addEventListener('click',  () => opts.onRedo());
  textBtn.addEventListener('click',  () => opts.onTextEdit());

  undoBtn.disabled = true;
  redoBtn.disabled = true;

  function setSaving(v: boolean) {
    saveBtn.disabled = v;
    saveBtn.textContent = v ? 'Saving…' : 'Save';
    if (v) { clearTimeout(hideTimer); statusEl.textContent = ''; }
  }

  function setSaved(err: string | null) {
    clearTimeout(hideTimer);
    if (err === null) {
      statusEl.textContent = 'Saved to cloud ✓';
      statusEl.style.color = '#6B9B5E';
    } else {
      statusEl.textContent = `Saved locally · ${err}`;
      statusEl.style.color = '#AEADA8';
    }
    hideTimer = window.setTimeout(() => { statusEl.textContent = ''; }, 6000);
  }

  function setResetEnabled(v: boolean)    { resetBtn.disabled = !v; }
  function setUndoEnabled(v: boolean)     { undoBtn.disabled = !v; }
  function setRedoEnabled(v: boolean)     { redoBtn.disabled = !v; }
  function setTextEditActive(v: boolean)  { textBtn.classList.toggle('tb-active', v); }

  return { setSaving, setSaved, setResetEnabled, setUndoEnabled, setRedoEnabled, setTextEditActive };
}
