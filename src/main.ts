import './style.css';
import type { TreeNode, Flow, DragState, SelectionState, CrossEdge, RetentionPoint } from './types';
import { DEFAULT_TREE, RETENTION_DATA } from './data';
import {
  doLayout, flattenTree, collectEdges, canvasSize,
  centerY, topY, NW, NH, RH, PAD,
} from './layout';
import { swapNodes, cloneTree, addChildNode, removeNode, reparentNode } from './tree';
import { mountRetentionWidget, buildChart } from './retention';
import {
  saveFlowsLocal, loadFlowsLocal, saveActiveLocal, loadActiveLocal,
  saveFlowRemote, loadFlowsRemote, deleteFlowRemote,
} from './storage';
import { mountToolbar } from './toolbar';
import { mountFlowTabs, downloadFlowAsOutline } from './flowtabs';
import { parseOutline, treeToOutline } from './parser';
import fluidCursorFn from './fluid-cursor';

// ── Share URL helpers ─────────────────────────────────────────────────────────

function encodeFlow(flow: Flow): string {
  const json = JSON.stringify({ name: flow.name, tree: cloneTree(flow.tree) });
  return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))));
}

function decodeSharedFlow(): Flow | null {
  const hash = location.hash;
  if (!hash.startsWith('#share=')) return null;
  try {
    const raw  = atob(hash.slice(7));
    const json = decodeURIComponent(raw.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const data = JSON.parse(json) as { name: string; tree: TreeNode };
    location.hash = '';
    return { id: `flow-${Date.now()}`, name: data.name ?? 'Shared Flow', tree: data.tree };
  } catch { return null; }
}

// ── Initial flows ─────────────────────────────────────────────────────────────

const DEFAULT_FLOW: Flow = {
  id: 'default',
  name: 'Fit4Me',
  tree: cloneTree(DEFAULT_TREE),
};

function initFlows(): { flows: Flow[]; activeId: string } {
  const local = loadFlowsLocal();
  if (local && local.length > 0) {
    const activeId = loadActiveLocal() ?? local[0].id;
    return { flows: local, activeId };
  }
  return { flows: [DEFAULT_FLOW], activeId: DEFAULT_FLOW.id };
}

let { flows, activeId } = initFlows();
const getActive = (): Flow => flows.find(f => f.id === activeId) ?? flows[0];

// Auto-import shared flow from URL
const sharedFlow = decodeSharedFlow();
if (sharedFlow && !flows.find(f => f.id === sharedFlow.id)) {
  flows.push(sharedFlow);
  activeId = sharedFlow.id;
  saveFlowsLocal(flows);
  saveActiveLocal(activeId);
}

// ── Undo / Redo ───────────────────────────────────────────────────────────────

const undoStacks = new Map<string, string[]>();
const redoStacks = new Map<string, string[]>();

function pushUndo() {
  const id = activeId;
  if (!undoStacks.has(id)) undoStacks.set(id, []);
  if (!redoStacks.has(id)) redoStacks.set(id, []);
  const stack = undoStacks.get(id)!;
  stack.push(JSON.stringify(cloneTree(getActive().tree)));
  if (stack.length > 60) stack.shift();
  redoStacks.get(id)!.length = 0;
  syncUndoRedoUI();
}

function applySnapshot(json: string) {
  getActive().tree = JSON.parse(json) as TreeNode;
  rebuildTree(); saveFlowsLocal(flows); render();
  syncUndoRedoUI();
}

function undo() {
  const id = activeId;
  const stack = undoStacks.get(id);
  if (!stack?.length) return;
  if (!redoStacks.has(id)) redoStacks.set(id, []);
  redoStacks.get(id)!.push(JSON.stringify(cloneTree(getActive().tree)));
  applySnapshot(stack.pop()!);
}

function redo() {
  const id = activeId;
  const stack = redoStacks.get(id);
  if (!stack?.length) return;
  if (!undoStacks.has(id)) undoStacks.set(id, []);
  undoStacks.get(id)!.push(JSON.stringify(cloneTree(getActive().tree)));
  applySnapshot(stack.pop()!);
}

let setUndoEnabled!: (v: boolean) => void;
let setRedoEnabled!: (v: boolean) => void;

// ── Text-edit mode ────────────────────────────────────────────────────────────

let textEditOpen = false;
let textEditPanel: HTMLElement | null = null;

function openTextEdit() {
  if (textEditPanel) return;
  textEditOpen = true;
  setTextEditActive(true);

  const panel = document.createElement('div');
  panel.id = 'text-edit-panel';
  textEditPanel = panel;

  const header = document.createElement('div');
  header.id = 'text-edit-header';
  header.innerHTML = `
    <span id="text-edit-title">Edit outline — <kbd>Shift+↵</kbd> new block · <kbd>Tab</kbd> indent · <kbd>Ctrl+↵</kbd> apply · <kbd>Esc</kbd> cancel</span>
    <span id="text-edit-err"></span>
  `;
  panel.appendChild(header);

  const ta = document.createElement('textarea');
  ta.id = 'text-edit-ta';
  ta.spellcheck = false;
  ta.value = treeToOutline(getActive().tree);
  panel.appendChild(ta);

  const footer = document.createElement('div');
  footer.id = 'text-edit-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'te-btn te-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeTextEdit);

  const applyBtn = document.createElement('button');
  applyBtn.className = 'te-btn te-btn-apply';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', () => applyTextEdit(ta));

  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);
  panel.appendChild(footer);

  document.body.appendChild(panel);
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(0, 0); });

  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeTextEdit(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); applyTextEdit(ta); }

    // Shift+Enter → new sibling block (same indent level)
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      const s = ta.selectionStart, val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      const indent = (val.slice(lineStart).match(/^ */) ?? [''])[0];
      ta.value = val.slice(0, s) + '\n' + indent + val.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 1 + indent.length;
    }

    // Tab → indent current line by 2 spaces
    if (!e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      ta.value = val.slice(0, lineStart) + '  ' + val.slice(lineStart);
      ta.selectionStart = ta.selectionEnd = s + 2;
    }

    // Shift+Tab → outdent current line by up to 2 spaces
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, val = ta.value;
      const lineStart = val.lastIndexOf('\n', s - 1) + 1;
      const spaces = (val.slice(lineStart).match(/^ {1,2}/) ?? [''])[0].length;
      if (spaces > 0) {
        ta.value = val.slice(0, lineStart) + val.slice(lineStart + spaces);
        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, s - spaces);
      }
    }

    e.stopPropagation();
  });
}

function applyTextEdit(ta: HTMLTextAreaElement) {
  const errEl = document.getElementById('text-edit-err')!;
  try {
    const tree = parseOutline(ta.value);
    pushUndo();
    getActive().tree = tree;
    rebuildTree();
    saveFlowsLocal(flows);
    closeTextEdit();
    render();
  } catch (e) {
    errEl.textContent = String(e);
  }
}

