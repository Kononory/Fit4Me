import type { Flow } from './types';
import { parseOutline, treeToOutline, BLANK_OUTLINE } from './parser';

export interface FlowTabsCallbacks {
  onSwitch:  (id: string) => void;
  onRename:  (id: string, name: string) => void;
  onDelete:  (id: string) => void;
  onImport:  (flow: Flow) => void;
  onNew:     (flow: Flow) => void;
  onExport:  (id: string) => void;
}

function genId(): string {
  return `flow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── New-flow dialog ───────────────────────────────────────────────────────────

function showNewDialog(cb: FlowTabsCallbacks): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'ft-modal-backdrop';

  const card = document.createElement('div');
  card.className = 'ft-modal-card';
  card.innerHTML = `
    <div class="ft-modal-title">New Flow</div>
    <div class="ft-modal-options">
      <button class="ft-modal-opt" id="ft-opt-empty">
        <span class="ft-opt-label">Empty</span>
        <span class="ft-opt-desc">Blank starter template</span>
      </button>
      <button class="ft-modal-opt" id="ft-opt-text">
        <span class="ft-opt-label">From text</span>
        <span class="ft-opt-desc">Paste outline text to build structure</span>
      </button>
    </div>
  `;

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  card.querySelector('#ft-opt-empty')!.addEventListener('click', () => {
    close();
    const tree = parseOutline(BLANK_OUTLINE);
    cb.onNew({ id: genId(), name: 'New Flow', tree });
  });

  card.querySelector('#ft-opt-text')!.addEventListener('click', () => {
    close();
    showTextInputDialog(cb);
  });
}

function showTextInputDialog(cb: FlowTabsCallbacks): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'ft-modal-backdrop';

  const card = document.createElement('div');
  card.className = 'ft-modal-card ft-modal-text';
  card.innerHTML = `
    <div class="ft-modal-title">Paste Outline Text</div>
    <div class="ft-modal-hint">Format: <b>Label [type:branch] | sublabel</b> · 2-space indent per level<br>Types: root · nav · tab · (none for screen)</div>
    <textarea class="ft-modal-textarea" spellcheck="false" placeholder="Fit4Me [root]
  Navigation [nav] | Tab 1 · Tab 2
    Tab 1 [tab:plan]
      Screen A
      Screen B | subtitle
    Tab 2 [tab:log]
      Screen C"></textarea>
    <div class="ft-modal-actions">
      <button class="ft-modal-btn ft-modal-btn-cancel">Cancel</button>
      <button class="ft-modal-btn ft-modal-btn-create">Create Flow</button>
    </div>
  `;

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const textarea  = card.querySelector<HTMLTextAreaElement>('.ft-modal-textarea')!;
  const hintEl    = card.querySelector<HTMLElement>('.ft-modal-hint')!;
  const createBtn = card.querySelector<HTMLButtonElement>('.ft-modal-btn-create')!;

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  card.querySelector('.ft-modal-btn-cancel')!.addEventListener('click', close);

  const submit = () => {
    const text = textarea.value.trim();
    if (!text) return;
    try {
      const tree = parseOutline(text);
      const name = tree.label || 'New Flow';
      close();
      cb.onNew({ id: genId(), name, tree });
    } catch (e) {
      hintEl.textContent = `Parse error: ${String(e)}`;
      hintEl.style.color = '#B52B1E';
    }
  };

  createBtn.addEventListener('click', submit);
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
    e.stopPropagation();
  });

  requestAnimationFrame(() => textarea.focus());
}

export function mountFlowTabs(
  flows: Flow[],
  activeId: string,
  cb: FlowTabsCallbacks,
): { setActive: (id: string) => void; setFlows: (flows: Flow[]) => void } {
  // ── Build sidebar ───────────────────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.id = 'flow-tabs';

  const label = document.createElement('div');
  label.id = 'flow-tabs-label';
  label.textContent = 'FLOWS';
  sidebar.appendChild(label);

  const list = document.createElement('div');
  list.id = 'flow-tab-list';
  sidebar.appendChild(list);

  // ── Footer buttons ──────────────────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.id = 'flow-tabs-footer';

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.txt,.md';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      try {
        const tree = parseOutline(text);
        // Use filename (without extension) as flow name
        const name = file.name.replace(/\.[^.]+$/, '');
        tree.label = name;
        const flow: Flow = { id: genId(), name, tree };
        cb.onImport(flow);
      } catch (e) {
        alert(`Failed to parse file: ${e}`);
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });
  footer.appendChild(fileInput);

  const btnImport = document.createElement('button');
  btnImport.className = 'flow-footer-btn';
  btnImport.innerHTML = '↑ Import';
  btnImport.title = 'Upload an outline .txt file';
  btnImport.addEventListener('click', () => fileInput.click());
  footer.appendChild(btnImport);

  const btnNew = document.createElement('button');
  btnNew.className = 'flow-footer-btn';
  btnNew.innerHTML = '+ New';
  btnNew.title = 'Create a new flow';
  btnNew.addEventListener('click', () => showNewDialog(cb));
  footer.appendChild(btnNew);

  sidebar.appendChild(footer);
  document.body.appendChild(sidebar);

  // ── Render tabs ─────────────────────────────────────────────────────────────
  let currentFlows: Flow[] = flows;
  let currentActive = activeId;

  function renderTabs() {
    list.innerHTML = '';
    for (const flow of currentFlows) {
      const tab = document.createElement('div');
      tab.className = 'flow-tab' + (flow.id === currentActive ? ' flow-tab-active' : '');
      tab.dataset['fid'] = flow.id;

      const nameEl = document.createElement('span');
      nameEl.className = 'flow-tab-name';
      nameEl.textContent = flow.name;
      tab.appendChild(nameEl);

      // Export button
      const btnExp = document.createElement('button');
      btnExp.className = 'flow-tab-btn';
      btnExp.title = 'Download as .txt';
      btnExp.textContent = '↓';
      btnExp.addEventListener('click', e => {
        e.stopPropagation();
        cb.onExport(flow.id);
      });
      tab.appendChild(btnExp);

      // Delete button (only if more than 1 flow)
      if (currentFlows.length > 1) {
        const btnDel = document.createElement('button');
        btnDel.className = 'flow-tab-btn flow-tab-del';
        btnDel.title = 'Delete flow';
        btnDel.textContent = '×';
        btnDel.addEventListener('click', e => {
          e.stopPropagation();
          if (confirm(`Delete "${flow.name}"? This cannot be undone.`)) {
            cb.onDelete(flow.id);
          }
        });
        tab.appendChild(btnDel);
      }

      // Single click → switch
      tab.addEventListener('click', () => {
        if (flow.id !== currentActive) cb.onSwitch(flow.id);
      });

      // Double-click → rename inline
      let renameTimer = 0;
      tab.addEventListener('dblclick', e => {
        e.stopPropagation();
        clearTimeout(renameTimer);
        const inp = document.createElement('input');
        inp.className = 'flow-tab-input';
        inp.value = flow.name;
        nameEl.replaceWith(inp);
        inp.focus();
        inp.select();
        const commit = () => {
          const val = inp.value.trim() || flow.name;
          inp.replaceWith(nameEl);
          nameEl.textContent = val;
          if (val !== flow.name) cb.onRename(flow.id, val);
        };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'Enter')  { inp.removeEventListener('blur', commit); commit(); }
          if (ev.key === 'Escape') { inp.removeEventListener('blur', commit); inp.replaceWith(nameEl); }
          ev.stopPropagation();
        });
        inp.addEventListener('click', ev => ev.stopPropagation());
      });

      list.appendChild(tab);
    }
  }

  renderTabs();

  return {
    setActive(id: string) {
      currentActive = id;
      list.querySelectorAll<HTMLElement>('.flow-tab').forEach(el => {
        el.classList.toggle('flow-tab-active', el.dataset['fid'] === id);
      });
    },
    setFlows(updated: Flow[]) {
      currentFlows = updated;
      renderTabs();
    },
  };
}

/** Trigger a download of a flow as an outline .txt file. */
export function downloadFlowAsOutline(flow: Flow): void {
  const text = treeToOutline(flow.tree);
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${flow.name.replace(/[^a-z0-9]/gi, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
