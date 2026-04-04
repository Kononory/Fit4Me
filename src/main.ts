import './style.css';
import type { TreeNode, Flow, DragState, SelectionState } from './types';
import { DEFAULT_TREE, RETENTION_DATA } from './data';
import {
  doLayout, flattenTree, collectEdges, canvasSize,
  centerY, topY, NW, NH, RH, PAD,
} from './layout';
import { swapNodes, cloneTree, addChildNode, removeNode, reparentNode } from './tree';
import { mountRetentionWidget } from './retention';
import {
  saveFlowsLocal, loadFlowsLocal, saveActiveLocal, loadActiveLocal,
  saveFlowRemote, loadFlowsRemote, deleteFlowRemote,
} from './storage';
import { mountToolbar } from './toolbar';
import { mountFlowTabs, downloadFlowAsOutline } from './flowtabs';
import { parseOutline, treeToOutline } from './parser';

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
    <span id="text-edit-title">Edit outline — <kbd>Ctrl+Enter</kbd> to apply · <kbd>Esc</kbd> to cancel</span>
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

  vp.appendChild(panel);
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(0, 0); });

  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeTextEdit(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); applyTextEdit(ta); }
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
  const mx = cx - rect.left + vp.scrollLeft;
  const my = cy - rect.top  + vp.scrollTop;
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
      reparentNode(getActive().tree, tgt.id, src.id);
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
const STATUS_CYCLE: (keyof typeof EDGE_STATUS | undefined)[] = [undefined, 'up', 'down', 'ok', 'warn'];

let animateEdgesNext = true; // true on first render and after rebuildTree