function closeTextEdit() {
  textEditPanel?.remove();
  textEditPanel = null;
  textEditOpen = false;
  setTextEditActive(false);
}

function toggleTextEdit() {
  if (textEditOpen) closeTextEdit(); else openTextEdit();
}

function syncUndoRedoUI() {
  setUndoEnabled(!!(undoStacks.get(activeId)?.length));
  setRedoEnabled(!!(redoStacks.get(activeId)?.length));
}

// ── Per-canvas state ──────────────────────────────────────────────────────────

let allNodes: TreeNode[] = [];
let allEdges: [TreeNode, TreeNode][] = [];

let sel: string | null = null;
let selNodeId: string | null = null;
let editing = false;
let tapTimer = 0;
let tapId: string | null = null;

const dr: DragState = {
  node: null, el: null, ghost: null, target: null,
  sx: 0, sy: 0, cx: 0, cy: 0, on: false, mode: 'swap',
};

// ── DOM ───────────────────────────────────────────────────────────────────────

const app = document.getElementById('app')!;
app.innerHTML = `
  <div id="hint">tap to select · drag to swap · double-tap to rename</div>
  <div id="vp">
    <div id="cnv">
      <svg id="svgl"></svg>
      <svg id="drag-ov"></svg>
    </div>
  </div>
`;

const vp      = document.getElementById('vp')!;
const cnv     = document.getElementById('cnv')!;
const hintEl  = document.getElementById('hint')!;
const svgl   = document.getElementById('svgl')   as unknown as SVGSVGElement;
const dragOv = document.getElementById('drag-ov') as unknown as SVGSVGElement;

// ── Toolbar ───────────────────────────────────────────────────────────────────

let setTextEditActive!: (v: boolean) => void;

const { setSaving, setSaved, setResetEnabled, setUndoEnabled: _sue, setRedoEnabled: _sre, setTextEditActive: _stea } = mountToolbar({
  onSave: async () => {
    setSaving(true);
    saveFlowsLocal(flows);
    const errs = (await Promise.all(flows.map(f => saveFlowRemote(f)))).filter(Boolean);
    setSaving(false);
    setSaved(errs.length > 0 ? (errs[0] ?? 'Unknown error') : null);
  },
  onReset: () => {
    const active = getActive();
    if (active.id !== DEFAULT_FLOW.id) return;
    pushUndo();
    active.tree = cloneTree(DEFAULT_TREE);
    saveFlowsLocal(flows);
    rebuildTree();
    render();
  },
  onUndo: undo,
  onRedo: redo,
  onTextEdit: toggleTextEdit,
});
setUndoEnabled    = _sue;
setRedoEnabled    = _sre;
setTextEditActive = _stea;

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !textEditOpen) { e.preventDefault(); openTextEdit(); }
});

// ── Flow tabs ─────────────────────────────────────────────────────────────────

setResetEnabled(activeId === DEFAULT_FLOW.id);

const tabs = mountFlowTabs(flows, activeId, {
  onSwitch(id) {
    closeTextEdit();
    activeId = id;
    saveActiveLocal(id);
    setResetEnabled(id === DEFAULT_FLOW.id);
    sel = null; selNodeId = null;
    rebuildTree();
    render();
    tabs.setActive(id);
    syncUndoRedoUI();
  },
  onRename(id, name) {
    const f = flows.find(f => f.id === id);
    if (f) { f.name = name; saveFlowsLocal(flows); }
  },
  onDelete(id) {
    flows = flows.filter(f => f.id !== id);
    deleteFlowRemote(id);
    if (activeId === id) activeId = flows[0].id;
    saveFlowsLocal(flows);
    saveActiveLocal(activeId);
    setResetEnabled(activeId === DEFAULT_FLOW.id);
    tabs.setFlows(flows);
    tabs.setActive(activeId);
    sel = null; selNodeId = null;
    rebuildTree();
    render();
  },
  onImport(flow) {
    flows.push(flow);
    activeId = flow.id;
    saveFlowsLocal(flows);
    saveActiveLocal(activeId);
    saveFlowRemote(flow);
    setResetEnabled(false);
    tabs.setFlows(flows);
    tabs.setActive(activeId);
    sel = null; selNodeId = null;
    rebuildTree();
    render();
  },
  onNew(flow) {
    flows.push(flow);
    activeId = flow.id;
    saveFlowsLocal(flows);
    saveActiveLocal(activeId);
    saveFlowRemote(flow);
    setResetEnabled(false);
    tabs.setFlows(flows);
    tabs.setActive(activeId);
    sel = null; selNodeId = null;
    rebuildTree();
    render();
  },
  onExport(id) {
    const f = flows.find(f => f.id === id);
    if (f) downloadFlowAsOutline(f);
  },
  onShare(id) {
    const f = flows.find(f => f.id === id);
    if (!f) return;
    const url = `${location.origin}${location.pathname}#share=${encodeFlow(f)}`;
    navigator.clipboard.writeText(url).catch(() => prompt('Copy share link:', url));
  },
});

// ── Layout ────────────────────────────────────────────────────────────────────

function rebuildTree() {
  doLayout(getActive().tree, 0, 0);
  allNodes = flattenTree(getActive().tree);
  allEdges = collectEdges(getActive().tree);
  animateEdgesNext = true;
  syncSize();
}

function syncSize() {
  const { cw, ch } = canvasSize(allNodes);
  cnv.style.width  = cw + 'px';
  cnv.style.height = ch + 'px';
  for (const svg of [svgl, dragOv]) {
    svg.setAttribute('width',   String(cw));
    svg.setAttribute('height',  String(ch));
    svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
  }
}

// ── Selection ─────────────────────────────────────────────────────────────────

function nodeState(n: TreeNode): SelectionState {
  if (!sel) return 'def';
  if (n.id === selNodeId) return 'act';
  if (!n.b) return 'par';
  return n.b === sel ? 'def' : 'dim';
}

function edgeState(from: TreeNode, to: TreeNode): SelectionState {
  if (!sel) return 'par';
  const fs = nodeState(from), ts = nodeState(to);
  if (fs === 'act' || ts === 'act') return 'act';
  if (fs === 'dim' || ts === 'dim') return 'dim';
  return 'par';
}

// ── Drag ──────────────────────────────────────────────────────────────────────

const canDrag    = (n: TreeNode) => n.type !== 'root' && n.type !== 'nav';
const canConnect = (n: TreeNode) => n.type !== 'nav';
const canBeChild = (n: TreeNode) => n.type !== 'root' && n.type !== 'nav';

function applyDragClasses() {
  cnv.querySelectorAll<HTMLElement>('.nd').forEach(el => {
    if (el.dataset['nid'] === dr.node!.id) el.classList.add('nd-source');
    else el.classList.add('nd-dim');
  });
}

