import './style.css';
import type { TreeNode, DragState, SelectionState } from './types';
import { DEFAULT_TREE } from './data';
import {
  doLayout, flattenTree, collectEdges, canvasSize,
  centerY, topY, NW, NH, RH, PAD,
} from './layout';
import { swapNodes, cloneTree } from './tree';
import { mountRetentionWidget } from './retention';
import { saveLocal, loadLocal, saveRemote, loadRemote } from './storage';
import { mountToolbar } from './toolbar';

// ── State ─────────────────────────────────────────────────────────────────────

let tree: TreeNode = (() => {
  const local = loadLocal();
  return local ? local : cloneTree(DEFAULT_TREE);
})();

let allNodes: TreeNode[] = [];
let allEdges: [TreeNode, TreeNode][] = [];

let sel: string | null = null;       // selected branch id
let selNodeId: string | null = null;  // selected node id
let editing = false;
let tapTimer = 0;
let tapId: string | null = null;

const dr: DragState = {
  node: null, el: null, ghost: null, target: null,
  sx: 0, sy: 0, on: false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const app   = document.getElementById('app')!;
app.innerHTML = `
  <div id="hint">tap to select · drag to swap · double-click to rename · hover / for retention</div>
  <div id="vp">
    <div id="cnv">
      <svg id="svgl"></svg>
      <svg id="drag-ov"></svg>
    </div>
  </div>
`;

const vp    = document.getElementById('vp')!;
const cnv   = document.getElementById('cnv')!;
const svgl  = document.getElementById('svgl') as unknown as SVGSVGElement;
const dragOv= document.getElementById('drag-ov') as unknown as SVGSVGElement;

// ── Toolbar ───────────────────────────────────────────────────────────────────

const { setSaving, setSaved } = mountToolbar({
  onSave: async () => {
    setSaving(true);
    saveLocal(tree);
    const ok = await saveRemote(tree);
    setSaving(false);
    setSaved(ok);
  },
  onReset: () => {
    tree = cloneTree(DEFAULT_TREE);
    localStorage.removeItem('fit4me_tree_v1');
    rebuildTree();
    render();
  },
});

// ── Layout helpers ────────────────────────────────────────────────────────────

function rebuildTree() {
  doLayout(tree, 0, 0);
  allNodes  = flattenTree(tree);
  allEdges  = collectEdges(tree);
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

// ── Selection helpers ─────────────────────────────────────────────────────────

function nodeState(n: TreeNode): SelectionState {
  if (!sel) return 'def';
  if (n.id === selNodeId) return 'act';   // the tapped node → highlighted
  if (!n.b) return 'par';                  // structural nodes (root, nav) → normal
  return n.b === sel ? 'def' : 'dim';     // same branch → normal, other branch → dim
}

function edgeState(from: TreeNode, to: TreeNode): SelectionState {
  if (!sel) return 'par';
  const fs = nodeState(from), ts = nodeState(to);
  if (fs === 'act' || ts === 'act') return 'act';  // edges touching selected node → dark
  if (fs === 'dim' || ts === 'dim') return 'dim';
  return 'par';
}

// ── Drag helpers ──────────────────────────────────────────────────────────────

const canDrag = (n: TreeNode) => n.type !== 'root' && n.type !== 'nav';

function applyDragClasses() {
  cnv.querySelectorAll<HTMLElement>('.nd').forEach(el => {
    if (el.dataset['nid'] === dr.node!.id) el.classList.add('nd-source');
    else el.classList.add('nd-dim');
  });
}

function setTarget(next: TreeNode | null) {
  if (dr.target === next) return;

  if (dr.target) {
    const old = cnv.querySelector<HTMLElement>(`[data-nid="${dr.target.id}"]`);
    old?.classList.remove('nd-target');
    old?.classList.add('nd-dim');
  }

  dr.target = next;

  if (dr.target) {
    const el = cnv.querySelector<HTMLElement>(`[data-nid="${dr.target.id}"]`);
    el?.classList.remove('nd-dim');
    el?.classList.add('nd-target');
  }

  if (dr.ghost) {
    const sub = dr.ghost.querySelector<HTMLElement>('.g-sub')!;
    if (dr.target) {
      sub.textContent = '↕ ' + dr.target.label;
      dr.ghost.classList.add('has-target');
    } else {
      dr.ghost.classList.remove('has-target');
    }
  }

  updateDragOverlay();
}

function updateDragOverlay() {
  const NS = 'http://www.w3.org/2000/svg';
  dragOv.innerHTML = '';
  if (!dr.on || !dr.target) return;

  const x1 = dr.node!.x! + NW / 2, y1 = centerY(dr.node!);
  const x2 = dr.target.x! + NW / 2, y2 = centerY(dr.target);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

  const mk = (tag: string, attrs: Record<string, string | number>, parent: SVGElement) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    parent.appendChild(el);
    return el;
  };

  mk('line', { x1, y1, x2, y2, stroke: '#1A1A1A', 'stroke-width': 1.2, 'stroke-dasharray': '5 3', 'stroke-opacity': 0.35 }, dragOv);
  mk('circle', { cx: x1, cy: y1, r: 3.5, fill: '#ABABAA' }, dragOv);
  mk('circle', { cx: x2, cy: y2, r: 3.5, fill: '#1A1A1A' }, dragOv);
  mk('rect', { x: mx - 13, y: my - 9, width: 26, height: 18, rx: 2, fill: '#1A1A1A' }, dragOv);
  const txt = document.createElementNS(NS, 'text');
  txt.setAttribute('x', String(mx)); txt.setAttribute('y', String(my + 5));
  txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', '#fff');
  txt.setAttribute('font-size', '11'); txt.setAttribute('font-family', 'Space Mono,monospace');
  txt.textContent = '⇄';
  dragOv.appendChild(txt);
}

function dragBegin(n: TreeNode, el: HTMLElement, cx: number, cy: number) {
  if (!canDrag(n)) return;
  dr.node = n; dr.el = el; dr.sx = cx; dr.sy = cy; dr.on = false;
}

function dragMove(cx: number, cy: number) {
  if (!dr.node) return;
  if (!dr.on && Math.hypot(cx - dr.sx, cy - dr.sy) > 8) {
    dr.on = true;
    clearTimeout(tapTimer); tapTimer = 0; tapId = null;
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
    document.body.style.cursor = 'grabbing';
  }
  if (!dr.on) return;

  dr.ghost!.style.left = (cx - NW / 2) + 'px';
  dr.ghost!.style.top  = (cy - NH / 2) + 'px';

  const rect = cnv.getBoundingClientRect();
  const mx = cx - rect.left + vp.scrollLeft;
  const my = cy - rect.top  + vp.scrollTop;

  let hit: TreeNode | null = null;
  for (const n of allNodes) {
    if (n === dr.node || !canDrag(n)) continue;
    if (mx >= n.x! && mx <= n.x! + NW && my >= topY(n) && my <= topY(n) + NH) {
      hit = n;
      break;
    }
  }
  setTarget(hit);
}

function dragEnd() {
  if (!dr.node) return;
  if (dr.on) {
    if (dr.target && dr.target !== dr.node) {
      swapNodes(tree, dr.node, dr.target);
      rebuildTree();
      saveLocal(tree);
    }
    dr.ghost?.remove();
    svgl.classList.remove('dimmed');
    dragOv.innerHTML = '';
    cnv.querySelectorAll('.nd-source, .nd-dim, .nd-target').forEach(e => {
      e.classList.remove('nd-source', 'nd-dim', 'nd-target');
    });
    document.body.style.cursor = '';
    // Only re-render after an actual drag (same as original).
    // For plain clicks, render() must NOT run here — it would remove all
    // .nd elements before the click event fires, swallowing the click.
    render();
  }
  dr.node = dr.el = dr.ghost = dr.target = null;
  dr.on = false;
}

document.addEventListener('mousemove', e => dragMove(e.clientX, e.clientY));
document.addEventListener('mouseup',   () => dragEnd());
document.addEventListener('touchmove', e => {
  const t = e.touches[0];
  dragMove(t.clientX, t.clientY);
  if (dr.on) e.preventDefault();
}, { passive: false });
document.addEventListener('touchend', () => dragEnd());

// ── Render: edges ─────────────────────────────────────────────────────────────

function renderSVG() {
  svgl.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  for (const [f, t] of allEdges) {
    const x1 = f.x! + NW, y1 = centerY(f);
    const x2 = t.x!,       y2 = centerY(t);
    const mx  = (x1 + x2) / 2;
    const es  = edgeState(f, t);
    const stroke = es === 'act' ? '#1A1A1A' : es === 'dim' ? '#E0DFD9' : '#ABABAA';
    const sw     = es === 'act' ? 1.5 : 1;
    const path   = document.createElementNS(NS, 'path');
    path.setAttribute('d',            `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
    path.setAttribute('fill',         'none');
    path.setAttribute('stroke',       stroke);
    path.setAttribute('stroke-width', String(sw));
    svgl.appendChild(path);
  }
}

// ── Render: nodes ─────────────────────────────────────────────────────────────

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

    el.style.left   = n.x + 'px';
    el.style.top    = topY(n) + 'px';
    el.style.width  = NW + 'px';
    el.style.height = NH + 'px';
    el.innerHTML = `<span class="nd-lbl">${n.label}</span>${n.sublabel ? `<span class="sub">${n.sublabel}</span>` : ''}`;

    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragBegin(n, el, e.clientX, e.clientY);
    });
    el.addEventListener('touchstart', e => {
      const t = e.touches[0];
      dragBegin(n, el, t.clientX, t.clientY);
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
            if (sel === n.b && selNodeId === n.id) {
              sel = null; selNodeId = null; // tap same node again → deselect
            } else {
              sel = n.b; selNodeId = n.id;
            }
          } else {
            sel = null; selNodeId = null;
          }
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
  const lbl  = el.querySelector<HTMLElement>('.nd-lbl')!;
  const orig = n.label;
  const inp  = document.createElement('input');
  inp.className = 'nd-input';
  inp.value = n.label;
  lbl.replaceWith(inp);
  inp.focus();
  inp.select();

  inp.addEventListener('click',     e => e.stopPropagation());
  inp.addEventListener('mousedown', e => e.stopPropagation());

  const commit = () => {
    n.label = inp.value.trim() || orig;
    editing = false;
    saveLocal(tree);
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

// ── Retention widget ──────────────────────────────────────────────────────────

rebuildTree();

const retention = mountRetentionWidget(
  cnv,
  () => allNodes.find(n => n.id === 'p28')!,
  () => allNodes.find(n => n.id === 'days')!,
  nodeState,
);

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  renderSVG();
  renderNodes();
  retention.update();
}

cnv.addEventListener('click', () => {
  if (editing || dr.on) return;
  sel = null; selNodeId = null;
  render();
});

render();

// Auto-center on load
requestAnimationFrame(() => {
  vp.scrollTop = Math.max(0, PAD + (tree.row ?? 0) * RH + RH / 2 - vp.clientHeight / 2);
});

// ── Load remote tree on start ─────────────────────────────────────────────────

loadRemote().then(remote => {
  if (remote) {
    tree = remote;
    rebuildTree();
    render();
  }
});
