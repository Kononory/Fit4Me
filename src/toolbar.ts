/** Mounts the save/load toolbar and returns an update function for save status. */
export function mountToolbar(opts: {
  onSave: () => Promise<void>;
  onReset: () => void;
}): { setSaving: (v: boolean) => void; setSaved: (ok: boolean) => void } {
  const bar = document.createElement('div');
  bar.id = 'toolbar';
  bar.innerHTML = `
    <span id="tb-status"></span>
    <button id="tb-save">Save</button>
    <button id="tb-reset">Reset</button>
  `;
  document.body.appendChild(bar);

  const statusEl = bar.querySelector<HTMLElement>('#tb-status')!;
  const saveBtn  = bar.querySelector<HTMLButtonElement>('#tb-save')!;
  const resetBtn = bar.querySelector<HTMLButtonElement>('#tb-reset')!;

  saveBtn.addEventListener('click', () => opts.onSave());
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset to default tree? Unsaved changes will be lost.')) opts.onReset();
  });

  function setSaving(v: boolean) {
    saveBtn.disabled = v;
    saveBtn.textContent = v ? 'Saving…' : 'Save';
    if (v) statusEl.textContent = '';
  }

  function setSaved(ok: boolean) {
    statusEl.textContent = ok ? 'Saved ✓' : 'Save failed';
    statusEl.style.color = ok ? '#6B9B5E' : '#B52B1E';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  }

  return { setSaving, setSaved };
}