function applyConnectClasses() {
  cnv.querySelectorAll<HTMLElement>('.nd').forEach(el => {
    if (el.dataset['nid'] === dr.node!.id) el.classList.add('nd-source');
  });
}

function setTarget(next: TreeNode | null) {
  if (dr.target === next) return;
  if (dr.target) {
    const old = cnv.querySelector<HTMLElement>(`[data-nid="${dr.target.id}"]`);
    old?.classList.remove('nd-target');
    if (dr.mode === 'swap') old?.classList.add('nd-dim');
  }
  dr.target = next;
  if (dr.target) {
    const el = cnv.querySelector<HTMLElement>(`[data-nid="${dr.target.id}"]`);
    el?.classList.remove('nd-dim');
    el?.classList.add('nd-target');
  }
  if (dr.mode === 'swap' && dr.ghost) {
    const sub = dr.ghost.querySelector<HTMLElement>('.g-sub')!;
    if (dr.target) { sub.textContent = '↕ ' + dr.target.label; dr.ghost.classList.add('has-target'); }
    else dr.ghost.classList.remove('has-target');
  }
  updateDragOverlay();
}

function updateDragOverlay() {
  const NS = 'http://www.w3.org/2000/svg';
  dragOv.innerHTML = '';
  if (!dr.on) return;
  const mk = (tag: string, attrs: Record<string, string | number>, parent: SVGElement) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    parent.appendChild(el); return el;
  };

  if (dr.mode === 'connect') {
    // Rubber-band line from source right-edge to cursor
    const x1 = dr.node!.x! + NW, y1 = centerY(dr.node!);
    const x2 = dr.cx, y2 = dr.cy;
    mk('line', { x1, y1, x2: dr.target ? dr.target.x! : x2, y2: dr.target ? centerY(dr.target) : y2,
      stroke: '#1A1A1A', 'stroke-width': 1.5, 'stroke-dasharray': '6 3' }, dragOv);
    mk('circle', { cx: x1, cy: y1, r: 3, fill: '#1A1A1A' }, dragOv);
    mk('circle', { cx: dr.target ? dr.target.x! : x2, cy: dr.target ? centerY(dr.target) : y2, r: 4,
      fill: dr.target ? '#1A1A1A' : '#BCBBB7', stroke: '#fff', 'stroke-width': 1.5 }, dragOv);
    return;
  }

  // Swap overlay
  if (!dr.target) return;
  const x1 = dr.node!.x! + NW / 2, y1 = centerY(dr.node!);
  const x2 = dr.target.x! + NW / 2, y2 = centerY(dr.target);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  mk('line', { x1, y1, x2, y2, stroke: '#1A1A1A', 'stroke-width': 1.2, 'stroke-dasharray': '5 3', 'stroke-opacity': 0.35 }, dragOv);
  mk('circle', { cx: x1, cy: y1, r: 3.5, fill: '#ABABAA' }, dragOv);
  mk('circle', { cx: x2, cy: y2, r: 3.5, fill: '#1A1A1A' }, dragOv);
  mk('rect', { x: mx - 13, y: my - 9, width: 26, height: 18, rx: 2, fill: '#1A1A1A' }, dragOv);
  const txt = document.createElementNS(NS, 'text');
  txt.setAttribute('x', String(mx)); txt.setAttribute('y', String(my + 5));
  txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', '#fff');
  txt.setAttribute('font-size', '11'); txt.setAttribute('font-family', 'LatteraMonoLL,Space Mono,monospace');
  txt.textContent = '⇄';
  dragOv.appendChild(txt);
}

function dragBegin(n: TreeNode, el: HTMLElement, cx: number, cy: number, mode: 'swap' | 'connect' = 'swap') {
  if (mode === 'swap' && !canDrag(n)) return;
  if (mode === 'connect' && !canConnect(n)) return;
  dr.node = n; dr.el = el; dr.sx = cx; dr.sy = cy; dr.on = false; dr.mode = mode;
}

function dragMove(cx: number, cy: number) {
  if (!dr.node) return;
  if (!dr.on && Math.hypot(cx - dr.sx, cy - dr.sy) > 8) {
    dr.on = true;
    clearTimeout(tapTimer); tapTimer = 0; tapId = null;
    if (dr.mode === 'swap') {
      svgl.classList.add('dimmed');
      applyDragClasses();
      dr.ghost = document.createElement('div');
      dr.ghost.id = 'ghost';
      dr.ghost.innerHTML = `<span class="g-lbl">${dr.node.label}</span><span class="g-sub"></span>`;
      dr.ghost.style.width = NW + 'px';
      if (dr.el?.classList.contains('t-tab')) {
        dr.ghost.querySelector<HTMLElement>('.g-lbl')!.style.fontWeight = '700';
      }
      document.body.appendChild(dr.ghost);
    } else {
      applyConnectClasses();
    }
    document.body.style.cursor = 'crosshair';
  }
  if (!dr.on) return;

  const rect = cnv.getBoundingClientRect();
  const mx = cx - rect.left;   // canvas-space X (getBoundingClientRect already accounts for scroll)
  const my = cy - rect.top;    // canvas-space Y
  dr.cx = mx; dr.cy = my;

  if (dr.mode === 'swap') {
    dr.ghost!.style.left = (cx - NW / 2) + 'px';
    dr.ghost!.style.top  = (cy - NH / 2) + 'px';
    let hit: TreeNode | null = null;
    for (const n of allNodes) {
      if (n === dr.node || !canDrag(n)) continue;
      if (mx >= n.x! && mx <= n.x! + NW && my >= topY(n) && my <= topY(n) + NH) { hit = n; break; }
    }
    setTarget(hit);
  } else {
    // connect mode: highlight valid targets
    let hit: TreeNode | null = null;
    for (const n of allNodes) {
      if (n === dr.node || !canBeChild(n)) continue;
      if (mx >= n.x! && mx <= n.x! + NW && my >= topY(n) && my <= topY(n) + NH) { hit = n; break; }
    }
    setTarget(hit);
    updateDragOverlay();
  }
}

