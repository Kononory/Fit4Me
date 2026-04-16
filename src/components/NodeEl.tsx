import { useRef, useCallback, useState } from 'react';
import { motion } from 'motion/react';
import { Link2, X } from 'lucide-react';
import type { TreeNode } from '../types';
import { parseFigmaInput, encodeRef } from '../lib/figma';
import { NW, NH, topY } from '../layout';
import { useStore } from '../store';
import { useLongPress } from '../hooks/useLongPress';

interface Props {
  node: TreeNode;
  state: 'act' | 'par' | 'dim' | 'def';
  onDragBegin: (n: TreeNode, el: HTMLElement, cx: number, cy: number, mode?: 'swap' | 'connect', forceRef?: boolean) => void;
  onSelect: (n: TreeNode) => void;
  onToggleMulti: () => void;
  onAddSibling: (n: TreeNode) => void;
  multiSel: boolean;
  editNodeId: string | null;
  onEditDone: () => void;
  onFigmaLink: (n: TreeNode, ref: string | null) => void;
  onCarouselOpen?: (n: TreeNode) => void;
  onLongPress?: (n: TreeNode) => void;
}

const canConnect = (n: TreeNode) => n.type !== 'nav';

export function NodeEl({ node: n, state, multiSel, onDragBegin, onSelect, onToggleMulti, onAddSibling, editNodeId, onEditDone, onFigmaLink, onCarouselOpen, onLongPress }: Props) {
    const { updateActiveTree, getActive, setSel, setSelNodeId } = useStore();
    const tapTimer = useRef(0);
    const tapId    = useRef<string | null>(null);
    const lp = useLongPress(() => onLongPress?.(n), 400);
    const inputRef = useRef<HTMLInputElement>(null);
    const linkInputRef = useRef<HTMLInputElement>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [linkVal, setLinkVal] = useState('');

    const isEditing = editNodeId === n.id;

    const cls = ['nd'];
    if (n.type === 'root') cls.push('t-root');
    if (n.type === 'nav')  cls.push('t-nav');
    if (n.type === 'tab')  cls.push('t-tab');
    if (state === 'act')       cls.push('s-active');
    else if (state === 'par')  cls.push('s-partial');
    else if (state === 'dim')  cls.push('s-dim');
    if (multiSel)              cls.push('s-multi');

    const commitEdit = useCallback(() => {
      const val = (inputRef.current?.value ?? '').trim() || n.label;
      n.label = val;
      updateActiveTree(getActive().tree);
      onEditDone();
    }, [n, getActive, updateActiveTree, onEditDone]);

    const handleClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      // Suppress click that fires immediately after a long press
      if (lp.didFireRef.current) { lp.didFireRef.current = false; return; }
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
        if (n.screens?.length) onCarouselOpen?.(n);
        if (n.b) {
          const { sel, selNodeId } = useStore.getState();
          if (sel === n.b && selNodeId === n.id) { setSel(null); setSelNodeId(null); }
          else { setSel(n.b); setSelNodeId(n.id); }
        } else {
          const { selNodeId: sid } = useStore.getState();
          if (sid === n.id) { setSel(null); setSelNodeId(null); }
          else              { setSel(n.id); setSelNodeId(n.id); }
        }
      }, 270);
    }, [n, onSelect, onToggleMulti, onCarouselOpen, setSel, setSelNodeId]);


    return (
      <motion.div
        layoutId={`node-morph-${n.id}`}
        className={cls.join(' ')}
        data-nid={n.id}
        style={{ left: n.x, top: topY(n), width: NW, height: NH, position: 'absolute' }}
        onPointerDown={lp.onPointerDown}
        onPointerUp={lp.onPointerUp}
        onPointerLeave={lp.onPointerLeave}
        onPointerMove={lp.onPointerMove}
        onMouseDown={e => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onDragBegin(n, e.currentTarget, e.clientX, e.clientY);
        }}
        onTouchStart={e => {
          const t = e.touches[0];
          onDragBegin(n, e.currentTarget as HTMLElement, t.clientX, t.clientY);
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
          <span className="nd-lbl">
            {n.label}
            {n.screens?.length ? <span className="nd-screen-count">·{n.screens.length}</span> : null}
          </span>
        )}
        {n.sublabel && <span className="sub">{n.sublabel}</span>}

        {/* Right-center + handle — click adds child, drag connects/reparents */}
        {canConnect(n) && (
          <div
            className="nd-handle nd-handle-add-child"
            onMouseDown={e => {
              e.stopPropagation();
              onDragBegin(n, e.currentTarget.parentElement as HTMLElement, e.clientX, e.clientY, 'connect', e.altKey);
            }}
            onClick={e => e.stopPropagation()}
          />
        )}

        {/* Bottom-center handle — click adds sibling below */}
        {n.type !== 'root' && n.type !== 'nav' && (
          <div
            className="nd-handle nd-handle-add-sib"
            onClick={e => { e.stopPropagation(); onAddSibling(n); }}
            onMouseDown={e => e.stopPropagation()}
          />
        )}

        {/* Figma action bar — visible when node is selected */}
        {state === 'act' && !isLinking && (
          <div className="nd-figma-bar" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <button className="nd-figma-btn" title={n.screens?.length ? 'Change primary Figma frame' : 'Link Figma frame'}
              onClick={() => { setLinkVal(n.screens?.[0]?.ref ?? ''); setIsLinking(true); }}>
              <Link2 size={10} />
            </button>
            {n.screens?.length ? (
              <button className="nd-figma-btn nd-figma-btn-remove" title="Remove Figma link"
                onClick={() => onFigmaLink(n, null)}>
                <X size={10} />
              </button>
            ) : null}
          </div>
        )}

        {/* Figma link input */}
        {state === 'act' && isLinking && (
          <div className="nd-figma-input-wrap" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <input
              ref={linkInputRef}
              className="nd-figma-input"
              autoFocus
              value={linkVal}
              onChange={e => setLinkVal(e.target.value)}
              placeholder="Figma URL or fileKey||nodeId"
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  const parsed = parseFigmaInput(linkVal);
                  if (parsed) { onFigmaLink(n, encodeRef(parsed.fileKey, parsed.nodeId)); setIsLinking(false); }
                }
                if (e.key === 'Escape') setIsLinking(false);
              }}
            />
            <button className="nd-figma-btn" title="Save" onClick={() => {
              const parsed = parseFigmaInput(linkVal);
              if (parsed) { onFigmaLink(n, encodeRef(parsed.fileKey, parsed.nodeId)); setIsLinking(false); }
            }}><Link2 size={10} /></button>
            <button className="nd-figma-btn" title="Cancel" onClick={() => setIsLinking(false)}><X size={10} /></button>
          </div>
        )}
      </motion.div>
    );
}
