import { useRef, useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { TreeNode } from '../types';
import { flattenTree, collectEdges } from '../layout';
import { addChildNode, removeNode, findNode, cloneTree } from '../tree';
import { useStore } from '../store';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface Props {
  node: TreeNode;
  onClose: () => void;
}

// SubFlow layout constants — card-sized nodes
const SNW  = 240;  // card width
const SNH  = 120;  // card height
const SLW  = 296;  // column spacing
const SRH  = 144;  // row spacing
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

  // Inner flow is completely independent from the main tree structure
  const [flow, setFlow] = useState<TreeNode | null>(() => root.innerFlow ?? null);
  const [selId,  setSelId]  = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const prevRoot   = useRef(root);

  // Sync with root.innerFlow when the parent re-renders (e.g. after main-tree undo)
  if (prevRoot.current !== root) {
    prevRoot.current = root;
    setFlow(root.innerFlow ?? null);
  }

  // Keep root.innerFlow in sync whenever flow state changes
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

  const layout = useMemo(() => flow ? computeLayout(flow) : new Map<string, SFPos>(), [flow]);
  const nodes  = useMemo(() => flow ? flattenTree(flow)  : [], [flow]);
  const edges  = useMemo(() => flow ? collectEdges(flow) : [], [flow]);

  const posVals = [...layout.values()];
  const cw = posVals.length ? Math.max(...posVals.map(p => p.x + SNW)) + SPAD : 320;
  const ch = posVals.length ? Math.max(...posVals.map(p => p.cy + SNH / 2)) + SPAD : 260;

  if (!flow) {
    return (
      <div className="flex min-h-[260px] items-center justify-center">
        <Button
          variant="outline"
          className="border-dashed text-muted-foreground hover:text-foreground"
          onClick={() => saveFlow({ id: `sf-${Date.now()}`, label: 'Node' })}
        >
          + Start flow
        </Button>
      </div>
    );
  }

  return (
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

      {/* Card nodes */}
      {nodes.map(n => {
        const pos = layout.get(n.id);
        if (!pos) return null;
        const isSel     = selId  === n.id;
        const isEditing = editId === n.id;
        return (
          <div
            key={n.id}
            className={cn(
              "absolute flex flex-col overflow-hidden rounded-md border bg-card font-mono text-card-foreground transition-colors hover:border-muted-foreground",
              isSel && "border-foreground shadow-[0_0_0_1px] shadow-foreground"
            )}
            style={{ left: pos.x, top: pos.cy - SNH / 2, width: SNW, height: SNH, position: 'absolute' }}
            onClick={() => setSelId(isSel ? null : n.id)}
          >
            {/* Header: label + action buttons */}
            <div className="flex shrink-0 items-center gap-1 border-b border-border px-2.5 py-[6px]">
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none border-none p-0"
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
                  className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold select-none"
                  onDoubleClick={e => { e.stopPropagation(); setEditId(n.id); }}
                >
                  {n.label}
                </span>
              )}
              <div
                className="flex shrink-0 gap-0.5"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
              >
                <Button variant="ghost" size="icon-xs" className="hover:bg-transparent hover:text-foreground" title="Add child" onClick={() => addChild(n.id)}>+</Button>
                <Button variant="ghost" size="icon-xs" className="hover:bg-destructive/10 hover:text-destructive" title="Delete" onClick={() => deleteNodeById(n.id)}>×</Button>
              </div>
            </div>

            {/* Content textarea */}
            <textarea
              className="flex-1 w-full resize-none border-none bg-transparent p-2.5 text-[10px] leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50"
              defaultValue={n.content ?? ''}
              placeholder="Notes…"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onBlur={e => commitContent(n.id, e.target.value)}
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
      <motion.div
        className="fixed inset-0 z-[150] bg-black/[0.18] backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        layoutId={`node-morph-${node.id}`}
        className="fixed inset-0 z-[155] flex flex-col overflow-hidden bg-background font-mono"
      >
        <div className="flex h-11 shrink-0 items-center gap-3 border-b-[1.5px] border-foreground px-4">
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold tracking-[0.02em]">{node.label}</span>
          <Button variant="outline" size="icon-xs" onClick={onClose}><X size={13} /></Button>
        </div>
        <motion.div
          className="flex-1 overflow-auto p-10"
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