function dragEnd() {
  if (!dr.node) return;
  const wasOn = dr.on;
  const mode  = dr.mode;
  const src   = dr.node;
  const tgt   = dr.target;

  // Cleanup visuals
  dr.ghost?.remove();
  svgl.classList.remove('dimmed');
  dragOv.innerHTML = '';
  cnv.querySelectorAll('.nd-source, .nd-dim, .nd-target').forEach(e => {
    e.classList.remove('nd-source', 'nd-dim', 'nd-target');
  });
  document.body.style.cursor = '';
  dr.node = dr.el = dr.ghost = dr.target = null;
  dr.on = false;

  if (mode === 'swap') {
    if (wasOn && tgt && tgt !== src) {
      pushUndo();
      swapNodes(getActive().tree, src, tgt);
      rebuildTree(); saveFlowsLocal(flows); render();
    }
  } else {
    // connect mode
    if (!wasOn) {
      pushUndo();
      const newNode = addChildNode(src);
      rebuildTree(); saveFlowsLocal(flows); render();
      requestAnimationFrame(() => {
        const el = cnv.querySelector<HTMLElement>(`[data-nid="${newNode.id}"]`);
        if (el) startEdit(el, newNode);
      });
    } else if (tgt) {
      pushUndo();
      const ok = reparentNode(getActive().tree, tgt.id, src.id);
      if (!ok) {
        // Cycle detected → create a back edge instead
        const flow = getActive();
        if (!flow.crossEdges) flow.crossEdges = [];
        flow.crossEdges.push({ id: `ce-${Date.now()}`, fromId: src.id, toId: tgt.id, type: 'back' });
      }
      rebuildTree(); saveFlowsLocal(flows); render();
    } else {
      pushUndo();
      const newNode = addChildNode(src);
      rebuildTree(); saveFlowsLocal(flows); render();
      requestAnimationFrame(() => {
        const el = cnv.querySelector<HTMLElement>(`[data-nid="${newNode.id}"]`);
        if (el) startEdit(el, newNode);
      });
    }
  }
}

