import { useRef, useCallback } from 'react';
import type { TreeNode } from '../types';
import { NW, NH, topY } from '../layout';
import { removeNode } from '../tree';
import { useStore } from '../store';

interface Props {
  node: TreeNode;
  state: 'act' | 'par' | 'dim' | 'def';
  onDragBegin: (n: TreeNode, el: HTMLElement, cx: number, cy: number, mode?: 'swap' | 'connect', forceRef?: boolean) => void;
  onSelect: (n: TreeNode) => void;
  onToggleMulti: () => void;
  multiSel: boolean;
  editNodeId: string | null;
  onEditDone: () => void;
}

const canConnect = (n: TreeNode) => n.type !== 'nav';

export function NodeEl({ node: n, state, multiSel, onDragBegin, onSelect, onToggleMulti, editNodeId, onEditDone }: Props) {
    const { pushUndo, updateActiveTree, getActive, setSel, setSelNodeId, triggerEdgeAnim } = useStore();
    const tapTimer = useRef(0);
    const tapId    = useRef<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const isEditing = editNodeId === n.id;

    const cls = ['nd'];
    if (n.type === 'root') cls.push('t-root');
    if (n.type === 'nav')  cls.push('t-nav');
    if (n.type === 'tab')  cls.push('t-tab');
    if (state === 'act')       cls.push('s-active');
    else if (state === 'par')  cls.push('s-partial');
    else if (state === 'dim')  cls.push('s-dim');
    if (multiSel)              cls.push('s-multi');

    const handleDelete = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      const childCount = (n.c ?? []).length;
      const msg = childCount > 0
        ? `Delete "${n.label}" and its ${childCount} child block(s)?`
        : `Delete "${n.label}"?`;
      if (!confirm(msg)) return;
      pushUndo();
      const flow = getActive();
      removeNode(flow.tree, n.id);
      triggerEdgeAnim();
      updateActiveTree(flow.tree);
    }, [n, pushUndo, getActive, updateActiveTree, triggerEdgeAnim]);

    const commitEdit = useCallback(() => {
      const val = (inputRef.current?.value ?? '').trim() || n.label;
      n.label = val;
      updateActiveTree(getActive().tree);
      onEditDone();
    }, [n, getActive, updateActiveTree, onEditDone]);

    const handleClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      // Shift+click → toggle multi-selection
      if (e.shiftKey) { onToggleMulti(); return; }
      if (tapTimer.current && tapId.current === n.id) {
        // Double-tap → inline rename
        clearTimeout(tapTimer.current); tapTimer.current = 0; tapId.current = null;
        onSelect(n);
        return;
      }
      tapId.current = n.id;
      tapTimer.current = window.setTimeout(() => {
        tapTimer.current = 0; tapId.current = null;
        if (n.b) {
          const { sel, selNodeId } = useStore.getState();
          if (sel === n.b && selNodeId === n.id) { setSel(null); setSelNodeId(null); }
          else { setSel(n.b); setSelNodeId(n.id); }
        } else {
          // No branch: use node id as selection key so the node still highlights
          const { selNodeId: sid } = useStore.getState();
          if (sid === n.id) { setSel(null); setSelNodeId(null); }
          else              { setSel(n.id); setSelNodeId(n.id); }
        }
      }, 270);
    }, [n, onSelect, onToggleMulti, setSel, setSelNodeId]);

    return (
      <div
        className={cls.join(' ')}
        data-nid={n.id}
        style={{ left: n.x, top: topY(n), width: NW, height: NH, position: 'absolute' }}
        onMouseEnter={() => { const h = document.getElementById('hint'); if (h) h.style.opacity = '1'; }}
        onMouseLeave={() => { const h = document.getElementById('hint'); if (h) h.style.opacity = '0'; }}
        onMouseDown={e => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onDragBegin(n, e.currentTarget, e.clientX, e.clientY);
        }}
        onTouchStart={e => {
          const t = e.touches[0];
          onDragBegin(n, e.currentTarget, t.clientX, t.clientY);
        }}
        onClick={handleClick}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            className="nd-input"
            autoFocus
            defaultValue={n.label}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onBlur={commitEdit}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { onEditDone(); }
            }}
          />
        ) : (
          <span className="nd-lbl">{n.label}</span>
        )}
        {n.sublabel && <span className="sub">{n.sublabel}</span>}

        {/* + handle — click adds child, drag connects/reparents */}
        {canConnect(n) && (
          <div
            className="nd-handle nd-handle-add"
            onMouseDown={e => {
              e.stopPropagation();
              onDragBegin(n, e.currentTarget.parentElement as HTMLElement, e.clientX, e.clientY, 'connect', e.altKey);
            }}
            onClick={e => e.stopPropagation()}
          >+</div>
        )}

        {/* × handle — deletes node */}
        {n.type !== 'root' && n.type !== 'nav' && (
          <div className="nd-handle nd-handle-del" onClick={handleDelete}>×</div>
        )}
      </div>
    );
}
