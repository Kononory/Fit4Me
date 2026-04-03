/** Mounts the save/load toolbar and returns update functions for save status. */
export function mountToolbar(opts: {
  onSave: () => Promise<void>;
  onReset: () => void;
}): {
  setSaving: (v: boolean) => void;
  setSaved: (err: string | null) => void;
  setResetEnabled: (v: boolean) => void;
} {
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
  let hideTimer  = 0;

  saveBtn.addEventListener('click', () => opts.onSave());
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset to default tree? Unsaved changes will be lost.')) opts.onReset();
  });

  function setSaving(v: boolean) {
    saveBtn.disabled = v;
    saveBtn.textContent = v ? 'Saving…' : 'Save';
    if (v) { clearTimeout(hideTimer); statusEl.textContent = ''; }
  }

  // err is null on cloud success, or an error string on failure
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

  function setResetEnabled(v: boolean) {
    resetBtn.disabled = !v;
  }

  return { setSaving, setSaved, setResetEnabled };
}