document.addEventListener('mousemove', e => dragMove(e.clientX, e.clientY));
document.addEventListener('mouseup',   () => dragEnd());
document.addEventListener('touchmove', e => {
  const t = e.touches[0]; dragMove(t.clientX, t.clientY);
  if (dr.on) e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', () => dragEnd());

// ── Render edges ──────────────────────────────────────────────────────────────

const EDGE_STATUS = {
  up:   { icon: '▲', color: '#6B9B5E', bg: '#EEF5EA', border: '#A4C89A' },
  down: { icon: '▽', color: '#B52B1E', bg: '#FCECEA', border: '#D98A83' },
  ok:   { icon: '●', color: '#6B9B5E', bg: '#EEF5EA', border: '#A4C89A' },
  warn: { icon: '■', color: '#C8963C', bg: '#FDF4E7', border: '#DEB87A' },
} as const;

// ── Edge annotation picker ────────────────────────────────────────────────────

function closePicker() {
  document.getElementById('edge-picker')?.remove();
  document.getElementById('edge-chart-preview')?.remove();
}

function canvasToScreen(lx: number, ly: number) {
  const r = cnv.getBoundingClientRect();
  return { x: r.left + lx, y: r.top + ly };
}

function showEdgePicker(toNode: TreeNode, lx: number, ly: number) {
  closePicker();
  const { x: sx, y: sy } = canvasToScreen(lx, ly);

  const picker = document.createElement('div');
  picker.id = 'edge-picker';

  const addBtn = (icon: string, label: string, action: () => void, active = false) => {
    const btn = document.createElement('button');
    btn.className = 'ep-btn' + (active ? ' ep-btn-active' : '');
    btn.innerHTML = `<span class="ep-icon">${icon}</span><span class="ep-label">${label}</span>`;
    btn.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener('click',     e => { e.stopPropagation(); closePicker(); action(); });
    picker.appendChild(btn);
  };

  addBtn('💬', 'Note',     () => startEdgeEdit(toNode, lx, ly),               !!toNode.edgeLabel);
  addBtn('◉',  'Status',   () => showStatusPicker(toNode, lx, ly),             !!toNode.edgeStatus);
  addBtn('/',  'Analytics',() => showEdgeAnalytics(toNode, lx, ly),            !!toNode.edgeRetention);

  // Position: above click point, clamped to viewport
  document.body.appendChild(picker);
  const pw = picker.offsetWidth || 180, ph = picker.offsetHeight || 40;
  const x = Math.min(Math.max(sx - pw / 2, 156), window.innerWidth - pw - 8);
  const y = Math.max(sy - ph - 10, 38);
  picker.style.left = x + 'px';
  picker.style.top  = y + 'px';

  const close = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) { closePicker(); document.removeEventListener('mousedown', close); }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function showStatusPicker(toNode: TreeNode, lx: number, ly: number) {
  closePicker();
  const { x: sx, y: sy } = canvasToScreen(lx, ly);

  const picker = document.createElement('div');
  picker.id = 'edge-picker';
  picker.classList.add('ep-status');

  const opts: { val: typeof toNode.edgeStatus; icon: string; color?: string }[] = [
    { val: undefined, icon: '✕' },
    { val: 'up',   icon: '▲', color: EDGE_STATUS.up.color },
    { val: 'down', icon: '▽', color: EDGE_STATUS.down.color },
    { val: 'ok',   icon: '●', color: EDGE_STATUS.ok.color },
    { val: 'warn', icon: '■', color: EDGE_STATUS.warn.color },
  ];

  opts.forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'ep-st-btn' + (toNode.edgeStatus === o.val ? ' ep-st-active' : '');
    btn.textContent = o.icon;
    if (o.color) btn.style.color = o.color;
    btn.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener('click', e => {
      e.stopPropagation(); closePicker();
      pushUndo(); toNode.edgeStatus = o.val;
      saveFlowsLocal(flows); render();
    });
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);
  const pw = picker.offsetWidth || 160;
  const x = Math.min(Math.max(sx - pw / 2, 156), window.innerWidth - pw - 8);
  const y = Math.max(sy - (picker.offsetHeight || 36) - 10, 38);
  picker.style.left = x + 'px';
  picker.style.top  = y + 'px';

  const close = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) { closePicker(); document.removeEventListener('mousedown', close); }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function showEdgeAnalytics(toNode: TreeNode, lx: number, ly: number) {
  closePicker();
  document.getElementById('edge-analytics')?.remove();

  const { x: sx, y: sy } = canvasToScreen(lx, ly);
  const data: RetentionPoint[] = toNode.edgeRetention ? [...toNode.edgeRetention] : [...RETENTION_DATA];

  const popup = document.createElement('div');
  popup.id = 'edge-analytics';

  const hdr = document.createElement('div');
  hdr.className = 'ea-header';
  hdr.innerHTML = `<span>Analytics</span>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ea-close'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => popup.remove());
  hdr.appendChild(closeBtn);
  popup.appendChild(hdr);

  // Editable table
  const rebuildTable = () => {
    const old = popup.querySelector('.ea-body');
    if (old) old.remove();
    const body = document.createElement('div');
    body.className = 'ea-body';

    data.forEach((pt, i) => {
      const row = document.createElement('div');
      row.className = 'ea-row';

      const lbl = document.createElement('input');
      lbl.className = 'ret-inp ret-inp-lbl'; lbl.value = pt.s; lbl.placeholder = 'label';
      lbl.addEventListener('input', () => { data[i] = { ...data[i], s: lbl.value || pt.s }; syncData(); });

      const pct = document.createElement('input');
      pct.className = 'ret-inp ret-inp-pct'; pct.type = 'number';
      pct.min = '0'; pct.max = '100'; pct.step = '0.1'; pct.value = String(pt.pct);
      pct.addEventListener('input', () => {
        data[i] = { ...data[i], pct: Math.min(100, Math.max(0, parseFloat(pct.value) || 0)) };
        syncData();
      });

      const unit = document.createElement('span');
      unit.className = 'ret-pct-unit'; unit.textContent = '%';

      row.appendChild(lbl); row.appendChild(pct); row.appendChild(unit);

      if (data.length > 2) {
        const del = document.createElement('button');
        del.className = 'ret-row-del'; del.textContent = '×';
        del.addEventListener('click', () => { data.splice(i, 1); syncData(); rebuildTable(); });
        row.appendChild(del);
      }
      body.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'ret-add-row'; addBtn.textContent = '+ Add stage';
    addBtn.addEventListener('click', () => {
      data.push({ s: `s${data.length + 1}`, pct: Math.max(0, (data[data.length - 1]?.pct ?? 10) - 5) });
      syncData(); rebuildTable();
    });
    body.appendChild(addBtn);
    popup.appendChild(body);
  };

  const syncData = () => {
    pushUndo();
    toNode.edgeRetention = [...data];
    saveFlowsLocal(flows); render();
  };

  rebuildTable();

  const footer = document.createElement('div');
  footer.className = 'ea-footer';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'ret-reset ea-remove-btn'; removeBtn.textContent = '× Remove analytics';
  removeBtn.addEventListener('click', () => {
    toNode.edgeRetention = undefined; pushUndo(); saveFlowsLocal(flows); render();
    popup.remove();
  });

  const doneBtn = document.createElement('button');
  doneBtn.className = 'ea-done-btn'; doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => popup.remove());

  footer.appendChild(removeBtn);
  footer.appendChild(doneBtn);
  popup.appendChild(footer);

  document.body.appendChild(popup);
  const pw = 220;
  const x = Math.min(Math.max(sx - pw / 2, 156), window.innerWidth - pw - 8);
  const y = Math.max(Math.min(sy + 10, window.innerHeight - 300), 38);
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';
}

function showCrossEdgePicker(ce: CrossEdge, lx: number, ly: number) {
  closePicker();
  const { x: sx, y: sy } = canvasToScreen(lx, ly);

  const picker = document.createElement('div');
  picker.id = 'edge-picker';

  // Toggle type
  const typeLbl = ce.type === 'back' ? '↩ Back' : '⤳ Ref';
  const typeBtn = document.createElement('button');
  typeBtn.className = 'ep-btn';
  typeBtn.innerHTML = `<span class="ep-icon">${ce.type === 'back' ? '↩' : '⤳'}</span><span class="ep-label">${typeLbl}</span>`;
  typeBtn.addEventListener('click', e => {
    e.stopPropagation(); closePicker();
    pushUndo(); ce.type = ce.type === 'back' ? 'ref' : 'back';
    saveFlowsLocal(flows); render();
  });
  picker.appendChild(typeBtn);

  // Edit label
  const lblBtn = document.createElement('button');
  lblBtn.className = 'ep-btn' + (ce.label ? ' ep-btn-active' : '');
  lblBtn.innerHTML = `<span class="ep-icon">💬</span><span class="ep-label">Note</span>`;
  lblBtn.addEventListener('click', e => {
    e.stopPropagation(); closePicker();
    startCrossEdgeEdit(ce, lx, ly);
  });
  picker.appendChild(lblBtn);

  // Delete
  const delBtn = document.createElement('button');
  delBtn.className = 'ep-btn ep-btn-del';
  delBtn.innerHTML = `<span class="ep-icon">×</span><span class="ep-label">Delete</span>`;
  delBtn.addEventListener('click', e => {
    e.stopPropagation(); closePicker();
    pushUndo();
    const flow = getActive();
    flow.crossEdges = (flow.crossEdges ?? []).filter(x => x.id !== ce.id);
    saveFlowsLocal(flows); render();
  });
  picker.appendChild(delBtn);

  document.body.appendChild(picker);
  const pw = picker.offsetWidth || 200;
  const x = Math.min(Math.max(sx - pw / 2, 156), window.innerWidth - pw - 8);
  const y = Math.max(sy - (picker.offsetHeight || 40) - 10, 38);
  picker.style.left = x + 'px';
  picker.style.top  = y + 'px';

  const close = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) { closePicker(); document.removeEventListener('mousedown', close); }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function startCrossEdgeEdit(ce: CrossEdge, lx: number, ly: number) {
  const { x: sx, y: sy } = canvasToScreen(lx, ly);
  const inp = document.createElement('input');
  inp.className = 'edge-label-input';
  inp.value = ce.label ?? ''; inp.placeholder = 'add note…';
  inp.style.left = (sx - 50) + 'px';
  inp.style.top  = (Math.max(sy - 11, 38)) + 'px';
  document.body.appendChild(inp);
  inp.focus(); inp.select();
  const commit = () => {
    const v = inp.value.trim();
    pushUndo(); ce.label = v || undefined;
    inp.remove(); saveFlowsLocal(flows); render();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); inp.removeEventListener('blur', commit); commit(); }
    if (e.key === 'Escape') { inp.removeEventListener('blur', commit); inp.remove(); render(); }
  });
}

let animateEdgesNext = true;

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function svgText(txt: string, attrs: Record<string, string | number>): SVGTextElement {
  const el = svgEl('text', attrs) as SVGTextElement;
  el.textContent = txt;
  return el;
}

function renderSVG() {
  svgl.innerHTML = '';
  const doAnim = animateEdgesNext;
  animateEdgesNext = false;

  // ── Beam: only on edges downstream of selected node ───────────────────────
  const beamSourceIds = new Set<string>();
  if (selNodeId) {
    const collect = (n: TreeNode) => { beamSourceIds.add(n.id); for (const c of n.c ?? []) collect(c); };
    const selNode = allNodes.find(n => n.id === selNodeId);
    if (selNode) collect(selNode);
  }

  // ── Arrow marker defs (static) ────────────────────────────────────────────
  const NS_SVG = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(NS_SVG, 'defs');
  const mkDef = (html: string) => { const t = document.createElementNS(NS_SVG, 'g'); t.innerHTML = html; return t.firstElementChild!; };
  defs.appendChild(mkDef(`<marker id="arr-back" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#C8963C"/></marker>`));
  defs.appendChild(mkDef(`<marker id="arr-ref" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#ABABAA"/></marker>`));
  svgl.appendChild(defs);

  // ── Tree edges ─────────────────────────────────────────────────
  for (let ei = 0; ei < allEdges.length; ei++) {
    const [f, t] = allEdges[ei];
    const x1 = f.x! + NW, y1 = centerY(f), x2 = t.x!, y2 = centerY(t), mx = (x1 + x2) / 2;
    const lx = mx, ly = (y1 + y2) / 2;
    const es = edgeState(f, t);
    const stroke = es === 'act' ? '#1A1A1A' : es === 'dim' ? '#E0DFD9' : '#ABABAA';
    const sw     = es === 'act' ? 1.5 : 1;
    const d      = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

    const path = svgEl('path', { d, fill: 'none', stroke, 'stroke-width': sw, 'pointer-events': 'none' }) as SVGPathElement;
    if (doAnim) {
      const len = path.getTotalLength?.() ?? 200;
      path.style.strokeDasharray  = String(len);
      path.style.strokeDashoffset = String(len);
      path.style.animation = `edge-draw 0.35s ease-out ${ei * 0.025}s forwards`;
    }
    svgl.appendChild(path);

    // ── Animated beam (MagicUI style) ───────────────────────────
    // Only on edges whose source is the selected node or downstream of it
    if (beamSourceIds.has(f.id)) {
      const gradId  = `bg-${ei}`;
      const beamW   = 35;           // short flash width
      const gradY   = (y1 + y2) / 2;
      const CYCLE   = 30;           // full cycle: 30 seconds
      const SWEEP   = 0.9;          // beam sweeps in 0.9 s then hides
      const sf      = (SWEEP / CYCLE).toFixed(5);   // fraction of cycle that's visible
      const stagger = (ei * 0.18 % CYCLE).toFixed(2);

      // linearGradient with SMIL animation on x1/x2
      const grad = document.createElementNS(NS_SVG, 'linearGradient');
      grad.setAttribute('id', gradId);
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', String(x1 - beamW));
      grad.setAttribute('y1', String(gradY));
      grad.setAttribute('x2', String(x1));
      grad.setAttribute('y2', String(gradY));

      // Beam sweeps quickly, then gradient moves far off-screen for the rest of the 30s
      const mkAnim = (attr: string, v0: number, v1: number) => {
        const a = document.createElementNS(NS_SVG, 'animate');
        a.setAttribute('attributeName', attr);
        a.setAttribute('values',    `${v0};${v1};${v1 + 99999}`);
        a.setAttribute('keyTimes',  `0;${sf};1`);
        a.setAttribute('calcMode',  'linear');
        a.setAttribute('dur',       `${CYCLE}s`);
        a.setAttribute('repeatCount', 'indefinite');
        a.setAttribute('begin',     stagger + 's');
        return a;
      };
      grad.appendChild(mkAnim('x1', x1 - beamW, x2));
      grad.appendChild(mkAnim('x2', x1,         x2 + beamW));

      // Color stops: hard back edge → amber → violet → transparent front
      for (const [off, col, op] of [
        ['0%',    '#ffaa40', '0'],
        ['0.01%', '#ffaa40', '1'],   // sharp back edge (MagicUI style)
        ['32.5%', '#9c40ff', '1'],
        ['100%',  '#9c40ff', '0'],
      ] as const) {
        const stop = document.createElementNS(NS_SVG, 'stop');
        stop.setAttribute('offset', off); stop.setAttribute('stop-color', col); stop.setAttribute('stop-opacity', op);
        grad.appendChild(stop);
      }
      defs.appendChild(grad);

      // Overlay path using gradient as stroke
      svgl.appendChild(svgEl('path', {
        d, fill: 'none',
        stroke: `url(#${gradId})`,
        'stroke-width': String(sw + 2),
        'stroke-linecap': 'round',
        'pointer-events': 'none',
      }));
    }

    // Wide hit area → picker
    const hit = svgEl('path', { d, fill: 'none', stroke: 'rgba(0,0,0,0)', 'stroke-width': 14, 'pointer-events': 'stroke' });
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', e => { e.stopPropagation(); showEdgePicker(t, lx, ly); });
    svgl.appendChild(hit);

    // Annotation badges: horizontal layout centered on edge midpoint
    const BADGE_SZ = 14, BADGE_GAP = 4;
    const labelW = t.edgeLabel ? Math.max(t.edgeLabel.length * 6 + 10, 24) : 0;
    const bWidths = [
      ...(t.edgeLabel    ? [labelW]   : []),
      ...(t.edgeStatus   ? [BADGE_SZ] : []),
      ...(t.edgeRetention? [BADGE_SZ] : []),
    ];
    const totalBW = bWidths.reduce((s, w) => s + w, 0) + BADGE_GAP * Math.max(0, bWidths.length - 1);
    let bCursor = lx - totalBW / 2;
    const grabBX = (w: number) => { const cx = bCursor + w / 2; bCursor += w + BADGE_GAP; return cx; };

    // Label pill
    if (t.edgeLabel) {
      const bx = grabBX(labelW);
      svgl.appendChild(svgEl('rect', { x: bx - labelW / 2, y: ly - 7, width: labelW, height: 13, rx: 3,
        fill: '#FEFCF8', stroke: '#BCBBB7', 'stroke-width': 0.8, 'pointer-events': 'none' }));
      svgl.appendChild(svgText(t.edgeLabel, { x: bx, y: ly + 4, 'text-anchor': 'middle', fill: '#5A5955',
        'font-size': 10, 'font-family': 'LatteraMonoLL,Space Mono,monospace', 'pointer-events': 'none' }));
    }

    // Status badge
    if (t.edgeStatus) {
      const cfg = EDGE_STATUS[t.edgeStatus];
      const bx = grabBX(BADGE_SZ);
      svgl.appendChild(svgEl('rect', { x: bx - BADGE_SZ / 2, y: ly - BADGE_SZ / 2, width: BADGE_SZ, height: BADGE_SZ, rx: 2,
        fill: cfg.bg, stroke: cfg.border, 'stroke-width': 1, 'pointer-events': 'none' }));
      svgl.appendChild(svgText(cfg.icon, { x: bx, y: ly + 4, 'text-anchor': 'middle', fill: cfg.color,
        'font-size': 9, 'pointer-events': 'none' }));
    }

    // Analytics badge `/` — hover shows chart preview, click opens editor
    if (t.edgeRetention) {
      const bx = grabBX(BADGE_SZ);
      const aData = t.edgeRetention;
      const badgeBg = svgEl('rect', { x: bx - BADGE_SZ / 2, y: ly - BADGE_SZ / 2, width: BADGE_SZ, height: BADGE_SZ, rx: 2,
        fill: '#F0EDFF', stroke: '#9B8FD4', 'stroke-width': 1,
        'pointer-events': 'visiblePainted', cursor: 'pointer' });
      const badgeTx = svgText('/', { x: bx, y: ly + 4, 'text-anchor': 'middle', fill: '#6B5FBF',
        'font-size': 11, 'pointer-events': 'none' });
      let chartTimer = 0;
      const showChart = () => {
        clearTimeout(chartTimer);
        document.getElementById('edge-chart-preview')?.remove();
        const { x: sx, y: sy } = canvasToScreen(bx, ly);
        const pop = document.createElement('div');
        pop.id = 'edge-chart-preview';
        pop.style.cssText = `position:fixed;z-index:95;background:#1A1916;border:1px solid #2E2D2A;
          border-radius:6px;padding:10px;pointer-events:none;`;
        pop.appendChild(buildChart(aData));
        if (aData.length >= 2) {
          const last = aData[aData.length - 1];
          const s = document.createElement('div');
          s.style.cssText = 'font-size:10px;color:#AEADA8;margin-top:4px;text-align:center;font-family:monospace;';
          s.textContent = `${last.pct}% reach the final stage`;
          pop.appendChild(s);
        }
        document.body.appendChild(pop);
        const pw = 268, ph = pop.offsetHeight || 170;
        let px = sx - pw / 2, py = sy - ph - 10;
        px = Math.max(6, Math.min(px, window.innerWidth - pw - 6));
        py = py < 6 ? sy + 20 : py;
        pop.style.left = px + 'px'; pop.style.top = py + 'px';
      };
      const hideChart = () => { chartTimer = window.setTimeout(() => document.getElementById('edge-chart-preview')?.remove(), 120); };
      badgeBg.addEventListener('mouseenter', showChart);
      badgeBg.addEventListener('mouseleave', hideChart);
      badgeBg.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('edge-chart-preview')?.remove(); showEdgeAnalytics(t, bx, ly); });
      svgl.appendChild(badgeBg);
      svgl.appendChild(badgeTx);
    }

    // Hover hint if no annotations
    if (!t.edgeLabel && !t.edgeStatus && !t.edgeRetention) {
      const hintSq = svgEl('rect', { x: lx - 8, y: ly - 8, width: 16, height: 16, rx: 2,
        fill: '#FEFCF8', stroke: '#BCBBB7', 'stroke-width': 0.8, opacity: 0 });
      hintSq.style.transition = 'opacity 0.15s'; hintSq.style.cursor = 'pointer';
      const hintTx = svgText('+', { x: lx, y: ly + 5, 'text-anchor': 'middle', fill: '#BCBBB7',
        'font-size': 10, opacity: 0, 'pointer-events': 'none' });
      hintTx.style.transition = 'opacity 0.15s';
      hit.addEventListener('mouseenter', () => { hintSq.setAttribute('opacity', '1'); hintTx.setAttribute('opacity', '1'); });
      hit.addEventListener('mouseleave', () => { hintSq.setAttribute('opacity', '0'); hintTx.setAttribute('opacity', '0'); });
      svgl.appendChild(hintSq);
      svgl.appendChild(hintTx);
    }
  }

  // ── Cross / back edges ─────────────────────────────────────────
  const crossEdges = getActive().crossEdges ?? [];
  for (const ce of crossEdges) {
    const fn = allNodes.find(n => n.id === ce.fromId);
    const tn = allNodes.find(n => n.id === ce.toId);
    if (!fn || !tn) continue;

    const fx = fn.x! + NW, fy = centerY(fn);
    const tx = tn.x! + NW, ty = centerY(tn);
    const R  = Math.max(80, Math.abs(fx - tx) * 0.35 + 60);
    const d  = `M${fx} ${fy} C${fx + R} ${fy} ${tx + R} ${ty} ${tx} ${ty}`;

    const color  = ce.type === 'back' ? '#C8963C' : '#ABABAA';
    const dash   = ce.type === 'back' ? '7 4' : '3 4';
    const marker = ce.type === 'back' ? 'url(#arr-back)' : 'url(#arr-ref)';
    const lx = (fx + fx + R + tx + R + tx) / 4;  // rough bezier midpoint x
    const ly = (fy + ty) / 2;

    svgl.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.5,
      'stroke-dasharray': dash, 'marker-end': marker, 'pointer-events': 'none' }));

    // Hit area
    const hit = svgEl('path', { d, fill: 'none', stroke: 'rgba(0,0,0,0)', 'stroke-width': 14, 'pointer-events': 'stroke' });
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', e => { e.stopPropagation(); showCrossEdgePicker(ce, lx, ly); });
    svgl.appendChild(hit);

    // Type label + note
    const typeIcon = ce.type === 'back' ? '↩' : '⤳';
    const labelStr = ce.label ? `${typeIcon} ${ce.label}` : typeIcon;
    const tw = labelStr.length * 6 + 10;
    svgl.appendChild(svgEl('rect', { x: lx - tw / 2, y: ly - 9, width: tw, height: 14, rx: 3,
      fill: '#FEFCF8', stroke: color, 'stroke-width': 1, 'pointer-events': 'none' }));
    svgl.appendChild(svgText(labelStr, { x: lx, y: ly + 4, 'text-anchor': 'middle', fill: color,
      'font-size': 9, 'font-family': 'LatteraMonoLL,Space Mono,monospace', 'pointer-events': 'none' }));
  }
}