function renderSVG() {
  svgl.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const doAnim = animateEdgesNext;
  animateEdgesNext = false;

  for (let ei = 0; ei < allEdges.length; ei++) {
    const [f, t] = allEdges[ei];
    const x1 = f.x! + NW, y1 = centerY(f), x2 = t.x!, y2 = centerY(t), mx = (x1 + x2) / 2;
    const lx = mx, ly = (y1 + y2) / 2;
    const es = edgeState(f, t);
    const stroke = es === 'act' ? '#1A1A1A' : es === 'dim' ? '#E0DFD9' : '#ABABAA';
    const sw     = es === 'act' ? 1.5 : 1;
    const d      = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d); path.setAttribute('fill', 'none');
    path.setAttribute('stroke', stroke); path.setAttribute('stroke-width', String(sw));
    path.setAttribute('pointer-events', 'none');
    if (doAnim) {
      const len = path.getTotalLength?.() ?? 200;
      path.style.strokeDasharray  = String(len);
      path.style.strokeDashoffset = String(len);
      path.style.animation = `edge-draw 0.35s ease-out ${ei * 0.025}s forwards`;
    }
    svgl.appendChild(path);

    // Hit area
    const hit = document.createElementNS(NS, 'path');
    hit.setAttribute('d', d); hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'rgba(0,0,0,0)'); hit.setAttribute('stroke-width', '14');
    hit.setAttribute('pointer-events', 'stroke');
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', e => { e.stopPropagation(); startEdgeEdit(t, lx, ly); });
    svgl.appendChild(hit);

    // ── Edge label ───────────────────────────────────────────────
    const hasLabel = !!t.edgeLabel;
    const labelY   = t.edgeStatus ? ly - 12 : ly;

    if (hasLabel) {
      const tw = t.edgeLabel!.length * 6.2 + 10;
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', String(lx - tw / 2)); bg.setAttribute('y', String(labelY - 8));
      bg.setAttribute('width', String(tw)); bg.setAttribute('height', '13');
      bg.setAttribute('rx', '3'); bg.setAttribute('fill', '#FEFCF8');
      bg.setAttribute('stroke', '#BCBBB7'); bg.setAttribute('stroke-width', '0.8');
      bg.setAttribute('pointer-events', 'none');
      svgl.appendChild(bg);
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', String(lx)); txt.setAttribute('y', String(labelY + 4));
      txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', '#5A5955');
      txt.setAttribute('font-size', '10'); txt.setAttribute('font-family', 'LatteraMonoLL,Space Mono,monospace');
      txt.setAttribute('pointer-events', 'none');
      txt.textContent = t.edgeLabel!;
      svgl.appendChild(txt);
    }

    // ── Status badge ─────────────────────────────────────────────
    if (t.edgeStatus) {
      const cfg = EDGE_STATUS[t.edgeStatus];
      const sx = lx - 8, sy = ly + (hasLabel ? 4 : -8);
      const sq = document.createElementNS(NS, 'rect');
      sq.setAttribute('x', String(sx)); sq.setAttribute('y', String(sy));
      sq.setAttribute('width', '16'); sq.setAttribute('height', '16');
      sq.setAttribute('rx', '2'); sq.setAttribute('fill', cfg.bg);
      sq.setAttribute('stroke', cfg.border); sq.setAttribute('stroke-width', '1');
      sq.style.cursor = 'pointer';
      sq.addEventListener('click', e => {
        e.stopPropagation();
        pushUndo();
        const idx = STATUS_CYCLE.indexOf(t.edgeStatus);
        t.edgeStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        saveFlowsLocal(flows); render();
      });
      svgl.appendChild(sq);
      const icon = document.createElementNS(NS, 'text');
      icon.setAttribute('x', String(lx)); icon.setAttribute('y', String(sy + 12));
      icon.setAttribute('text-anchor', 'middle'); icon.setAttribute('fill', cfg.color);
      icon.setAttribute('font-size', '9'); icon.setAttribute('pointer-events', 'none');
      icon.textContent = cfg.icon;
      svgl.appendChild(icon);
    } else {
      // ── Hover hint: + to add note / click square to set status ─
      const sbx = lx - 8, sby = ly - 8;
      const hintSq = document.createElementNS(NS, 'rect');
      hintSq.setAttribute('x', String(sbx)); hintSq.setAttribute('y', String(sby));
      hintSq.setAttribute('width', '16'); hintSq.setAttribute('height', '16');
      hintSq.setAttribute('rx', '2'); hintSq.setAttribute('fill', '#FEFCF8');
      hintSq.setAttribute('stroke', '#BCBBB7'); hintSq.setAttribute('stroke-width', '0.8');
      hintSq.setAttribute('opacity', '0'); hintSq.style.transition = 'opacity 0.15s';
      hintSq.style.cursor = 'pointer';
      hintSq.addEventListener('click', e => {
        e.stopPropagation();
        pushUndo();
        t.edgeStatus = 'up';
        saveFlowsLocal(flows); render();
      });
      hit.addEventListener('mouseenter', () => { hintSq.setAttribute('opacity', '1'); hintTxt.setAttribute('opacity', '1'); });
      hit.addEventListener('mouseleave', () => { hintSq.setAttribute('opacity', '0'); hintTxt.setAttribute('opacity', '0'); });
      svgl.appendChild(hintSq);
      const hintTxt = document.createElementNS(NS, 'text');
      hintTxt.setAttribute('x', String(lx)); hintTxt.setAttribute('y', String(sby + 11));
      hintTxt.setAttribute('text-anchor', 'middle'); hintTxt.setAttribute('fill', '#BCBBB7');
      hintTxt.setAttribute('font-size', '10'); hintTxt.setAttribute('pointer-events', 'none');
      hintTxt.setAttribute('opacity', '0'); hintTxt.style.transition = 'opacity 0.15s';
      hintTxt.textContent = '+';
      svgl.appendChild(hintTxt);
    }
  }
}

function startEdgeEdit(toNode: TreeNode, lx: number, ly: number) {
  const rect = cnv.getBoundingClientRect();
  const inp  = document.createElement('input');
  inp.className   = 'edge-label-input';
  inp.value       = toNode.edgeLabel ?? '';
  inp.placeholder = 'add note…';
  inp.style.left  = (rect.left + lx - vp.scrollLeft - 50) + 'px';
  inp.style.top   = (rect.top  + ly - vp.scrollTop  - 11) + 'px';
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

// ── Canvas ripple ─────────────────────────────────────────────────────────────

function spawnRipple(canvasX: number, canvasY: number) {
  const el = document.createElement('div');
  el.className = 'canvas-ripple';
  el.style.left = canvasX + 'px';
  el.style.top  = canvasY + 'px';
  cnv.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

vp.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  if (target !== vp && target !== cnv && target.id !== 'svgl') return;
  const rect = cnv.getBoundingClientRect();
  spawnRipple(
    e.clientX - rect.left + vp.scrollLeft,
    e.clientY - rect.top  + vp.scrollTop,
  );
});

cnv.addEventListener('click', () => {
  if (editing || dr.on) return;
  sel = null; selNodeId = null;
  render();
});

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
