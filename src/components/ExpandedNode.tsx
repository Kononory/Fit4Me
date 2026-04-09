import { useRef, useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { TreeNode } from '../types';
import { flattenTree, collectEdges } from '../layout';
import { useStore } from '../store';

interface Props {
  node: TreeNode;
  onClose: () => void;
}

// SubFlow layout constants — card-sized nodes with room for content
const SNW  = 240;  // card width
const SNH  = 120;  // card height
const SLW  = 296;  // column spacing (SNW + 56px gap)
const SRH  = 144;  // row spacing   (SNH + 24px gap)
const SPAD = 40;   // canvas padding

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

function SubFlow({ root }: { root: TreeNode }) {
  const { updateActiveTree, getActive, pushUndo } = useStore();
  const [selId,  setSelId]  = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const layout = useMemo(() => computeLayout(root), [root]);
  const nodes  = useMemo(() => flattenTree(root),   [root]);
  const edges  = useMemo(() => collectEdges(root),  [root]);

  const vals = [...layout.values()];
  const cw = Math.max(...vals.map(p => p.x + SNW)) + SPAD;
  const ch = Math.max(...vals.map(p => p.cy + SNH / 2)) + SPAD;

  const commitLabel = useCallback((n: TreeNode) => {
    const val = (inputRef.current?.value ?? '').trim() || n.label;
    if (val !== n.label) {
      pushUndo();
      n.label = val;
      updateActiveTree(getActive().tree);
    }
    setEditId(null);
  }, [getActive, pushUndo, updateActiveTree]);

  return (
    <div style={{ position: 'relative', width: cw, height: ch }}>
      {/* SVG edge layer */}
      <svg
        style={{ position: 'absolute', inset: 0, width: cw, height: ch, overflow: 'visible', pointerEvents: 'none' }}
      >
        {edges.map(([parent, child], i) => {
          const fp = layout.get(parent.id);
          const cp = layout.get(child.id);
          if (!fp || !cp) return null;
          const x1 = fp.x + SNW, y1 = fp.cy;
          const x2 = cp.x,       y2 = cp.cy;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              stroke="#DEDDDA"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>

      {/* Card nodes */}
      {nodes.map(n => {
        const pos = layout.get(n.id);
        if (!pos) return null;
        const isSel     = selId  === n.id;
        const isEditing = editId === n.id;
        return (
          <div
            key={n.id}
            className={`sf-card${isSel ? ' sf-active' : ''}`}
            style={{ left: pos.x, top: pos.cy - SNH / 2, width: SNW, height: SNH, position: 'absolute' }}
            onClick={() => setSelId(isSel ? null : n.id)}
          >
            {/* Label row */}
            <div className="sf-card-header">
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="sf-label-input"
                  autoFocus
                  defaultValue={n.label}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  onBlur={() => commitLabel(n)}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter')  { e.preventDefault(); commitLabel(n); }
                    if (e.key === 'Escape') setEditId(null);
                  }}
                />
              ) : (
                <span
                  className="sf-label"
                  onDoubleClick={e => { e.stopPropagation(); setEditId(n.id); }}
                >
                  {n.label}
                </span>
              )}
            </div>

            {/* Content area */}
            <textarea
              className="sf-content"
              defaultValue={n.content ?? ''}
              placeholder="Notes…"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onBlur={e => {
                const val = e.target.value;
                if (val !== (n.content ?? '')) {
                  pushUndo();
                  n.content = val;
                  updateActiveTree(getActive().tree);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ExpandedNode({ node, onClose }: Props) {
  return (
    <>
      {/* Blurred backdrop — click collapses */}
      <motion.div
        className="en-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      {/* Full-screen panel — morphs from compact node via layoutId FLIP */}
      <motion.div
        layoutId={`node-morph-${node.id}`}
        className="en-panel"
      >
        <div className="en-header">
          <span className="en-title">{node.label}</span>
          <button className="en-close" onClick={onClose}><X size={13} /></button>
        </div>

        {/* Flow canvas fades in after the morph animation settles */}
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