function startEdgeEdit(toNode: TreeNode, lx: number, ly: number) {
  const inp  = document.createElement('input');
  inp.className   = 'edge-label-input';
  inp.value       = toNode.edgeLabel ?? '';
  inp.placeholder = 'add note…';
  const sc = canvasToScreen(lx, ly);
  inp.style.left  = (sc.x - 50) + 'px';
  inp.style.top   = (sc.y - 11) + 'px';
  document.body.appendChild(inp);
  inp.focus(); inp.select();
  const commit = () => {
    const v = inp.value.trim();
    if (v !== (toNode.edgeLabel ?? '')) pushUndo();
    toNode.edgeLabel = v || undefined;
    inp.remove();
    saveFlowsLocal(flows);
    render();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); inp.removeEventListener('blur', commit); commit(); }
    if (e.key === 'Escape') { inp.removeEventListener('blur', commit); inp.remove(); render(); }
  });
}

// ── Render nodes ──────────────────────────────────────────────────────────────

function renderNodes() {
  if (editing) return;
  cnv.querySelectorAll('.nd').forEach(e => e.remove());
  for (const n of allNodes) {
    const el = document.createElement('div');
    el.className = 'nd';
    el.dataset['nid'] = n.id;
    if (n.type === 'root') el.classList.add('t-root');
    if (n.type === 'nav')  el.classList.add('t-nav');
    if (n.type === 'tab')  el.classList.add('t-tab');
    const st = nodeState(n);
    if (st === 'act') el.classList.add('s-active');
    else if (st === 'par') el.classList.add('s-partial');
    else if (st === 'dim') el.classList.add('s-dim');
    el.style.left = n.x + 'px'; el.style.top = topY(n) + 'px';
    el.style.width = NW + 'px'; el.style.height = NH + 'px';
    el.innerHTML = `<span class="nd-lbl">${n.label}</span>${n.sublabel ? `<span class="sub">${n.sublabel}</span>` : ''}`;

    // + handle (bottom-right): click → add child, drag → connect/reparent
    if (canConnect(n)) {
      const btnAdd = document.createElement('div');
      btnAdd.className = 'nd-handle nd-handle-add';
      btnAdd.textContent = '+';
      btnAdd.addEventListener('mousedown', e => {
        e.stopPropagation();
        dragBegin(n, el, e.clientX, e.clientY, 'connect');
      });
      btnAdd.addEventListener('click', e => e.stopPropagation());
      el.appendChild(btnAdd);
    }

    // × handle (top-right): click → delete
    if (n.type !== 'root' && n.type !== 'nav') {
      const btnDel = document.createElement('div');
      btnDel.className = 'nd-handle nd-handle-del';
      btnDel.textContent = '×';
      btnDel.addEventListener('click', e => {
        e.stopPropagation();
        const childCount = (n.c ?? []).length;
        const msg = childCount > 0
          ? `Delete "${n.label}" and its ${childCount} child block(s)?`
          : `Delete "${n.label}"?`;
        if (confirm(msg)) {
          pushUndo();
          removeNode(getActive().tree, n.id);
          rebuildTree(); saveFlowsLocal(flows); render();
        }
      });
      el.appendChild(btnDel);
    }

    el.addEventListener('mouseenter', () => { hintEl.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { hintEl.style.opacity = '0'; });
    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return; e.stopPropagation();
      dragBegin(n, el, e.clientX, e.clientY);
    });
    el.addEventListener('touchstart', e => {
      const t = e.touches[0]; dragBegin(n, el, t.clientX, t.clientY);
    }, { passive: true });
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (dr.on) return;
      if (tapTimer && tapId === n.id) {
        clearTimeout(tapTimer); tapTimer = 0; tapId = null;
        startEdit(el, n);
      } else {
        tapId = n.id;
        tapTimer = window.setTimeout(() => {
          tapTimer = 0; tapId = null;
          if (n.b) {
            if (sel === n.b && selNodeId === n.id) { sel = null; selNodeId = null; }
            else { sel = n.b; selNodeId = n.id; }
          } else { sel = null; selNodeId = null; }
          render();
        }, 270);
      }
    });
    cnv.appendChild(el);
  }
}

