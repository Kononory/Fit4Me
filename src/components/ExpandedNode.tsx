import { useRef, useState, useMemo, useCallback, Fragment, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { TreeNode, FlowShape } from '../types';
import { flattenTree, collectEdges } from '../layout';
import { addChildNode, removeNode, findNode, cloneTree } from '../tree';
import { useStore } from '../store';

interface Props {
  node: TreeNode;
  onClose: () => void;
}

// SubFlow layout constants
const SNW  = 240;
const SNH  = 120;
const SLW  = 296;
const SRH  = 144;
const SPAD = 40;

interface SFPos { x: number; cy: number; row: number }

function computeLayout(root: TreeNode): Map<string, SFPos> {
  const map = new Map<string, SFPos>();
  function lay(n: TreeNode, depth: number, startRow: number): number {
    const x = SPAD + depth * SLW;
    if (!n.c || n.c.length === 0) {
      map.set(n.id, { x, cy: SPAD + startRow * SRH + SRH / 2, row: startRow });
      return 1;
    }
    let cr = startRow, total = 0;
    for (const c of n.c) { const s = lay(c, depth + 1, cr); cr += s; total += s; }
    const first = map.get(n.c[0].id)!;
    const last  = map.get(n.c[n.c.length - 1].id)!;
    const row   = (first.row + last.row) / 2;
    map.set(n.id, { x, cy: SPAD + row * SRH + SRH / 2, row });
    return total;
  }
  lay(root, 0, 0);
  return map;
}

// ── Shape system ─────────────────────────────────────────────────────────────
// All shapes use 4-cubic-bezier SVG paths (identical command structure: M C C C C Z)
// so Framer Motion can interpolate between them as plain numbers — true path morphing.
// Card div is transparent; the SVG draws fill+stroke behind the content.
// Content div uses SHAPE_INSET padding to stay within the visible shape interior.

const SHAPE_PATHS: Record<FlowShape, string> = {
  rect:          'M 120,0 C 240,0 240,0 240,60 C 240,120 240,120 120,120 C 0,120 0,120 0,60 C 0,0 0,0 120,0 Z',
  stadium:       'M 120,0 C 216,0 240,24 240,60 C 240,96 216,120 120,120 C 24,120 0,96 0,60 C 0,24 24,0 120,0 Z',
  circle:        'M 120,0 C 186,0 240,27 240,60 C 240,93 186,120 120,120 C 54,120 0,93 0,60 C 0,27 54,0 120,0 Z',
  diamond:       'M 120,0 C 160,20 200,40 240,60 C 200,80 160,100 120,120 C 80,100 40,80 0,60 C 40,40 80,20 120,0 Z',
  parallelogram: 'M 138,0 C 240,0 240,0 222,60 C 240,120 204,120 102,120 C 0,120 0,120 18,60 C 0,0 36,0 138,0 Z',
}

// Content padding so text stays within the visible interior of each shape
const SHAPE_INSET: Record<FlowShape, CSSProperties> = {
  rect:          {},
  stadium:       { paddingLeft: 52, paddingRight: 52 },
  circle:        { paddingLeft: 40, paddingRight: 40, paddingTop: 10, paddingBottom: 10 },
  diamond:       { paddingLeft: 72, paddingRight: 72, paddingTop: 28, paddingBottom: 28 },
  parallelogram: { paddingLeft: 44, paddingRight: 10 },
}

const SHAPE_META: Record<FlowShape, [string, string]> = {
  rect:          ['Rectangle',     'Process / Screen'],
  stadium:       ['Stadium',       'Action / Button'],
  diamond:       ['Diamond',       'Decision (Yes/No)'],
  circle:        ['Circle',        'Start / End'],
  parallelogram: ['Parallelogram', 'Input / Output'],
}

const SHAPE_ORDER: FlowShape[] = ['rect', 'stadium', 'diamond', 'circle', 'parallelogram']

function ShapeIcon({ shape, size = 20 }: { shape: FlowShape; size?: number }) {
  const h = Math.round(size * 0.7);
  switch (shape) {
    case 'rect':
      return <svg width={size} height={h} viewBox="0 0 20 14"><rect x="1" y="1" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;
    case 'stadium':
      return <svg width={size} height={h} viewBox="0 0 20 14"><rect x="1" y="1" width="18" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;
    case 'diamond':
      return <svg width={size} height={h} viewBox="0 0 20 14"><polygon points="10,1 19,7 10,13 1,7" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;
    case 'circle':
      return <svg width={size} height={h} viewBox="0 0 20 14"><ellipse cx="10" cy="7" rx="9" ry="6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;
    case 'parallelogram':
      return <svg width={size} height={h} viewBox="0 0 20 14"><polygon points="4,1 19,1 16,13 1,13" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;
  }
}

// ── Presets ──────────────────────────────────────────────────────────────────

let _pid = 0;
function pid() { return `sf-${Date.now()}-${_pid++}`; }
function n(label: string, shape: FlowShape, children?: TreeNode[]): TreeNode {
  return { id: pid(), label, shape, c: children };
}

const PRESETS: Record<string, { label: string; build: () => TreeNode }> = {
  userflow: {
    label: 'User Flow',
    build: () => n('Start', 'circle', [
      n('Browse', 'rect', [
        n('Sign Up?', 'diamond', [
          n('Register', 'rect',          [n('Home', 'stadium')]),
          n('Login',    'parallelogram', [n('Home', 'stadium')]),
        ]),
      ]),
    ]),
  },
  userstory: {
    label: 'User Story',
    build: () => n('As a user…', 'stadium', [
      n('I want to…', 'parallelogram', [
        n('So that…', 'rect', [
          n('✓ Accepted', 'circle'),
        ]),
      ]),
    ]),
  },
  decision: {
    label: 'Decision Tree',
    build: () => n('Start', 'circle', [
      n('Question?', 'diamond', [
        n('Yes → Action',     'rect', [n('End', 'circle')]),
        n('No → Alternative', 'rect', [n('End', 'circle')]),
      ]),
    ]),
  },
};

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="sf-legend">
      <button className="sf-legend-toggle" onClick={() => setOpen(v => !v)}>
        {open ? '✕' : 'Legend'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="sf-legend-body"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
          >
            {SHAPE_ORDER.map(s => (
              <div key={s} className="sf-legend-row">
                <ShapeIcon shape={s} size={18} />
                <span className="sf-legend-name">{SHAPE_META[s][0]}</span>
                <span className="sf-legend-meaning">{SHAPE_META[s][1]}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ShapePicker ──────────────────────────────────────────────────────────────

function ShapePicker({ current, onSelect }: { current: FlowShape; onSelect: (s: FlowShape) => void }) {
  return (
    <div className="sf-shape-picker">
      {SHAPE_ORDER.map(s => (
        <button
          key={s}
          className={`sf-shape-btn${s === current ? ' sf-shape-btn-active' : ''}`}
          title={SHAPE_META[s][0]}
          onClick={e => { e.stopPropagation(); onSelect(s); }}
          onMouseDown={e => e.stopPropagation()}
        >
          <ShapeIcon shape={s} />
        </button>
      ))}
    </div>
  );
}

// ── SubFlow ──────────────────────────────────────────────────────────────────

function SubFlow({ root }: { root: TreeNode }) {
  const { updateActiveTree, getActive, pushUndo } = useStore();

  const [flow,    setFlow]    = useState<TreeNode | null>(() => root.innerFlow ?? null);
  const [selId,   setSelId]   = useState<string | null>(null);
  const [editId,  setEditId]  = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const prevRoot  = useRef(root);

  if (prevRoot.current !== root) {
    prevRoot.current = root;
    setFlow(root.innerFlow ?? null);
  }

  const saveFlow = useCallback((f: TreeNode | null) => {
    setFlow(f);
    root.innerFlow = f ?? undefined;
    updateActiveTree(getActive().tree);
  }, [root, getActive, updateActiveTree]);

  const addChild = useCallback((parentId: string) => {
    if (!flow) return;
    pushUndo();
    const cloned = cloneTree(flow);
    const parent = findNode(cloned, parentId);
    if (parent) addChildNode(parent);
    saveFlow(cloned);
  }, [flow, pushUndo, saveFlow]);

  const deleteNodeById = useCallback((nodeId: string) => {
    if (!flow) return;
    pushUndo();
    if (nodeId === flow.id) { saveFlow(null); setSelId(null); return; }
    const cloned = cloneTree(flow);
    removeNode(cloned, nodeId);
    saveFlow(cloned);
    if (selId === nodeId) setSelId(null);
  }, [flow, pushUndo, saveFlow, selId]);

  const commitLabel = useCallback((nodeId: string) => {
    const val = (inputRef.current?.value ?? '').trim();
    setEditId(null);
    if (!flow || !val) return;
    const original = findNode(flow, nodeId);
    if (!original || val === original.label) return;
    pushUndo();
    const cloned = cloneTree(flow);
    const target = findNode(cloned, nodeId);
    if (target) target.label = val;
    saveFlow(cloned);
  }, [flow, pushUndo, saveFlow]);

  const commitContent = useCallback((nodeId: string, val: string) => {
    if (!flow) return;
    const original = findNode(flow, nodeId);
    if (!original || val === (original.content ?? '')) return;
    pushUndo();
    const cloned = cloneTree(flow);
    const target = findNode(cloned, nodeId);
    if (target) target.content = val;
    saveFlow(cloned);
  }, [flow, pushUndo, saveFlow]);

  const changeShape = useCallback((nodeId: string, shape: FlowShape) => {
    if (!flow) return;
    pushUndo();
    const cloned = cloneTree(flow);
    const target = findNode(cloned, nodeId);
    if (target) target.shape = shape;
    saveFlow(cloned);
  }, [flow, pushUndo, saveFlow]);

  const loadPreset = useCallback((key: string) => {
    pushUndo();
    saveFlow(PRESETS[key].build());
    setSelId(null);
    setEditId(null);
  }, [pushUndo, saveFlow]);

  const layout = useMemo(() => flow ? computeLayout(flow) : new Map<string, SFPos>(), [flow]);
  const nodes  = useMemo(() => flow ? flattenTree(flow)  : [], [flow]);
  const edges  = useMemo(() => flow ? collectEdges(flow) : [], [flow]);

  const posVals = [...layout.values()];
  // Extra bottom padding so shape picker doesn't clip at canvas edge
  const cw = posVals.length ? Math.max(...posVals.map(p => p.x + SNW)) + SPAD : 320;
  const ch = posVals.length ? Math.max(...posVals.map(p => p.cy + SNH / 2)) + SPAD + 52 : 260;

  const presetBar = (
    <div className="sf-preset-bar">
      <span className="sf-preset-label">Presets:</span>
      {Object.entries(PRESETS).map(([key, { label }]) => (
        <button key={key} className="sf-preset-btn" onClick={() => loadPreset(key)}>{label}</button>
      ))}
    </div>
  );

  if (!flow) {
    return (
      <div className="sf-empty-wrap">
        {presetBar}
        <div className="sf-empty">
          <button
            className="sf-add-root"
            onClick={() => saveFlow({ id: `sf-${Date.now()}`, label: 'Node' })}
          >
            + Start flow
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sf-wrap">
      {presetBar}
      <div style={{ position: 'relative', width: cw, height: ch }}>
        {/* SVG edge layer */}
        <svg style={{ position: 'absolute', inset: 0, width: cw, height: ch, overflow: 'visible', pointerEvents: 'none' }}>
          {edges.map(([parent, child], i) => {
            const fp = layout.get(parent.id);
            const cp = layout.get(child.id);
            if (!fp || !cp) return null;
            const x1 = fp.x + SNW, y1 = fp.cy;
            const x2 = cp.x,       y2 = cp.cy;
            const mx = (x1 + x2) / 2;
            return (
              <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none" stroke="#DEDDDA" strokeWidth={1.5} />
            );
          })}
        </svg>

        {/* Cards + shape pickers */}
        {nodes.map(n => {
          const pos = layout.get(n.id);
          if (!pos) return null;
          const shape     = (n.shape ?? 'rect') as FlowShape;
          const isSel     = selId   === n.id;
          const isHovered = hoverId === n.id;
          const isEditing = editId  === n.id;
          const isDiamond = shape   === 'diamond';

          // SVG stroke reflects selection/hover state
          const stroke      = isSel ? '#1A1A1A' : isHovered ? '#AEADA8' : '#DEDDDA';
          const strokeWidth = isSel ? 1.5 : 1;

          return (
            <Fragment key={n.id}>
              {/* Card: transparent wrapper — shape lives in the SVG below */}
              <div
                className="sf-card"
                style={{ position: 'absolute', left: pos.x, top: pos.cy - SNH / 2, width: SNW, height: SNH }}
                onClick={() => setSelId(isSel ? null : n.id)}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                {/* SVG shape background — morphs between shapes */}
                <svg
                  style={{ position: 'absolute', inset: 0, width: SNW, height: SNH, overflow: 'visible', pointerEvents: 'none' }}
                >
                  <motion.path
                    animate={{ d: SHAPE_PATHS[shape], stroke, strokeWidth }}
                    transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                    fill="#FEFCF8"
                  />
                </svg>

                {/* Content — padded to stay within the visible shape interior */}
                <div
                  className="sf-card-content"
                  style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', ...SHAPE_INSET[shape] }}
                >
                  {isDiamond ? (
                    /* Diamond: centered label + actions, no textarea */
                    <div className="sf-card-diamond">
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="sf-label-input"
                          autoFocus
                          defaultValue={n.label}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          onBlur={() => commitLabel(n.id)}
                          onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === 'Enter')  { e.preventDefault(); commitLabel(n.id); }
                            if (e.key === 'Escape') setEditId(null);
                          }}
                        />
                      ) : (
                        <span
                          className="sf-label sf-label-diamond"
                          onDoubleClick={e => { e.stopPropagation(); setEditId(n.id); }}
                        >{n.label}</span>
                      )}
                      <div
                        className="sf-card-actions"
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <button className="sf-btn sf-btn-add" title="Add child" onClick={() => addChild(n.id)}>+</button>
                        <button className="sf-btn sf-btn-del" title="Delete" onClick={() => deleteNodeById(n.id)}>×</button>
                      </div>
                    </div>
                  ) : (
                    /* Standard: header + textarea */
                    <>
                      <div className="sf-card-header">
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            className="sf-label-input"
                            autoFocus
                            defaultValue={n.label}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                            onBlur={() => commitLabel(n.id)}
                            onKeyDown={e => {
                              e.stopPropagation();
                              if (e.key === 'Enter')  { e.preventDefault(); commitLabel(n.id); }
                              if (e.key === 'Escape') setEditId(null);
                            }}
                          />
                        ) : (
                          <span
                            className="sf-label"
                            onDoubleClick={e => { e.stopPropagation(); setEditId(n.id); }}
                          >{n.label}</span>
                        )}
                        <div
                          className="sf-card-actions"
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                        >
                          <button className="sf-btn sf-btn-add" title="Add child" onClick={() => addChild(n.id)}>+</button>
                          <button className="sf-btn sf-btn-del" title="Delete" onClick={() => deleteNodeById(n.id)}>×</button>
                        </div>
                      </div>
                      <textarea
                        className="sf-content"
                        defaultValue={n.content ?? ''}
                        placeholder="Notes…"
                        onClick={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onBlur={e => commitContent(n.id, e.target.value)}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Shape picker — appears below selected card */}
              <AnimatePresence>
                {isSel && (
                  <div style={{
                    position: 'absolute',
                    left: pos.x + SNW / 2,
                    top: pos.cy + SNH / 2 + 8,
                    transform: 'translateX(-50%)',
                    zIndex: 10,
                  }}>
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                    >
                      <ShapePicker current={shape} onSelect={s => changeShape(n.id, s)} />
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </Fragment>
          );
        })}

        {/* Legend toggle — bottom-right corner */}
        <Legend />
      </div>
    </div>
  );
}

// ── ExpandedNode ─────────────────────────────────────────────────────────────

export function ExpandedNode({ node, onClose }: Props) {
  return (
    <>
      <motion.div
        className="en-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        layoutId={`node-morph-${node.id}`}
        className="en-panel"
      >
        <div className="en-header">
          <span className="en-title">{node.label}</span>
          <button className="en-close" onClick={onClose}><X size={13} /></button>
        </div>
        <motion.div
          className="en-flow-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 0.15, duration: 0.18 }}
        >
          <SubFlow root={node} />
        </motion.div>
      </motion.div>
    </>
  );
}