// ── Inline rename ─────────────────────────────────────────────────────────────

function startEdit(el: HTMLElement, n: TreeNode) {
  editing = true;
  pushUndo();
  const lbl = el.querySelector<HTMLElement>('.nd-lbl')!;
  const orig = n.label;
  const inp  = document.createElement('input');
  inp.className = 'nd-input'; inp.value = n.label;
  lbl.replaceWith(inp); inp.focus(); inp.select();
  inp.addEventListener('click',     e => e.stopPropagation());
  inp.addEventListener('mousedown', e => e.stopPropagation());
  const commit = () => {
    n.label = inp.value.trim() || orig;
    editing = false;
    saveFlowsLocal(flows);
    render();
  };
  const cancel = () => { n.label = orig; editing = false; render(); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); inp.removeEventListener('blur', commit); commit(); }
    if (e.key === 'Escape') { inp.removeEventListener('blur', commit); cancel(); }
  });
}

// ── Retention widget (available on all flows) ─────────────────────────────────

rebuildTree();

const retention = mountRetentionWidget(
  () => getActive().retentionData ?? [...RETENTION_DATA],
  (data) => {
    getActive().retentionData = data;
    saveFlowsLocal(flows);
  },
);

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  renderSVG();
  renderNodes();
  retention?.refresh();
}

// ── Fluid cursor (WebGL Navier-Stokes) ────────────────────────────────────────
// Disabled: conflicts with interactive grid background when both run together
// fluidCursorFn();

cnv.addEventListener('click', () => {
  if (editing || dr.on) return;
  sel = null; selNodeId = null;
  render();
});

// ── Interactive grid background (MagicUI style) ───────────────────────────────
// Individual SVG <rect> cells with asymmetric CSS transitions:
// fast 80ms highlight on enter, slow 1000ms fade-out on leave (linger effect)

const GRID_CELL = 40;
let gridCells: SVGRectElement[] = [];
let gridCols = 0;
let activeGridCell: SVGRectElement | null = null;
let gridSvgEl: SVGSVGElement | null = null;

function buildGrid() {
  gridSvgEl?.remove();
  const W = window.innerWidth - 148;
  const H = window.innerHeight;
  gridCols  = Math.ceil(W / GRID_CELL) + 1;
  const rows = Math.ceil(H / GRID_CELL) + 1;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  svg.id = 'grid-svg';
  svg.setAttribute('width',  String(gridCols * GRID_CELL));
  svg.setAttribute('height', String(rows * GRID_CELL));
  svg.style.cssText = 'position:fixed;left:148px;top:0;pointer-events:none;z-index:0;';

  gridCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement;
      rect.setAttribute('x', String(c * GRID_CELL));
      rect.setAttribute('y', String(r * GRID_CELL));
      rect.setAttribute('width',  String(GRID_CELL));
      rect.setAttribute('height', String(GRID_CELL));
      rect.classList.add('grid-cell');
      svg.appendChild(rect);
      gridCells.push(rect);
    }
  }
  document.body.appendChild(svg);
  gridSvgEl = svg;
}

buildGrid();

vp.addEventListener('mousemove', e => {
  const vr = vp.getBoundingClientRect();
  const col = Math.floor((e.clientX - vr.left) / GRID_CELL);
  const row = Math.floor((e.clientY - vr.top)  / GRID_CELL);
  const cell = gridCells[row * gridCols + col] ?? null;
  if (cell !== activeGridCell) {
    activeGridCell?.classList.remove('gc-active');
    cell?.classList.add('gc-active');
    activeGridCell = cell;
  }
});
vp.addEventListener('mouseleave', () => {
  activeGridCell?.classList.remove('gc-active');
  activeGridCell = null;
});
window.addEventListener('resize', () => { activeGridCell = null; buildGrid(); });

render();

requestAnimationFrame(() => {
  vp.scrollTop = Math.max(0, PAD + (getActive().tree.row ?? 0) * RH + RH / 2 - vp.clientHeight / 2);
});

// ── Load remote flows on start ────────────────────────────────────────────────

loadFlowsRemote().then(remote => {
  if (!remote || remote.length === 0) return;
  flows = remote;
  // Try to restore the previously active flow; fall back to first
  if (!flows.find(f => f.id === activeId)) activeId = flows[0].id;
  saveFlowsLocal(flows);
  saveActiveLocal(activeId);
  tabs.setFlows(flows);
  tabs.setActive(activeId);
  rebuildTree();
  render();
});

// Clear legacy single-flow localStorage key on first run
if (localStorage.getItem('fit4me_tree_v1')) {
  localStorage.removeItem('fit4me_tree_v1');
}
